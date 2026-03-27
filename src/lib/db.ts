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
  ffmpeg_commands_generated: string; // stored in fcpxml_generated column in Supabase
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
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    created_at: row.created_at as string,
    prompt: row.prompt as string,
    ffmpeg_commands_generated: row.fcpxml_generated as string,
    feedback: row.feedback as string,
    feedback_type: row.feedback_type as 'good' | 'mistake',
  }));
}

export async function saveEditorFeedback(
  row: Omit<EditorFeedbackRow, 'id' | 'created_at'>
): Promise<void> {
  const { error } = await supabase.from('editor_feedback').insert({
    prompt: row.prompt,
    fcpxml_generated: row.ffmpeg_commands_generated,
    feedback: row.feedback,
    feedback_type: row.feedback_type,
  });
  if (error) throw error;
}

export async function clearEditorFeedback(): Promise<void> {
  const { error } = await supabase
    .from('editor_feedback')
    .delete()
    .not('id', 'is', null);
  if (error) throw error;
}

// ── Posts ─────────────────────────────────────────────────────────────────────

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

function mapPostRow(row: Record<string, unknown>): UnifiedPost {
  const views = Number(row.views ?? 0);
  const likes = Number(row.likes ?? 0);
  const comments = Number(row.comments ?? 0);
  const shares = Number(row.shares ?? 0);
  const saves = Number(row.saves ?? 0);
  return {
    id: row.id as string,
    clip_code: row.clip_code as string | undefined,
    platform: row.platform as Platform,
    date: (row.posted_at as string ?? '').slice(0, 10),
    title: row.title as string,
    views,
    likes,
    comments,
    shares,
    saves,
    engagementRate: calcEngagementRate(views, likes, comments, shares, saves),
    content_type: row.content_type as string | undefined,
    url: row.url as string | undefined,
    thumbnail_url: row.thumbnail_url as string | undefined,
    watch_time_minutes: row.watch_time_minutes != null ? Number(row.watch_time_minutes) : undefined,
    avg_view_duration_seconds: row.avg_view_duration_seconds != null ? Number(row.avg_view_duration_seconds) : undefined,
    avg_view_percentage: row.avg_view_percentage != null ? Number(row.avg_view_percentage) : undefined,
    impressions: row.impressions != null ? Number(row.impressions) : undefined,
    impression_ctr: row.impression_ctr != null ? Number(row.impression_ctr) : undefined,
    dislikes: row.dislikes != null ? Number(row.dislikes) : undefined,
    subscribers_gained: row.subscribers_gained != null ? Number(row.subscribers_gained) : undefined,
    subscribers_lost: row.subscribers_lost != null ? Number(row.subscribers_lost) : undefined,
    card_clicks: row.card_clicks != null ? Number(row.card_clicks) : undefined,
    card_ctr: row.card_ctr != null ? Number(row.card_ctr) : undefined,
    end_screen_clicks: row.end_screen_clicks != null ? Number(row.end_screen_clicks) : undefined,
    end_screen_ctr: row.end_screen_ctr != null ? Number(row.end_screen_ctr) : undefined,
    plays: row.plays != null ? Number(row.plays) : undefined,
    reach: row.reach != null ? Number(row.reach) : undefined,
    profile_visits: row.profile_visits != null ? Number(row.profile_visits) : undefined,
    follows: row.follows != null ? Number(row.follows) : undefined,
    accounts_reached: row.accounts_reached != null ? Number(row.accounts_reached) : undefined,
    accounts_engaged: row.accounts_engaged != null ? Number(row.accounts_engaged) : undefined,
    engagement_rate: row.engagement_rate != null ? Number(row.engagement_rate) : undefined,
  };
}

export async function getPosts(
  platform?: 'youtube' | 'instagram',
  startDate?: string,
  endDate?: string
): Promise<UnifiedPost[]> {
  let query = supabase.from('posts').select('*').order('posted_at', { ascending: false });
  if (platform) query = query.eq('platform', platform);
  if (startDate) query = query.gte('posted_at', startDate);
  if (endDate) query = query.lte('posted_at', endDate);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => mapPostRow(row as Record<string, unknown>));
}

export async function fetchAllPosts(): Promise<UnifiedPost[]> {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .order('posted_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => mapPostRow(row as Record<string, unknown>));
}

export async function upsertPosts(posts: UnifiedPost[]): Promise<void> {
  const rows = posts.map((p) => ({
    clip_code: p.clip_code ?? null,
    platform: p.platform,
    posted_at: p.date,
    title: p.title,
    content_type: p.content_type ?? null,
    url: p.url ?? null,
    thumbnail_url: p.thumbnail_url ?? null,
    views: p.views,
    likes: p.likes,
    comments: p.comments,
    shares: p.shares,
    // YouTube-specific
    watch_time_minutes: p.watch_time_minutes ?? null,
    avg_view_duration_seconds: p.avg_view_duration_seconds ?? null,
    avg_view_percentage: p.avg_view_percentage ?? null,
    impressions: p.impressions ?? null,
    impression_ctr: p.impression_ctr ?? null,
    dislikes: p.dislikes ?? null,
    subscribers_gained: p.subscribers_gained ?? null,
    subscribers_lost: p.subscribers_lost ?? null,
    card_clicks: p.card_clicks ?? null,
    card_ctr: p.card_ctr ?? null,
    end_screen_clicks: p.end_screen_clicks ?? null,
    end_screen_ctr: p.end_screen_ctr ?? null,
    // Instagram-specific
    plays: p.plays ?? null,
    reach: p.reach ?? null,
    saves: p.saves ?? null,
    profile_visits: p.profile_visits ?? null,
    follows: p.follows ?? null,
    accounts_reached: p.accounts_reached ?? null,
    accounts_engaged: p.accounts_engaged ?? null,
    engagement_rate: p.engagement_rate ?? null,
  }));

  const { error } = await supabase
    .from('posts')
    .upsert(rows, { onConflict: 'clip_code,platform' });

  if (error) throw error;
}

export async function updatePostContentType(
  platform: string,
  title: string,
  date: string,
  content_type: string
): Promise<void> {
  const { error } = await supabase
    .from('posts')
    .update({ content_type })
    .match({ platform, title, date });
  if (error) throw error;
}

export async function updatePostUrl(
  platform: string,
  title: string,
  date: string,
  url: string
): Promise<void> {
  // Errors are silently swallowed — consistent with save-URL UX
  try {
    await supabase
      .from('posts')
      .update({ url })
      .match({ platform, title, date });
  } catch {
    // no-op
  }
}

// ── Goals ─────────────────────────────────────────────────────────────────────

export interface GoalRow {
  id: string;
  platform: string;
  metric: string;
  target: number;
  created_at: string;
}

export async function fetchGoals(): Promise<GoalRow[]> {
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as GoalRow[];
}

export async function saveGoal(
  platform: string,
  metric: string,
  target: number
): Promise<void> {
  // Delete existing goal for this platform+metric then insert fresh
  await supabase.from('goals').delete().match({ platform, metric });
  const { error } = await supabase.from('goals').insert({ platform, metric, target });
  if (error) throw error;
}

// ── Captions ──────────────────────────────────────────────────────────────────

export interface CaptionRow {
  id: string;
  created_at: string;
  clip_description: string;
  platform: string;
  tone: string;
  caption_text: string;
}

export async function fetchCaptions(): Promise<CaptionRow[]> {
  const { data, error } = await supabase
    .from('captions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  return (data ?? []) as CaptionRow[];
}

export async function saveCaption(
  row: Omit<CaptionRow, 'id' | 'created_at'>
): Promise<void> {
  const { error } = await supabase.from('captions').insert(row);
  if (error) throw error;
}

// ── Script analyses ────────────────────────────────────────────────────────────

export async function saveScriptAnalysis(row: {
  script_text: string;
  overall_score: number;
  platform_scores: unknown;
  platform_breakdowns: unknown;
  recommendations: unknown;
  title?: string;
}): Promise<void> {
  const { error } = await supabase.from('script_analyses').insert(row);
  if (error) throw error;
}

// ── Clip details ───────────────────────────────────────────────────────────────

export interface ClipDetail {
  clip_code: string;
  title: string | null;
  headline_banner: string | null;
  question_banner: string | null;
  caption_tiktok: string | null;
  caption_instagram: string | null;
  caption_youtube: string | null;
  caption_linkedin: string | null;
  caption_twitter: string | null;
  video_url: string | null;
}

export async function fetchClipDetails(clipCode: string): Promise<ClipDetail | null> {
  const { data, error } = await supabase
    .from('clip_details')
    .select(
      'clip_code, title, headline_banner, question_banner, ' +
      'caption_tiktok, caption_instagram, caption_youtube, caption_linkedin, caption_twitter, ' +
      'video_url'
    )
    .eq('clip_code', clipCode)
    .maybeSingle();

  if (error) throw error;
  return data as ClipDetail | null;
}

export async function fetchAllClipDetails(): Promise<ClipDetail[]> {
  const { data, error } = await supabase
    .from('clip_details')
    .select(
      'clip_code, title, headline_banner, question_banner, ' +
      'caption_tiktok, caption_instagram, caption_youtube, caption_linkedin, caption_twitter, ' +
      'video_url'
    )
    .order('clip_code');
  if (error) throw error;
  return (data ?? []) as unknown as ClipDetail[];
}

export async function insertClipDetail(row: ClipDetail): Promise<void> {
  const { error } = await supabase.from('clip_details').insert(row);
  if (error) {
    console.error('insertClipDetail error:', error);
    throw error;
  }
}

export async function deleteClipDetail(clipCode: string): Promise<void> {
  const { error } = await supabase.from('clip_details').delete().eq('clip_code', clipCode);
  if (error) throw error;
}
