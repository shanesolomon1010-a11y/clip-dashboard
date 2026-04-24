import { upsertPosts, upsertBreakdowns } from './db';
import type { BreakdownUpsertRow } from './db';
import { getAccessToken, fetchAnalyticsForVideo, fetchVideoMetadata, fetchBreakdownForVideo } from './youtube';
import type { VideoMetadata, BreakdownConfig } from './youtube';
import type { UnifiedPost } from '@/types';

const VIDEO_MAP: Record<string, string> = {
  '6dMQ7EyATRU': 'MBM015-CLIP-014',
  'UPyNkTKaraU': 'MBM015-CLIP-004',
  'ZgkpBit9UA0': 'MBM015-CLIP-009',
  'E2Fgd_6BJIE': 'MBM015-CLIP-008',
  '2gKSLs2-Nss': 'MBM015-CLIP-012',
  'DUpRLsIQGmA': 'MBM015-CLIP-011',
  'O9emVLO6n2U': 'MBM015-CLIP-013',
  'VpxBnfeKLi8': 'MBM015-CLIP-007',
  'SU-sXevLe64': 'MBM015-CLIP-010',
  'f1MhMrQswjg': 'MBM015-CLIP-016',
  'wWrk066VHqM': 'MBM015-CLIP-017',
  'fNp7epYo6wA': 'MBM015-CLIP-018',
  'BwN_zCjtAVc': 'MBM015-CLIP-019',
  'a6PHBY2cq5Q': 'MBM015-CLIP-020',
  'BjAdnIfIls4': 'MBM015-CLIP-021',
  'XaQfjuTzdDE': 'MBM015-CLIP-022',
  'a3bRUFpilGI': 'MBM016-CLIP-001',
  'JJI4swcaLJQ': 'MBM016-CLIP-003',
  'QYcNH8fKXTs': 'MBM016-CLIP-004',
  'VH42AvIjbk0': 'MBM016-CLIP-005',
  'tPsydEmTaOo': 'MBM016-CLIP-006',
  'OKyFroQrWwM': 'MBM016-CLIP-007',
  '51DR6H8GQBc': 'MBM016-CLIP-009',
  'AqtzZNYdxTE': 'MBM016-CLIP-010',
  'kXt894vwO1c': 'MBM016-CLIP-011',
  'pkPSikierRM': 'MBM016-CLIP-012',
  '-cXhRAIu_AE': 'MBM016-CLIP-013',
  'CGQryafzaAY': 'MBM016-CLIP-014',
  'X6v-cvX2tew': 'MBM017-CLIP-001',
  '5SImwiVgWWA': 'MBM017-CLIP-002',
};

const BREAKDOWN_CONFIGS: BreakdownConfig[] = [
  { name: 'insightTrafficSourceType',   apiDimensions: 'day,insightTrafficSourceType',  aggregate: false },
  { name: 'deviceType',                 apiDimensions: 'day,deviceType',                aggregate: false },
  { name: 'subscribedStatus',           apiDimensions: 'day,subscribedStatus',          aggregate: false },
  { name: 'country',                    apiDimensions: 'country',                       aggregate: true  },
  { name: 'ageGroupGender',             apiDimensions: 'ageGroup,gender',               aggregate: true  },
  { name: 'insightPlaybackLocationType', apiDimensions: 'insightPlaybackLocationType',  aggregate: true  },
];

export async function runBreakdownSync(accessToken: string): Promise<number> {
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const allRows: BreakdownUpsertRow[] = [];
  let apiCalls = 0;
  const now = new Date().toISOString();

  for (const [videoId, clipDetailsCode] of Object.entries(VIDEO_MAP)) {
    const clipCode = clipDetailsCode.split('-CLIP-')[0];

    for (const config of BREAKDOWN_CONFIGS) {
      apiCalls++;
      let rows;
      try {
        rows = await fetchBreakdownForVideo(videoId, config, startDate, endDate, accessToken);
      } catch (err) {
        console.warn(`breakdown-sync: skipping ${videoId}/${config.name}:`, err);
        continue;
      }

      if (rows.length > 0) {
        console.log(`breakdown-sync: ${clipDetailsCode}/${config.name}: ${rows.length} rows`);
      }

      for (const row of rows) {
        allRows.push({
          clip_details_code: clipDetailsCode,
          clip_code: clipCode,
          content_id: videoId,
          platform: 'youtube',
          stat_date: row.date,
          dimension_type: config.name,
          dimension_value: row.dimensionValue,
          views: row.views,
          watch_time_minutes: row.watchTimeMinutes,
          avg_view_duration_seconds: row.avgViewDurationSeconds,
          updated_at: now,
        });
      }
    }
  }

  console.log(`breakdown-sync: ${apiCalls} API calls, ${allRows.length} rows collected`);

  if (allRows.length > 0) {
    try {
      await upsertBreakdowns(allRows);
    } catch (err) {
      console.error('breakdown-sync: upsertBreakdowns failed:', err);
      throw err;
    }
  }

  return allRows.length;
}

export async function runYouTubeSync(): Promise<{ rowsProcessed: number; breakdownsProcessed: number }> {
  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    console.error('youtube-sync: getAccessToken failed:', err);
    throw err;
  }

  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  let metadataMap: Map<string, VideoMetadata>;
  try {
    metadataMap = await fetchVideoMetadata(Object.keys(VIDEO_MAP), accessToken);
  } catch (err) {
    console.error('youtube-sync: fetchVideoMetadata failed:', err);
    throw err;
  }

  const allPosts: UnifiedPost[] = [];

  for (const [videoId, clipDetailsCode] of Object.entries(VIDEO_MAP)) {
    const metadata = metadataMap.get(videoId);
    if (!metadata) {
      console.warn(`youtube-sync: no metadata for ${videoId} (${clipDetailsCode}), skipping`);
      continue;
    }
    const clipCode = clipDetailsCode.split('-CLIP-')[0];

    let rows;
    try {
      rows = await fetchAnalyticsForVideo(videoId, startDate, endDate, accessToken);
    } catch (err) {
      console.error(`youtube-sync: skipping ${videoId}:`, err);
      continue;
    }

    for (const row of rows) {
      allPosts.push({
        id: `${videoId}_${row.date}`,
        clip_code: clipCode,
        clip_details_code: clipDetailsCode,
        content_id: videoId,
        platform: 'youtube',
        content_type: 'short',
        date: metadata.publishedAt.slice(0, 10),
        stat_date: row.date,
        title: metadata.title,
        url: metadata.url,
        thumbnail_url: metadata.thumbnailUrl ?? undefined,
        duration_seconds: metadata.durationSeconds ?? undefined,
        views: row.views,
        likes: row.likes,
        dislikes: row.dislikes,
        comments: row.comments,
        shares: row.shares,
        saves: 0,
        engagementRate: 0,
        watch_time_minutes: row.estimatedMinutesWatched,
        watch_time_hours: row.estimatedMinutesWatched / 60,
        avg_view_duration_seconds: row.averageViewDuration,
        avg_view_percentage: row.averageViewPercentage,
        subscribers_gained: row.subscribersGained,
        subscribers_lost: row.subscribersLost,
      });
    }
  }

  if (allPosts.length > 0) {
    try {
      await upsertPosts(allPosts);
    } catch (err) {
      console.error('youtube-sync: upsertPosts failed:', err);
      throw err;
    }
  }

  const rowsProcessed = allPosts.length;

  let breakdownsProcessed = 0;
  try {
    breakdownsProcessed = await runBreakdownSync(accessToken);
  } catch (err) {
    console.error('youtube-sync: breakdown sync failed (non-fatal):', err);
  }

  return { rowsProcessed, breakdownsProcessed };
}
