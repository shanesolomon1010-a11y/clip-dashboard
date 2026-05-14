import { upsertPosts, upsertBreakdowns, getShortsRegistry } from './db';
import type { BreakdownUpsertRow, ShortsRegistryRow } from './db';
import { getAccessToken, fetchAnalyticsForVideo, fetchVideoMetadata, fetchBreakdownForVideo } from './youtube';
import type { VideoMetadata, BreakdownConfig } from './youtube';
import { discoverShorts } from './shorts-discovery';
import type { UnifiedPost } from '@/types';

// ageGroupGender will return 0 rows until the channel crosses YouTube's demographic
// privacy floor — this is expected and not a bug.
const BREAKDOWN_CONFIGS: BreakdownConfig[] = [
  { name: 'insightTrafficSourceType',   apiDimensions: 'day,insightTrafficSourceType',  aggregate: false },
  { name: 'deviceType',                 apiDimensions: 'day,deviceType',                aggregate: false },
  { name: 'subscribedStatus',           apiDimensions: 'day,subscribedStatus',          aggregate: false },
  { name: 'country',                    apiDimensions: 'country',                       aggregate: true  },
  { name: 'ageGroupGender',             apiDimensions: 'ageGroup,gender',               aggregate: true  },
  { name: 'insightPlaybackLocationType', apiDimensions: 'insightPlaybackLocationType',  aggregate: true  },
];

export async function runBreakdownSync(
  accessToken: string,
  registry: ShortsRegistryRow[],
): Promise<number> {
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const allRows: BreakdownUpsertRow[] = [];
  let apiCalls = 0;
  const now = new Date().toISOString();

  for (const { content_id: videoId, clip_details_code: clipDetailsCode, clip_code: clipCode } of registry) {
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
      if (config.name === 'ageGroupGender' && rows.length > 0) {
        console.log(`[demographics] threshold crossed: ${rows.length} rows for ${videoId}`);
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

  try {
    const result = await discoverShorts(accessToken);
    console.log(`[youtube-sync] discovery: matched ${result.matched}, pending ${result.pending}, skipped ${result.skipped}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[youtube-sync] discovery failed: ${message} — continuing`);
  }

  const registry = await getShortsRegistry();
  const pendingCount = registry.filter((r) => r.clip_code === 'PENDING').length;
  const mappedCount = registry.length - pendingCount;
  console.log(`[youtube-sync] registry has ${registry.length} entries (${mappedCount} mapped, ${pendingCount} pending)`);

  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  let metadataMap: Map<string, VideoMetadata>;
  try {
    metadataMap = await fetchVideoMetadata(registry.map((r) => r.content_id), accessToken);
  } catch (err) {
    console.error('youtube-sync: fetchVideoMetadata failed:', err);
    throw err;
  }

  const allPosts: UnifiedPost[] = [];

  for (const { content_id: videoId, clip_details_code: clipDetailsCode, clip_code: clipCode } of registry) {
    const metadata = metadataMap.get(videoId);
    if (!metadata) {
      console.warn(`youtube-sync: no metadata for ${videoId} (${clipDetailsCode}), skipping`);
      continue;
    }

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
    breakdownsProcessed = await runBreakdownSync(accessToken, registry);
  } catch (err) {
    console.error('youtube-sync: breakdown sync failed (non-fatal):', err);
  }

  return { rowsProcessed, breakdownsProcessed };
}
