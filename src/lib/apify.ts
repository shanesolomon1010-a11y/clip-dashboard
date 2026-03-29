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
  const token = localStorage.getItem('apify_token');
  const username = localStorage.getItem('apify_instagram_username');

  if (!token || !username) {
    throw new Error('Apify token and Instagram username are required.');
  }

  // 1. Start actor run
  const startRes = await apifyRequest({ action: 'start', token, username });
  if (!startRes.ok) {
    const err = (await startRes.json()) as { error?: string };
    throw new Error(err.error ?? `Failed to start Apify run: ${startRes.statusText}`);
  }
  const { runId } = (await startRes.json()) as { runId: string; status: string };

  // 2. Poll until complete (max 40 polls × 3s = 2 min)
  let status = 'RUNNING';
  let polls = 0;
  while (status === 'RUNNING' || status === 'READY') {
    if (polls >= 40) {
      throw new Error('Apify run timed out after 2 minutes.');
    }
    await new Promise((res) => setTimeout(res, 3000));
    const statusRes = await apifyRequest({ action: 'status', token, runId });
    const statusData = (await statusRes.json()) as { status: string };
    status = statusData.status;
    polls++;
  }

  if (status === 'FAILED' || status === 'ABORTED') {
    throw new Error(`Apify run ${status.toLowerCase()}.`);
  }

  // 3. Fetch dataset items
  const dataRes = await apifyRequest({ action: 'results', token, runId });
  if (!dataRes.ok) {
    const err = (await dataRes.json()) as { error?: string };
    throw new Error(err.error ?? `Failed to fetch dataset: ${dataRes.statusText}`);
  }
  const { items } = (await dataRes.json()) as { items: ApifyDatasetItem[] };

  const statDate = new Date().toISOString().split('T')[0];

  // 4. Map to UnifiedPost shape
  const posts: UnifiedPost[] = items.map((item) => ({
    id: '',
    platform: 'instagram',
    clip_code: '',
    url: item.url,
    content_id: item.shortCode,
    date: item.timestamp ?? statDate,
    stat_date: statDate,
    views: item.videoViewCount ?? item.videoPlayCount ?? 0,
    plays: item.videoPlayCount ?? 0,
    likes: item.likesCount ?? 0,
    comments: item.commentsCount ?? 0,
    shares: item.sharesCount ?? 0,
    saves: 0,
    engagementRate: 0,
    content_type: 'reel',
    title: item.caption?.slice(0, 100) ?? item.shortCode ?? '',
  }));

  // 5. Upsert to Supabase
  await upsertPosts(posts);

  // 6. Record last sync time
  localStorage.setItem('apify_last_sync', new Date().toISOString());
}
