import { NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/youtube';

interface PlaylistItemsResponse {
  nextPageToken?: string;
  items?: {
    snippet: {
      publishedAt: string;
      resourceId: { videoId: string };
    };
  }[];
}

interface VideosListResponse {
  items?: {
    id: string;
    contentDetails: { duration: string };
  }[];
}

interface AnalyticsReportResponse {
  rows?: (string | number)[][];
  error?: { message: string; code?: number };
}

function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseDurationSeconds(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (Number(m[1] ?? 0) * 3600) + (Number(m[2] ?? 0) * 60) + Number(m[3] ?? 0);
}

async function getUploadsPlaylistId(accessToken: string): Promise<string> {
  const url = new URL('https://www.googleapis.com/youtube/v3/channels');
  url.searchParams.set('part', 'contentDetails');
  url.searchParams.set('mine', 'true');
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json() as {
    items?: { contentDetails: { relatedPlaylists: { uploads: string } } }[];
    error?: { message: string };
  };
  if (!res.ok || !data.items?.[0]) {
    throw new Error(`channels.list failed: ${data.error?.message ?? res.status}`);
  }
  return data.items[0].contentDetails.relatedPlaylists.uploads;
}

async function fetchRecentVideoIds(
  playlistId: string,
  windowStart: Date,
  accessToken: string,
): Promise<string[]> {
  const videoIds: string[] = [];
  let pageToken: string | undefined;

  outer: do {
    const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    url.searchParams.set('playlistId', playlistId);
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('maxResults', '50');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json() as PlaylistItemsResponse;

    for (const item of data.items ?? []) {
      const published = new Date(item.snippet.publishedAt);
      if (published < windowStart) break outer;
      videoIds.push(item.snippet.resourceId.videoId);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return videoIds;
}

async function classifyVideos(
  videoIds: string[],
  accessToken: string,
): Promise<{ longForms: number; shorts: number }> {
  if (videoIds.length === 0) return { longForms: 0, shorts: 0 };

  const chunks: string[][] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    chunks.push(videoIds.slice(i, i + 50));
  }

  let longForms = 0;
  let shorts = 0;

  for (const chunk of chunks) {
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('id', chunk.join(','));
    url.searchParams.set('part', 'contentDetails');
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json() as VideosListResponse;
    for (const item of data.items ?? []) {
      const sec = parseDurationSeconds(item.contentDetails.duration);
      if (sec <= 60) shorts++;
      else longForms++;
    }
  }

  return { longForms, shorts };
}

async function fetchAnalyticsMetric(
  metric: string,
  startDate: string,
  endDate: string,
  accessToken: string,
): Promise<number | { scopeError: true }> {
  const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
  url.searchParams.set('ids', 'channel==MINE');
  url.searchParams.set('startDate', startDate);
  url.searchParams.set('endDate', endDate);
  url.searchParams.set('metrics', metric);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 403) return { scopeError: true };

  const data = await res.json() as AnalyticsReportResponse;
  if (!res.ok) {
    throw new Error(`YouTube Analytics API error: ${data.error?.message ?? res.status}`);
  }

  const value = data.rows?.[0]?.[0];
  return value !== undefined ? Number(value) : 0;
}

type WatchTimeSuccess = {
  longFormMinutes: number;
  shortsMinutes: number;
  watchTimeUrl: string;
  watchTimeRaw: AnalyticsReportResponse;
};

async function fetchWatchTimeByContentType(
  startDate: string,
  endDate: string,
  accessToken: string,
): Promise<WatchTimeSuccess | { scopeError: true }> {
  const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
  url.searchParams.set('ids', 'channel==MINE');
  url.searchParams.set('startDate', startDate);
  url.searchParams.set('endDate', endDate);
  url.searchParams.set('dimensions', 'creatorContentType');
  url.searchParams.set('metrics', 'estimatedMinutesWatched');

  console.log('[founder-report] watch time URL:', url.toString());

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 403) return { scopeError: true };

  const data = await res.json() as AnalyticsReportResponse;
  console.log('[founder-report] watch time raw response:', JSON.stringify(data, null, 2));

  if (!res.ok) {
    throw new Error(`YouTube Analytics API error: ${data.error?.message ?? res.status}`);
  }

  let longFormMinutes = 0;
  let shortsMinutes = 0;

  for (const row of data.rows ?? []) {
    const contentType = String(row[0]);
    const minutes = Number(row[1]);
    if (contentType === 'VIDEO_ON_DEMAND') longFormMinutes = minutes;
    else if (contentType === 'SHORTS') shortsMinutes = minutes;
  }

  return { longFormMinutes, shortsMinutes, watchTimeUrl: url.toString(), watchTimeRaw: data };
}

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const windowDays = searchParams.get('window') === '30' ? 30 : 7;
  const debug = searchParams.get('debug') === '1';

  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - windowDays);

  const startDate = toYMD(windowStart);
  const endDate = toYMD(now);

  try {
    const accessToken = await getAccessToken();

    const uploadsPlaylistId = await getUploadsPlaylistId(accessToken);
    const videoIds = await fetchRecentVideoIds(uploadsPlaylistId, windowStart, accessToken);
    const { longForms: longFormsPublished, shorts: shortsPublished } = await classifyVideos(videoIds, accessToken);

    const subscribersResult = await fetchAnalyticsMetric(
      'subscribersGained', startDate, endDate, accessToken,
    );
    if (typeof subscribersResult === 'object' && subscribersResult.scopeError) {
      return NextResponse.json({
        error: 'YouTube Analytics scope not authorized — channel owner needs to re-authorize OAuth with yt-analytics.readonly scope',
      });
    }

    const watchTimeResult = await fetchWatchTimeByContentType(startDate, endDate, accessToken);
    if ('scopeError' in watchTimeResult) {
      return NextResponse.json({
        error: 'YouTube Analytics scope not authorized — channel owner needs to re-authorize OAuth with yt-analytics.readonly scope',
      });
    }

    const { longFormMinutes, shortsMinutes, watchTimeUrl, watchTimeRaw } = watchTimeResult;

    return NextResponse.json({
      longFormsPublished,
      shortsPublished,
      newSubscribers: subscribersResult,
      longFormWatchTimeHours: Math.round(longFormMinutes / 60 * 10) / 10,
      shortsWatchTimeHours: Math.round(shortsMinutes / 60 * 10) / 10,
      windowDays,
      generatedAt: now.toISOString(),
      ...(debug ? { _debug: { watchTimeUrl, watchTimeRaw } } : {}),
    });
  } catch (err) {
    console.error('[founder-report]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
