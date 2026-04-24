import { supabase } from './supabase';

// ── Weekly reports ────────────────────────────────────────────────────────────

export interface WeeklyReport {
  id: number;
  platform: string;
  week_start: string;
  week_end: string;
  report_markdown: string;
  input_summary: Record<string, unknown> | null;
  model_used: string | null;
  tokens_used: number | null;
  triggered_by: string | null;
  created_at: string;
}

export async function saveWeeklyReport(
  row: Omit<WeeklyReport, 'id' | 'created_at'>,
): Promise<number> {
  const { data, error } = await supabase
    .from('weekly_reports')
    .insert(row)
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: number }).id;
}

export async function getLatestWeeklyReport(): Promise<WeeklyReport | null> {
  const { data, error } = await supabase
    .from('weekly_reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as WeeklyReport | null;
}

export async function getRecentWeeklyReports(limit = 8): Promise<WeeklyReport[]> {
  const { data, error } = await supabase
    .from('weekly_reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as WeeklyReport[];
}

export async function gatherWeeklyData(platform = 'youtube') {
  const now   = Date.now();
  const today = new Date(now).toISOString().split('T')[0];
  const day7  = new Date(now -  7 * 86400000).toISOString().split('T')[0];
  const day8  = new Date(now -  8 * 86400000).toISOString().split('T')[0];
  const day14 = new Date(now - 14 * 86400000).toISOString().split('T')[0];

  const [
    curPostsRes, curBdRes, curSchedRes,
    prevPostsRes, prevBdRes, prevSchedRes,
    clipDetailsRes,
  ] = await Promise.all([
    supabase.from('posts').select('*').eq('platform', platform).gte('stat_date', day7).lte('stat_date', today),
    supabase.from('post_breakdowns').select('dimension_type, dimension_value, views, watch_time_minutes, stat_date').eq('platform', platform).gte('stat_date', day7).lte('stat_date', today),
    supabase.from('scheduled_posts').select('clip_code, platform, scheduled_date, post_time, status').gte('scheduled_date', day7).lte('scheduled_date', today),
    supabase.from('posts').select('*').eq('platform', platform).gte('stat_date', day14).lte('stat_date', day8),
    supabase.from('post_breakdowns').select('dimension_type, dimension_value, views, watch_time_minutes, stat_date').eq('platform', platform).gte('stat_date', day14).lte('stat_date', day8),
    supabase.from('scheduled_posts').select('clip_code, platform, scheduled_date, post_time, status').gte('scheduled_date', day14).lte('scheduled_date', day8),
    supabase.from('clip_details').select('clip_code, clip_details_code, title, caption_youtube_title'),
  ]);

  if (curPostsRes.error)  throw curPostsRes.error;
  if (curBdRes.error)     throw curBdRes.error;
  if (curSchedRes.error)  throw curSchedRes.error;
  if (prevPostsRes.error) throw prevPostsRes.error;
  if (prevBdRes.error)    throw prevBdRes.error;
  if (prevSchedRes.error) throw prevSchedRes.error;
  if (clipDetailsRes.error) throw clipDetailsRes.error;

  return {
    currentWeek: {
      start: day7, end: today,
      posts:          curPostsRes.data  ?? [],
      breakdowns:     curBdRes.data     ?? [],
      scheduledPosts: curSchedRes.data  ?? [],
    },
    previousWeek: {
      start: day14, end: day8,
      posts:          prevPostsRes.data ?? [],
      breakdowns:     prevBdRes.data    ?? [],
      scheduledPosts: prevSchedRes.data ?? [],
    },
    clipDetails: clipDetailsRes.data ?? [],
  };
}

// ── Schedule recommendations ──────────────────────────────────────────────────

export interface ScheduleRecommendation {
  id: number;
  platform: string;
  analysis_window_days: number;
  slot_analysis: Record<string, unknown>[];
  recommended_schedule: { day: string; hour_bucket: string; reason: string }[];
  narrative_markdown: string | null;
  tokens_used: number | null;
  created_at: string;
}

export async function saveScheduleRecommendation(
  row: Omit<ScheduleRecommendation, 'id' | 'created_at'>,
): Promise<number> {
  const { data, error } = await supabase
    .from('schedule_recommendations')
    .insert(row)
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: number }).id;
}

export async function getLatestScheduleRecommendation(): Promise<ScheduleRecommendation | null> {
  const { data, error } = await supabase
    .from('schedule_recommendations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as ScheduleRecommendation | null;
}

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
