import { supabase } from './supabase';
import { Platform, UnifiedPost } from '@/types';

function calcEngagementRate(
  views: number,
  likes: number,
  comments: number,
  shares: number,
  saves: number
): number {
  if (views === 0) return 0;
  return parseFloat((((likes + comments + shares + saves) / views) * 100).toFixed(2));
}

export async function fetchAllPosts(): Promise<UnifiedPost[]> {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .order('date', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    platform: row.platform as Platform,
    date: row.date as string,
    title: row.title as string,
    views: Number(row.views),
    likes: Number(row.likes),
    comments: Number(row.comments),
    shares: Number(row.shares),
    saves: Number(row.saves),
    engagementRate: calcEngagementRate(
      Number(row.views),
      Number(row.likes),
      Number(row.comments),
      Number(row.shares),
      Number(row.saves)
    ),
  }));
}

export async function upsertPosts(posts: UnifiedPost[]): Promise<void> {
  const rows = posts.map((p) => ({
    platform: p.platform,
    date: p.date,
    title: p.title,
    views: p.views,
    likes: p.likes,
    comments: p.comments,
    shares: p.shares,
    saves: p.saves,
  }));

  const { error } = await supabase
    .from('posts')
    .upsert(rows, { onConflict: 'platform,title,date', ignoreDuplicates: true });

  if (error) throw error;
}
