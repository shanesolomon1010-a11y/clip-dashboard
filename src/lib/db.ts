import { supabase } from './supabase';
import { Platform, UnifiedPost } from '@/types';

// ── Insight history ───────────────────────────────────────────────────────────

export interface InsightRow {
  id: string;
  created_at: string;
  insight_text: string;
  post_count: number;
  top_platform: string;
  avg_views: number;
}

export async function fetchInsightHistory(): Promise<InsightRow[]> {
  const { data, error } = await supabase
    .from('insights')
    .select('id, created_at, insight_text, post_count, top_platform, avg_views')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) throw error;
  return (data ?? []) as InsightRow[];
}

export async function saveInsight(
  row: Omit<InsightRow, 'id' | 'created_at'>
): Promise<void> {
  const { error } = await supabase.from('insights').insert(row);
  if (error) throw error;
}

export async function clearInsightHistory(): Promise<void> {
  const { error } = await supabase
    .from('insights')
    .delete()
    .not('id', 'is', null);
  if (error) throw error;
}

// ── Editor feedback ───────────────────────────────────────────────────────────

export interface EditorFeedbackRow {
  id: string;
  created_at: string;
  prompt: string;
  fcpxml_generated: string;
  feedback: string;
  feedback_type: 'good' | 'mistake';
}

export async function fetchEditorFeedback(): Promise<EditorFeedbackRow[]> {
  const { data, error } = await supabase
    .from('editor_feedback')
    .select('id, created_at, prompt, fcpxml_generated, feedback, feedback_type')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) throw error;
  return (data ?? []) as EditorFeedbackRow[];
}

export async function saveEditorFeedback(
  row: Omit<EditorFeedbackRow, 'id' | 'created_at'>
): Promise<void> {
  const { error } = await supabase.from('editor_feedback').insert(row);
  if (error) throw error;
}

export async function clearEditorFeedback(): Promise<void> {
  const { error } = await supabase
    .from('editor_feedback')
    .delete()
    .not('id', 'is', null);
  if (error) throw error;
}

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
