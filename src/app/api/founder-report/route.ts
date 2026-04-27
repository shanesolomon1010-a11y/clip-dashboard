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

// Videos published before this date are legacy gaming-era content excluded from
// views/watch time aggregation. Published counts and subscribers are unaffected.
const MBM_ERA_START = new Date('2025-01-01T00:00:00Z');

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

// Published counts only — filters to public videos published in the window.
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
    url.searchParams.set('part', 'contentDetails,status');
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json() as VideosListResponse;
    for (const item of data.items ?? []) {
      if (item.status?.privacyStatus !== 'public') continue;
      const sec = parseDurationSeconds(item.contentDetails.duration);
      if (sec <= 180) shorts++;
      else longForms++;
    }
  }

  return { longForms, shorts };
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

// Returns one row per video that had activity: [videoId, views, minutesWatched]
async function fetchViewsByVideoDimension(
  startDate: string,
  endDate: string,
  accessToken: string,
): Promise<{ rows: (string | number)[][] } | { scopeError: true }> {
  const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
  url.searchParams.set('ids', 'channel==MINE');
  url.searchParams.set('startDate', startDate);
  url.searchParams.set('endDate', endDate);
  url.searchParams.set('dimensions', 'video');
  url.searchParams.set('metrics', 'views,estimatedMinutesWatched');
  url.searchParams.set('maxResults', '200');
  url.searchParams.set('sort', '-views');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 403) return { scopeError: true };

  const data = await res.json() as AnalyticsReportResponse;
  if (!res.ok) {
    throw new Error(`YouTube Analytics API error: ${data.error?.message ?? res.status}`);
  }

  return { rows: data.rows ?? [] };
}

type VideoMeta = { durationSeconds: number; publishedAt: Date };

async function fetchDurationMap(
  videoIds: string[],
  accessToken: string,
): Promise<Map<string, VideoMeta>> {
  const map = new Map<string, VideoMeta>();
  if (videoIds.length === 0) return map;

  const chunks: string[][] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    chunks.push(videoIds.slice(i, i + 50));
  }

  for (const chunk of chunks) {
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('id', chunk.join(','));
    url.searchParams.set('part', 'contentDetails,snippet');
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json() as {
      items?: { id: string; contentDetails: { duration: string }; snippet: { publishedAt: string } }[];
    };
    for (const item of data.items ?? []) {
      map.set(item.id, {
        durationSeconds: parseDurationSeconds(item.contentDetails.duration),
        publishedAt: new Date(item.snippet.publishedAt),
      });
    }
  }

  return map;
}

function classifyAnalyticsRows(
  rows: (string | number)[][],
  durationMap: Map<string, VideoMeta>,
): {
  longFormViews: number;
  shortsViews: number;
  longFormMinutes: number;
  shortsMinutes: number;
  unclassifiableVideos: number;
  legacyVideosFiltered: number;
} {
  let longFormViews = 0;
  let shortsViews = 0;
  let longFormMinutes = 0;
  let shortsMinutes = 0;
  let unclassifiableVideos = 0;
  let legacyVideosFiltered = 0;

  for (const row of rows) {
    const videoId = String(row[0]);
    const views = Number(row[1]);
    const minutes = Number(row[2]);
    const entry = durationMap.get(videoId);

    if (entry === undefined) {
      unclassifiableVideos++;
      continue;
    }

    if (entry.publishedAt < MBM_ERA_START) {
      legacyVideosFiltered++;
      continue;
    }

    if (entry.durationSeconds <= 180) {
      shortsViews += views;
      shortsMinutes += minutes;
    } else {
      longFormViews += views;
      longFormMinutes += minutes;
    }
  }

  return { longFormViews, shortsViews, longFormMinutes, shortsMinutes, unclassifiableVideos, legacyVideosFiltered };
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
  analyticsRows: (string | number)[][],
  unclassifiableVideos: number,
): string[] {
  const warnings: string[] = [];

  if (analyticsRows.some((r) => r.length < 3)) {
    warnings.push('Watch time response shape unexpected');
  }

  if (metrics.longFormsPublished > 0 && metrics.longFormWatchTimeHours === 0 && metrics.longFormViews === 0) {
    warnings.push('Long forms published but zero engagement — possible parser failure');
  }
  if (metrics.shortsPublished > 0 && metrics.shortsWatchTimeHours === 0 && metrics.shortsViews === 0) {
    warnings.push('Shorts published but zero engagement — possible parser failure');
  }

  if (unclassifiableVideos > 0) {
    warnings.push(
      `${unclassifiableVideos} video${unclassifiableVideos === 1 ? '' : 's'} with views could not be classified by duration — likely deleted or private. View counts may be slightly underreported.`,
    );
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
    const { longForms: longFormsPublished, shorts: shortsPublished } = await classifyVideos(videoIds, accessToken);

    const subscribersResult = await fetchNetSubscribers(startDate, endDate, accessToken);
    if (typeof subscribersResult === 'object' && subscribersResult.scopeError) {
      return NextResponse.json({
        error: 'YouTube Analytics scope not authorized — channel owner needs to re-authorize OAuth with yt-analytics.readonly scope',
      });
    }

    const analyticsResult = await fetchViewsByVideoDimension(startDate, endDate, accessToken);
    if ('scopeError' in analyticsResult) {
      return NextResponse.json({
        error: 'YouTube Analytics scope not authorized — channel owner needs to re-authorize OAuth with yt-analytics.readonly scope',
      });
    }
    const { rows: analyticsRows } = analyticsResult;

    const analyticsVideoIds = Array.from(new Set(analyticsRows.map((r) => String(r[0]))));
    const durationMap = await fetchDurationMap(analyticsVideoIds, accessToken);

    const { longFormViews, shortsViews, longFormMinutes, shortsMinutes, unclassifiableVideos, legacyVideosFiltered } =
      classifyAnalyticsRows(analyticsRows, durationMap);

    const longFormWatchTimeHours = Math.round(longFormMinutes / 60 * 10) / 10;
    const shortsWatchTimeHours = Math.round(shortsMinutes / 60 * 10) / 10;

    const currentMetrics: MetricSnapshot = {
      longFormsPublished,
      shortsPublished,
      newSubscribers: subscribersResult as number,
      longFormWatchTimeHours,
      shortsWatchTimeHours,
      longFormViews,
      shortsViews,
    };

    const warnings = validateReport(currentMetrics, analyticsRows, unclassifiableVideos);

    if (debug) {
      const windowStart30 = new Date(now);
      windowStart30.setDate(windowStart30.getDate() - 30);
      const startDate30 = toYMD(windowStart30);

      const videoIds30 = await fetchRecentVideoIds(uploadsPlaylistId, windowStart30, accessToken);
      const { longForms: lf30, shorts: s30 } = await classifyVideos(videoIds30, accessToken);

      const subs30Result = await fetchNetSubscribers(startDate30, endDate, accessToken);
      const subs30 = typeof subs30Result === 'number' ? subs30Result : 0;

      const analytics30Result = await fetchViewsByVideoDimension(startDate30, endDate, accessToken);
      const rows30 = 'scopeError' in analytics30Result ? [] : analytics30Result.rows;
      const analyticsVideoIds30 = Array.from(new Set(rows30.map((r) => String(r[0]))));
      const durationMap30 = await fetchDurationMap(analyticsVideoIds30, accessToken);
      const classified30 = classifyAnalyticsRows(rows30, durationMap30);

      const metrics30: MetricSnapshot = {
        longFormsPublished: lf30,
        shortsPublished: s30,
        newSubscribers: subs30,
        longFormWatchTimeHours: Math.round(classified30.longFormMinutes / 60 * 10) / 10,
        shortsWatchTimeHours: Math.round(classified30.shortsMinutes / 60 * 10) / 10,
        longFormViews: classified30.longFormViews,
        shortsViews: classified30.shortsViews,
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
      longFormViews,
      shortsViews,
      longFormWatchTimeHours,
      shortsWatchTimeHours,
      windowDays,
      generatedAt: now.toISOString(),
    };

    if (debug) {
      payload._validation = {
        warnings,
        checkedAt: now.toISOString(),
        legacyVideosFiltered,
        mbmEraStart: MBM_ERA_START.toISOString(),
      };
    } else if (warnings.length > 0) {
      payload._validation = { warnings };
    }

    return NextResponse.json(payload);
  } catch (err) {
    console.error('[founder-report]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
