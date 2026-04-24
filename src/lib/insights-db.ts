import { supabase } from './supabase';

export interface PerformanceAnalysis {
  id: number;
  platform: string;
  date_range_start: string;
  date_range_end: string;
  analysis_markdown: string;
  input_summary: Record<string, unknown> | null;
  model_used: string | null;
  tokens_used: number | null;
  created_at: string;
}

export async function savePerformanceAnalysis(
  row: Omit<PerformanceAnalysis, 'id' | 'created_at'>,
): Promise<number> {
  const { data, error } = await supabase
    .from('performance_analyses')
    .insert(row)
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: number }).id;
}

export async function getRecentAnalyses(limit = 10): Promise<PerformanceAnalysis[]> {
  const { data, error } = await supabase
    .from('performance_analyses')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as PerformanceAnalysis[];
}

export async function gatherAnalysisData(platform = 'youtube', daysBack = 30) {
  const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];
  const endDate = new Date().toISOString().split('T')[0];

  const [postsRes, breakdownsRes, clipDetailsRes, scheduledPostsRes] = await Promise.all([
    supabase
      .from('posts')
      .select('*')
      .eq('platform', platform)
      .gte('stat_date', startDate),
    supabase
      .from('post_breakdowns')
      .select('dimension_type, dimension_value, views, watch_time_minutes, stat_date')
      .eq('platform', platform)
      .gte('stat_date', startDate),
    supabase
      .from('clip_details')
      .select('clip_code, clip_details_code, title, caption_youtube_title'),
    supabase
      .from('scheduled_posts')
      .select('clip_code, platform, scheduled_date, post_time, status')
      .gte('scheduled_date', startDate),
  ]);

  if (postsRes.error) throw postsRes.error;
  if (breakdownsRes.error) throw breakdownsRes.error;
  if (clipDetailsRes.error) throw clipDetailsRes.error;
  if (scheduledPostsRes.error) throw scheduledPostsRes.error;

  return {
    posts: postsRes.data ?? [],
    breakdowns: breakdownsRes.data ?? [],
    clipDetails: clipDetailsRes.data ?? [],
    scheduledPosts: scheduledPostsRes.data ?? [],
    dateRangeStart: startDate,
    dateRangeEnd: endDate,
  };
}
