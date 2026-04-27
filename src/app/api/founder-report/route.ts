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
    status: { privacyStatus: string };
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
): Promise<{ longForms: number; shorts: number; longFormVideoIds: string[]; shortsVideoIds: string[] }> {
  if (videoIds.length === 0) return { longForms: 0, shorts: 0, longFormVideoIds: [], shortsVideoIds: [] };

  const chunks: string[][] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    chunks.push(videoIds.slice(i, i + 50));
  }

  const longFormVideoIds: string[] = [];
  const shortsVideoIds: string[] = [];

  for (const chunk of chunks) {
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('id', chunk.join(','));
    url.searchParams.set('part', 'contentDetails,status');
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json() as VideosListResponse;
    for (const item of data.items ?? []) {
      if (item.status?.privacyStatus !== 'public') continue;
      const sec = parseDurationSeconds(item.contentDetails.duration);
      if (sec <= 180) shortsVideoIds.push(item.id);
      else longFormVideoIds.push(item.id);
    }
  }

  return {
    longForms: longFormVideoIds.length,
    shorts: shortsVideoIds.length,
    longFormVideoIds,
    shortsVideoIds,
  };
}

async function fetchNetSubscribers(
  startDate: string,
  endDate: string,
  accessToken: string,
): Promise<number | { scopeError: true }> {
  const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
  url.searchParams.set('ids', 'channel==MINE');
  url.searchParams.set('startDate', startDate);
  url.searchParams.set('endDate', endDate);
  url.searchParams.set('metrics', 'subscribersGained,subscribersLost');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 403) return { scopeError: true };

  const data = await res.json() as AnalyticsReportResponse;
  if (!res.ok) {
    throw new Error(`YouTube Analytics API error: ${data.error?.message ?? res.status}`);
  }

  const row = data.rows?.[0];
  const gained = row ? Number(row[0]) : 0;
  const lost = row ? Number(row[1]) : 0;
  return gained - lost;
}

async function fetchMetricsByVideoIds(
  videoIds: string[],
  startDate: string,
  endDate: string,
  accessToken: string,
): Promise<{ minutes: number; views: number } | { scopeError: true }> {
  if (videoIds.length === 0) return { minutes: 0, views: 0 };

  const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
  url.searchParams.set('ids', 'channel==MINE');
  url.searchParams.set('startDate', startDate);
  url.searchParams.set('endDate', endDate);
  url.searchParams.set('metrics', 'estimatedMinutesWatched,views');
  url.searchParams.set('filters', `video==${videoIds.join(',')}`);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 403) return { scopeError: true };

  const data = await res.json() as AnalyticsReportResponse;
  if (!res.ok) {
    throw new Error(`YouTube Analytics API error: ${data.error?.message ?? res.status}`);
  }

  const row = data.rows?.[0];
  return {
    minutes: row ? Number(row[0]) : 0,
    views: row ? Number(row[1]) : 0,
  };
}

type MetricSnapshot = {
  longFormsPublished: number;
  shortsPublished: number;
  newSubscribers: number;
  longFormWatchTimeHours: number;
  shortsWatchTimeHours: number;
  longFormViews: number;
  shortsViews: number;
};

const CROSS_CHECK_METRICS: (keyof MetricSnapshot)[] = [
  'longFormsPublished', 'shortsPublished', 'newSubscribers',
  'longFormWatchTimeHours', 'shortsWatchTimeHours', 'longFormViews', 'shortsViews',
];

function validateReport(
  metrics: MetricSnapshot,
  longFormVideoIds: string[],
  shortsVideoIds: string[],
): string[] {
  const warnings: string[] = [];

  if (longFormVideoIds.length !== metrics.longFormsPublished || shortsVideoIds.length !== metrics.shortsPublished) {
    warnings.push('Video ID array length mismatch with published count — internal consistency error');
  }

  if (metrics.longFormsPublished > 0 && metrics.longFormWatchTimeHours === 0 && metrics.longFormViews === 0) {
    warnings.push('Long forms published but zero engagement — possible parser failure');
  }
  if (metrics.shortsPublished > 0 && metrics.shortsWatchTimeHours === 0 && metrics.shortsViews === 0) {
    warnings.push('Shorts published but zero engagement — possible parser failure');
  }

  return warnings;
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
    const {
      longForms: longFormsPublished,
      shorts: shortsPublished,
      longFormVideoIds,
      shortsVideoIds,
    } = await classifyVideos(videoIds, accessToken);

    const subscribersResult = await fetchNetSubscribers(startDate, endDate, accessToken);
    if (typeof subscribersResult === 'object' && subscribersResult.scopeError) {
      return NextResponse.json({
        error: 'YouTube Analytics scope not authorized — channel owner needs to re-authorize OAuth with yt-analytics.readonly scope',
      });
    }

    const longFormMetrics = await fetchMetricsByVideoIds(longFormVideoIds, startDate, endDate, accessToken);
    if ('scopeError' in longFormMetrics) {
      return NextResponse.json({
        error: 'YouTube Analytics scope not authorized — channel owner needs to re-authorize OAuth with yt-analytics.readonly scope',
      });
    }

    const shortsMetrics = await fetchMetricsByVideoIds(shortsVideoIds, startDate, endDate, accessToken);
    if ('scopeError' in shortsMetrics) {
      return NextResponse.json({
        error: 'YouTube Analytics scope not authorized — channel owner needs to re-authorize OAuth with yt-analytics.readonly scope',
      });
    }

    const longFormWatchTimeHours = Math.round(longFormMetrics.minutes / 60 * 10) / 10;
    const shortsWatchTimeHours = Math.round(shortsMetrics.minutes / 60 * 10) / 10;

    const currentMetrics: MetricSnapshot = {
      longFormsPublished,
      shortsPublished,
      newSubscribers: subscribersResult as number,
      longFormWatchTimeHours,
      shortsWatchTimeHours,
      longFormViews: longFormMetrics.views,
      shortsViews: shortsMetrics.views,
    };

    const warnings = validateReport(currentMetrics, longFormVideoIds, shortsVideoIds);

    if (debug) {
      const windowStart30 = new Date(now);
      windowStart30.setDate(windowStart30.getDate() - 30);
      const startDate30 = toYMD(windowStart30);

      const videoIds30 = await fetchRecentVideoIds(uploadsPlaylistId, windowStart30, accessToken);
      const {
        longForms: lf30,
        shorts: s30,
        longFormVideoIds: lfIds30,
        shortsVideoIds: sIds30,
      } = await classifyVideos(videoIds30, accessToken);

      const subs30Result = await fetchNetSubscribers(startDate30, endDate, accessToken);
      const subs30 = typeof subs30Result === 'number' ? subs30Result : 0;

      const lfMetrics30 = await fetchMetricsByVideoIds(lfIds30, startDate30, endDate, accessToken);
      const sMetrics30 = await fetchMetricsByVideoIds(sIds30, startDate30, endDate, accessToken);

      const metrics30: MetricSnapshot = {
        longFormsPublished: lf30,
        shortsPublished: s30,
        newSubscribers: subs30,
        longFormWatchTimeHours: 'scopeError' in lfMetrics30 ? 0 : Math.round(lfMetrics30.minutes / 60 * 10) / 10,
        shortsWatchTimeHours: 'scopeError' in sMetrics30 ? 0 : Math.round(sMetrics30.minutes / 60 * 10) / 10,
        longFormViews: 'scopeError' in lfMetrics30 ? 0 : lfMetrics30.views,
        shortsViews: 'scopeError' in sMetrics30 ? 0 : sMetrics30.views,
      };

      for (const metric of CROSS_CHECK_METRICS) {
        const val7 = currentMetrics[metric];
        const val30 = metrics30[metric];
        if (val30 < val7) {
          warnings.push(`${metric}: 30-day value (${val30}) less than 7-day value (${val7}) — date math may be wrong`);
        }
      }
    }

    const payload: Record<string, unknown> = {
      longFormsPublished,
      shortsPublished,
      newSubscribers: subscribersResult,
      longFormViews: currentMetrics.longFormViews,
      shortsViews: currentMetrics.shortsViews,
      longFormWatchTimeHours,
      shortsWatchTimeHours,
      windowDays,
      generatedAt: now.toISOString(),
    };

    if (debug) {
      payload._validation = { warnings, checkedAt: now.toISOString() };
    } else if (warnings.length > 0) {
      payload._validation = { warnings };
    }

    return NextResponse.json(payload);
  } catch (err) {
    console.error('[founder-report]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
