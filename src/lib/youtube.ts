import { supabase } from './supabase';

interface AnalyticsRow {
  date: string;
  views: number;
  likes: number;
  dislikes: number;
  comments: number;
  shares: number;
  estimatedMinutesWatched: number;
  averageViewDuration: number;
  averageViewPercentage: number;
  subscribersGained: number;
  subscribersLost: number;
}

interface TokenResponse {
  access_token?: string;
  error?: string;
}

interface AnalyticsResponse {
  columnHeaders?: { name: string; columnType: string; dataType: string }[];
  rows?: (string | number)[][];
  error?: { message: string };
}

export async function getAccessToken(): Promise<string> {
  const { data: auth, error: authError } = await supabase
    .from('youtube_auth')
    .select('refresh_token')
    .maybeSingle();

  if (authError || !auth) {
    throw new Error('No youtube_auth row found — re-consent required at /api/auth/url');
  }
  const refreshToken = (auth as { refresh_token: string }).refresh_token;
  if (!refreshToken) {
    throw new Error('youtube_auth row missing refresh_token — re-consent required at /api/auth/url');
  }

  console.log('[getAccessToken] sourced refresh_token from youtube_auth');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID!,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const data = await res.json() as TokenResponse;
  if (!res.ok || !data.access_token) {
    throw new Error(`Failed to get YouTube access token: ${data.error ?? res.status}`);
  }
  return data.access_token;
}

export async function fetchAnalyticsForVideo(
  videoId: string,
  startDate: string,
  endDate: string,
  accessToken: string
): Promise<AnalyticsRow[]> {
  const metrics = [
    'views',
    'likes',
    'dislikes',
    'comments',
    'shares',
    'estimatedMinutesWatched',
    'averageViewDuration',
    'averageViewPercentage',
    'subscribersGained',
    'subscribersLost',
  ].join(',');

  const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
  url.searchParams.set('ids', 'channel==MINE');
  url.searchParams.set('startDate', startDate);
  url.searchParams.set('endDate', endDate);
  url.searchParams.set('metrics', metrics);
  url.searchParams.set('dimensions', 'day');
  url.searchParams.set('filters', `video==${videoId}`);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await res.json() as AnalyticsResponse;
  if (!res.ok) {
    throw new Error(`YouTube Analytics API error for ${videoId}: ${data.error?.message ?? res.status}`);
  }

  const headers = (data.columnHeaders ?? []).map((h) => h.name);
  const idx = (name: string) => headers.indexOf(name);

  return (data.rows ?? []).map((row) => ({
    date:                    row[idx('day')] as string,
    views:                   Number(row[idx('views')]),
    likes:                   Number(row[idx('likes')]),
    dislikes:                Number(row[idx('dislikes')]),
    comments:                Number(row[idx('comments')]),
    shares:                  Number(row[idx('shares')]),
    estimatedMinutesWatched: Number(row[idx('estimatedMinutesWatched')]),
    averageViewDuration:     Number(row[idx('averageViewDuration')]),
    averageViewPercentage:   Number(row[idx('averageViewPercentage')]),
    subscribersGained:       Number(row[idx('subscribersGained')]),
    subscribersLost:         Number(row[idx('subscribersLost')]),
  }));
}

export interface VideoMetadata {
  videoId: string;
  title: string;
  publishedAt: string;
  url: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
}

interface VideoMetadataResponse {
  items?: {
    id: string;
    snippet: {
      title: string;
      publishedAt: string;
      thumbnails: {
        maxres?: { url: string };
        high?: { url: string };
      };
    };
    contentDetails: {
      duration: string;
    };
  }[];
  error?: { message: string };
}

function parseDurationSeconds(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (Number(m[1] ?? 0) * 3600) + (Number(m[2] ?? 0) * 60) + Number(m[3] ?? 0);
}

export async function fetchVideoMetadata(
  videoIds: string[],
  accessToken: string
): Promise<Map<string, VideoMetadata>> {
  const map = new Map<string, VideoMetadata>();
  if (videoIds.length === 0) return map;

  const BATCH = 50;
  const returned = new Set<string>();

  for (let i = 0; i < videoIds.length; i += BATCH) {
    const batch = videoIds.slice(i, i + BATCH);
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('id', batch.join(','));
    url.searchParams.set('part', 'snippet,contentDetails');

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const data = await res.json() as VideoMetadataResponse;
    if (!res.ok) {
      throw new Error(`YouTube Data API error: ${data.error?.message ?? res.status}`);
    }

    for (const item of data.items ?? []) {
      returned.add(item.id);
      const { thumbnails } = item.snippet;
      map.set(item.id, {
        videoId: item.id,
        title: item.snippet.title,
        publishedAt: item.snippet.publishedAt,
        url: `https://www.youtube.com/shorts/${item.id}`,
        thumbnailUrl: thumbnails.maxres?.url ?? thumbnails.high?.url ?? null,
        durationSeconds: parseDurationSeconds(item.contentDetails.duration),
      });
    }
  }

  const missing = videoIds.filter((id) => !returned.has(id));
  if (missing.length > 0) {
    console.warn(`[youtube-metadata] missing ${missing.length} video(s):`, missing.join(', '));
  }

  return map;
}

export interface BreakdownConfig {
  name: string;
  apiDimensions: string;
  aggregate: boolean;
}

export interface BreakdownRow {
  dimensionValue: string;
  date: string;
  views: number;
  watchTimeMinutes: number;
  avgViewDurationSeconds: number;
}

export async function fetchBreakdownForVideo(
  videoId: string,
  config: BreakdownConfig,
  startDate: string,
  endDate: string,
  accessToken: string
): Promise<BreakdownRow[]> {
  const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
  url.searchParams.set('ids', 'channel==MINE');
  url.searchParams.set('startDate', startDate);
  url.searchParams.set('endDate', endDate);
  url.searchParams.set('dimensions', config.apiDimensions);
  url.searchParams.set('metrics', 'views,estimatedMinutesWatched,averageViewDuration');
  url.searchParams.set('filters', `video==${videoId}`);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await res.json() as AnalyticsResponse;
  if (!res.ok) {
    console.warn(`[breakdown] ${videoId}/${config.name}: ${data.error?.message ?? res.status} — skipping`);
    return [];
  }

  const headers = (data.columnHeaders ?? []).map((h) => h.name);
  const idx = (name: string) => headers.indexOf(name);

  return (data.rows ?? []).map((row) => {
    const date = config.aggregate ? endDate : row[idx('day')] as string;

    let dimensionValue: string;
    if (config.name === 'ageGroupGender') {
      dimensionValue = `${String(row[idx('ageGroup')] ?? '')}:${String(row[idx('gender')] ?? '')}`;
    } else if (config.aggregate) {
      dimensionValue = String(row[idx(config.apiDimensions)] ?? '');
    } else {
      const dimName = config.apiDimensions.split(',')[1];
      dimensionValue = String(row[idx(dimName)] ?? '');
    }

    return {
      date,
      dimensionValue,
      views: Number(row[idx('views')]),
      watchTimeMinutes: Number(row[idx('estimatedMinutesWatched')]),
      avgViewDurationSeconds: Number(row[idx('averageViewDuration')]),
    };
  });
}

// ── Discovery helpers (Phase 3a — see docs/superpowers/plans/2026-05-14-shorts-auto-discovery.md) ──

export interface VideoDiscoveryDetails {
  tags: string[];
  description: string;
  publishedAt: string;
  durationSeconds: number;
  privacyStatus: string;
}

interface VideoDiscoveryItem {
  id: string;
  snippet: { publishedAt: string; tags?: string[]; description?: string };
  contentDetails: { duration: string };
  status: { privacyStatus: string };
}

interface VideoDiscoveryResponse {
  items?: VideoDiscoveryItem[];
  error?: { message: string };
}

// Batches up to 50 IDs per call. Returns snippet.tags, publishedAt, parsed
// duration, and privacyStatus for each video. fileDetails.fileName was the
// original auto-map signal but YouTube no longer returns it for this channel
// (probe 2026-05-14) — see plan doc for the tag-based replacement.
export async function fetchVideoDiscoveryDetails(
  videoIds: string[],
  accessToken: string,
): Promise<Map<string, VideoDiscoveryDetails>> {
  const result = new Map<string, VideoDiscoveryDetails>();
  if (videoIds.length === 0) return result;

  const BATCH = 50;
  for (let i = 0; i < videoIds.length; i += BATCH) {
    const batch = videoIds.slice(i, i + BATCH);
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('id', batch.join(','));
    url.searchParams.set('part', 'snippet,contentDetails,status');

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = (await res.json()) as VideoDiscoveryResponse;
    if (!res.ok) {
      throw new Error(`YouTube videos.list error: ${data.error?.message ?? res.status}`);
    }

    for (const item of data.items ?? []) {
      result.set(item.id, {
        tags: item.snippet.tags ?? [],
        description: item.snippet.description ?? '',
        publishedAt: item.snippet.publishedAt,
        durationSeconds: parseDurationSeconds(item.contentDetails.duration),
        privacyStatus: item.status.privacyStatus,
      });
    }
  }

  return result;
}

interface ChannelsListResponse {
  items?: { contentDetails: { relatedPlaylists: { uploads: string } } }[];
  error?: { message: string };
}

interface PlaylistItemsResponse {
  items?: { contentDetails: { videoId: string } }[];
  nextPageToken?: string;
  error?: { message: string };
}

// Enumerates every video on the authenticated channel via the uploads playlist.
// 1 quota unit per page vs 100 per page for search.list. Channel ID is sourced
// from channels.list?mine=true on each call (Decision Q2 — no hardcode).
export async function listChannelVideoIds(accessToken: string): Promise<string[]> {
  const channelUrl = new URL('https://www.googleapis.com/youtube/v3/channels');
  channelUrl.searchParams.set('mine', 'true');
  channelUrl.searchParams.set('part', 'contentDetails');

  const channelRes = await fetch(channelUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const channelData = (await channelRes.json()) as ChannelsListResponse;
  if (!channelRes.ok) {
    throw new Error(`YouTube channels.list error: ${channelData.error?.message ?? channelRes.status}`);
  }
  const uploadsPlaylistId = channelData.items?.[0]?.contentDetails.relatedPlaylists.uploads;
  if (!uploadsPlaylistId) {
    throw new Error('No uploads playlist found for authenticated channel');
  }

  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    url.searchParams.set('playlistId', uploadsPlaylistId);
    url.searchParams.set('part', 'contentDetails');
    url.searchParams.set('maxResults', '50');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = (await res.json()) as PlaylistItemsResponse;
    if (!res.ok) {
      throw new Error(`YouTube playlistItems.list error: ${data.error?.message ?? res.status}`);
    }
    for (const item of data.items ?? []) {
      ids.push(item.contentDetails.videoId);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return ids;
}
