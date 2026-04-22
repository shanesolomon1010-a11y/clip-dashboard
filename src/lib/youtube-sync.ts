import { upsertPosts } from './db';
import { getAccessToken, fetchAnalyticsForVideo } from './youtube';
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

export async function runYouTubeSync(): Promise<number> {
  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    console.error('youtube-sync: getAccessToken failed:', err);
    throw err;
  }

  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const allPosts: UnifiedPost[] = [];

  for (const [videoId, clipDetailsCode] of Object.entries(VIDEO_MAP)) {
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
        date: row.date,
        stat_date: row.date,
        title: '',
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

  return allPosts.length;
}
