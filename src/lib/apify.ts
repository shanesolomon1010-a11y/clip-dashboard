import { upsertPosts } from './db';
import type { UnifiedPost } from '@/types';

interface ApifyDatasetItem {
  url?: string;
  shortCode?: string;
  timestamp?: string;
  videoViewCount?: number;
  videoPlayCount?: number;
  likesCount?: number;
  commentsCount?: number;
  sharesCount?: number;
  caption?: string;
}

async function apifyRequest(body: Record<string, unknown>): Promise<Response> {
  return fetch('/api/apify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function syncInstagramReels(): Promise<void> {
  try {
    console.log('Starting sync...');

    const token = localStorage.getItem('apify_token');
    const username = localStorage.getItem('apify_instagram_username');
    const instagram_session = localStorage.getItem('apify_instagram_session') ?? '';

    if (!token || !username) {
      throw new Error('Apify token and Instagram username are required.');
    }

    // 1. Start actor run
    const startRes = await apifyRequest({ action: 'start', token, username, instagram_session });
    if (!startRes.ok) {
      const errorText = await startRes.text();
      console.error('[apify] start failed:', startRes.status, errorText);
      throw new Error(`Step failed: ${startRes.status} ${errorText}`);
    }
    const startData = (await startRes.json()) as { runId?: string; status?: string; error?: string };
    if (!startData.runId) {
      throw new Error(`Start response missing runId: ${JSON.stringify(startData)}`);
    }
    const runId = startData.runId;
    console.log('Actor started, runId:', runId);

    // 2. Poll until complete (max 40 polls × 3s = 2 min)
    console.log('Polling status...');
    let status = 'RUNNING';
    let polls = 0;
    while (status === 'RUNNING' || status === 'READY') {
      if (polls >= 40) {
        throw new Error('Apify run timed out after 2 minutes.');
      }
      await new Promise((res) => setTimeout(res, 3000));
      const statusRes = await apifyRequest({ action: 'status', token, runId });
      if (!statusRes.ok) {
        const errorText = await statusRes.text();
        console.error('[apify] poll failed:', statusRes.status, errorText);
        throw new Error(`Step failed: ${statusRes.status} ${errorText}`);
      }
      const statusData = (await statusRes.json()) as { status?: string; error?: string };
      status = statusData.status ?? 'UNKNOWN';
      console.log(`[apify] poll ${polls + 1}: status=${status}`);
      polls++;
    }

    if (status === 'FAILED' || status === 'ABORTED') {
      throw new Error(`Apify run ${status.toLowerCase()}.`);
    }

    // 3. Fetch dataset items
    console.log('Fetching results...');
    const dataRes = await apifyRequest({ action: 'results', token, runId });
    if (!dataRes.ok) {
      const errorText = await dataRes.text();
      console.error('[apify] results failed:', dataRes.status, errorText);
      throw new Error(`Step failed: ${dataRes.status} ${errorText}`);
    }
    const { items } = (await dataRes.json()) as { items: ApifyDatasetItem[] };
    console.log('[apify] received', items.length, 'items');

    const statDate = new Date().toISOString().split('T')[0];

    // 4. Map to UnifiedPost shape — only fields that exist in the posts table
    const mapped: UnifiedPost[] = items.map((item): UnifiedPost => ({
      // Required by UnifiedPost type; id is not stored, engagementRate is computed
      id: '',
      engagementRate: 0,
      // posts table columns
      platform: 'instagram',
      clip_code: '',
      clip_details_code: undefined,
      content_id: item.shortCode,
      title: item.caption?.slice(0, 100) ?? item.shortCode ?? '',
      content_type: 'reel',
      url: item.url,
      thumbnail_url: undefined,
      date: item.timestamp ?? statDate,
      stat_date: statDate,
      views: item.videoViewCount ?? item.videoPlayCount ?? 0,
      likes: item.likesCount ?? 0,
      comments: item.commentsCount ?? 0,
      shares: item.sharesCount ?? 0,
      saves: 0,
      plays: item.videoPlayCount ?? 0,
    }));

    // 5. Strip to allowed DB columns before upsert
    // Note: UnifiedPost uses 'date' for the posted_at column; id/engagementRate are type-required but not stored.
    const allowedKeys = ['id','engagementRate','clip_code','clip_details_code','platform','title',
      'content_type','date','url','thumbnail_url','stat_date','content_id',
      'views','likes','comments','shares','plays','reach','saves','profile_visits',
      'follows','accounts_reached','accounts_engaged','engagement_rate',
      'watch_time_minutes','watch_time_hours','avg_view_duration_seconds',
      'avg_view_percentage','impressions','impression_ctr','dislikes',
      'subscribers_gained','subscribers_lost','card_clicks','card_ctr',
      'end_screen_clicks','end_screen_ctr','duration_seconds','daily_engaged_views',
      'total_engaged_views','unique_viewers','youtube_premium_views'];

    const filtered = mapped.map(row =>
      Object.fromEntries(
        Object.entries(row).filter(([k]) => allowedKeys.includes(k))
      )
    ) as unknown as UnifiedPost[];

    // 6. Upsert to Supabase
    await upsertPosts(filtered);

    // 6. Record last sync time
    localStorage.setItem('apify_last_sync', new Date().toISOString());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[apify] syncInstagramReels error:', msg);
    throw new Error(msg);
  }
}
