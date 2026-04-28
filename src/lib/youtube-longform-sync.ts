import { supabase } from './supabase';
import { getAccessToken } from './youtube';

const MBM_ERA_START = new Date('2025-01-01T00:00:00Z');
const LONGFORM_DURATION_THRESHOLD_SECONDS = 180;

interface LongFormVideo {
  video_id: string;
  title: string;
  duration_seconds: number;
  published_at: string;
  privacy_status: string;
  thumbnail_url: string | null;
}

interface PlaylistItemsResponse {
  nextPageToken?: string;
  items?: {
    snippet: {
      resourceId: { videoId: string };
    };
  }[];
  error?: { message: string };
}

interface VideosListResponse {
  items?: {
    id: string;
    snippet: {
      title: string;
      publishedAt: string;
      thumbnails: {
        high?: { url: string };
        medium?: { url: string };
        default?: { url: string };
      };
    };
    contentDetails: { duration: string };
    status: { privacyStatus: string };
  }[];
  error?: { message: string };
}

interface AnalyticsReportResponse {
  columnHeaders?: { name: string }[];
  rows?: (string | number)[][];
  error?: { message: string };
}

interface SyncErrorDetail {
  videoId: string;
  message: string;
}

export interface LongFormSyncSummary {
  discovered: number;
  synced: number;
  errors: number;
  errorDetails: SyncErrorDetail[];
}

function parseDurationSeconds(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (Number(m[1] ?? 0) * 3600) + (Number(m[2] ?? 0) * 60) + Number(m[3] ?? 0);
}

function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
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

async function fetchAllUploadVideoIds(
  playlistId: string,
  accessToken: string,
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    url.searchParams.set('playlistId', playlistId);
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('maxResults', '50');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json() as PlaylistItemsResponse;
    if (!res.ok) {
      throw new Error(`playlistItems.list failed: ${data.error?.message ?? res.status}`);
    }

    for (const item of data.items ?? []) {
      ids.push(item.snippet.resourceId.videoId);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return ids;
}

async function fetchVideoDetails(
  videoIds: string[],
  accessToken: string,
): Promise<LongFormVideo[]> {
  const out: LongFormVideo[] = [];

  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('id', chunk.join(','));
    url.searchParams.set('part', 'contentDetails,snippet,status');

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json() as VideosListResponse;
    if (!res.ok) {
      throw new Error(`videos.list failed: ${data.error?.message ?? res.status}`);
    }

    for (const item of data.items ?? []) {
      const durationSeconds = parseDurationSeconds(item.contentDetails.duration);
      const publishedAt = item.snippet.publishedAt;
      const privacyStatus = item.status.privacyStatus;

      if (durationSeconds <= LONGFORM_DURATION_THRESHOLD_SECONDS) continue;
      if (new Date(publishedAt) < MBM_ERA_START) continue;
      if (privacyStatus !== 'public') continue;

      const thumbs = item.snippet.thumbnails;
      const thumbnailUrl = thumbs.high?.url ?? thumbs.medium?.url ?? thumbs.default?.url ?? null;

      out.push({
        video_id: item.id,
        title: item.snippet.title,
        duration_seconds: durationSeconds,
        published_at: publishedAt,
        privacy_status: privacyStatus,
        thumbnail_url: thumbnailUrl,
      });
    }
  }

  return out;
}

async function upsertLongFormVideos(videos: LongFormVideo[]): Promise<void> {
  if (videos.length === 0) return;
  const { error } = await supabase
    .from('long_form_videos')
    .upsert(videos, { onConflict: 'video_id', ignoreDuplicates: false });
  if (error) throw error;
}

async function fetchLongFormVideosFromDb(): Promise<LongFormVideo[]> {
  const { data, error } = await supabase
    .from('long_form_videos')
    .select('video_id, title, duration_seconds, published_at, privacy_status, thumbnail_url');
  if (error) throw error;
  return (data ?? []) as LongFormVideo[];
}

interface DailyMetricRow {
  day: string;
  views: number;
  estimatedMinutesWatched: number;
  averageViewDuration: number;
  averageViewPercentage: number;
  subscribersGained: number;
  subscribersLost: number;
  likes: number;
  dislikes: number;
  comments: number;
  shares: number;
}

async function fetchDailyMetrics(
  videoId: string,
  startDate: string,
  endDate: string,
  accessToken: string,
): Promise<DailyMetricRow[]> {
  const metrics = [
    'views',
    'estimatedMinutesWatched',
    'averageViewDuration',
    'averageViewPercentage',
    'subscribersGained',
    'subscribersLost',
    'likes',
    'dislikes',
    'comments',
    'shares',
  ].join(',');

  const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
  url.searchParams.set('ids', 'channel==MINE');
  url.searchParams.set('startDate', startDate);
  url.searchParams.set('endDate', endDate);
  url.searchParams.set('dimensions', 'day');
  url.searchParams.set('metrics', metrics);
  url.searchParams.set('filters', `video==${videoId}`);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json() as AnalyticsReportResponse;
  if (!res.ok) {
    throw new Error(`Analytics API error for ${videoId}: ${data.error?.message ?? res.status}`);
  }

  const headers = (data.columnHeaders ?? []).map((h) => h.name);
  const idx = (name: string) => headers.indexOf(name);

  return (data.rows ?? []).map((row) => ({
    day:                     row[idx('day')] as string,
    views:                   Number(row[idx('views')] ?? 0),
    estimatedMinutesWatched: Number(row[idx('estimatedMinutesWatched')] ?? 0),
    averageViewDuration:     Number(row[idx('averageViewDuration')] ?? 0),
    averageViewPercentage:   Number(row[idx('averageViewPercentage')] ?? 0),
    subscribersGained:       Number(row[idx('subscribersGained')] ?? 0),
    subscribersLost:         Number(row[idx('subscribersLost')] ?? 0),
    likes:                   Number(row[idx('likes')] ?? 0),
    dislikes:                Number(row[idx('dislikes')] ?? 0),
    comments:                Number(row[idx('comments')] ?? 0),
    shares:                  Number(row[idx('shares')] ?? 0),
  }));
}

interface PostUpsertRow {
  clip_code: string;
  clip_details_code: null;
  content_id: string;
  content_type: 'long_form';
  platform: 'youtube';
  stat_date: string;
  duration_seconds: number;
  title: string;
  thumbnail_url: string | null;
  views: number;
  watch_time_minutes: number;
  watch_time_hours: number;
  avg_view_duration_seconds: number;
  avg_view_percentage: number | null;
  subscribers_gained: number;
  subscribers_lost: number;
  likes: number;
  dislikes: number;
  comments: number;
  shares: number;
  posted_at: string;
  url: string;
  updated_at: string;
}

async function upsertLongFormPosts(rows: PostUpsertRow[]): Promise<void> {
  if (rows.length === 0) return;
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from('posts')
      .upsert(rows.slice(i, i + CHUNK), {
        onConflict: 'content_id,platform,stat_date',
        ignoreDuplicates: false,
      });
    if (error) throw error;
  }
}

async function markVideosSynced(videoIds: string[], timestamp: string): Promise<void> {
  if (videoIds.length === 0) return;
  const { error } = await supabase
    .from('long_form_videos')
    .update({ last_synced_at: timestamp })
    .in('video_id', videoIds);
  if (error) throw error;
}

export async function syncLongFormVideos(): Promise<LongFormSyncSummary> {
  const accessToken = await getAccessToken();

  // STEP 1 — discover
  const playlistId = await getUploadsPlaylistId(accessToken);
  const allVideoIds = await fetchAllUploadVideoIds(playlistId, accessToken);
  const longFormVideos = await fetchVideoDetails(allVideoIds, accessToken);
  await upsertLongFormVideos(longFormVideos);

  // STEP 2 — read full catalog from DB and fetch metrics for each
  const catalog = await fetchLongFormVideosFromDb();

  const now = new Date();
  const startDate = toYMD(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
  const endDate = toYMD(now);
  const nowIso = now.toISOString();

  const errorDetails: SyncErrorDetail[] = [];
  const allRows: PostUpsertRow[] = [];
  const successfullySyncedIds: string[] = [];

  for (const video of catalog) {
    let dailyRows: DailyMetricRow[];
    try {
      dailyRows = await fetchDailyMetrics(video.video_id, startDate, endDate, accessToken);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[longform-sync] ${video.video_id}: ${message} — skipping`);
      errorDetails.push({ videoId: video.video_id, message });
      continue;
    }

    for (const row of dailyRows) {
      const watchTimeMinutes = row.estimatedMinutesWatched;
      allRows.push({
        clip_code: video.title,
        clip_details_code: null,
        content_id: video.video_id,
        content_type: 'long_form',
        platform: 'youtube',
        stat_date: row.day,
        duration_seconds: video.duration_seconds,
        title: video.title,
        thumbnail_url: video.thumbnail_url,
        views: row.views,
        watch_time_minutes: watchTimeMinutes,
        watch_time_hours: Math.round((watchTimeMinutes / 60) * 100) / 100,
        avg_view_duration_seconds: row.averageViewDuration,
        avg_view_percentage: row.averageViewPercentage,
        subscribers_gained: row.subscribersGained,
        subscribers_lost: row.subscribersLost,
        likes: row.likes,
        dislikes: row.dislikes,
        comments: row.comments,
        shares: row.shares,
        posted_at: video.published_at,
        url: `https://www.youtube.com/watch?v=${video.video_id}`,
        updated_at: nowIso,
      });
    }

    successfullySyncedIds.push(video.video_id);
  }

  // STEP 3 — upsert into posts
  try {
    await upsertLongFormPosts(allRows);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[longform-sync] upsertLongFormPosts failed:', message);
    throw err;
  }

  // STEP 4 — mark each successfully fetched video as synced
  await markVideosSynced(successfullySyncedIds, nowIso);

  return {
    discovered: longFormVideos.length,
    synced: allRows.length,
    errors: errorDetails.length,
    errorDetails,
  };
}
