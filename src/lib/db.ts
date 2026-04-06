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
    clip_details_code: row.clip_details_code as string | undefined,
    platform: row.platform as Platform,
    date: (row.posted_at as string ?? '').slice(0, 10),
    stat_date: row.stat_date as string | undefined,
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
    watch_time_hours: row.watch_time_hours != null ? Number(row.watch_time_hours) : undefined,
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
    duration_seconds: row.duration_seconds != null ? Number(row.duration_seconds) : undefined,
    daily_engaged_views: row.daily_engaged_views != null ? Number(row.daily_engaged_views) : undefined,
    total_engaged_views: row.total_engaged_views != null ? Number(row.total_engaged_views) : undefined,
    unique_viewers: row.unique_viewers != null ? Number(row.unique_viewers) : undefined,
    youtube_premium_views: row.youtube_premium_views != null ? Number(row.youtube_premium_views) : undefined,
    stayed_to_watch_pct: row.stayed_to_watch_pct != null ? Number(row.stayed_to_watch_pct) : undefined,
    new_viewers: row.new_viewers != null ? Number(row.new_viewers) : undefined,
    returning_viewers: row.returning_viewers != null ? Number(row.returning_viewers) : undefined,
    casual_viewers: row.casual_viewers != null ? Number(row.casual_viewers) : undefined,
    regular_viewers: row.regular_viewers != null ? Number(row.regular_viewers) : undefined,
    hypes: row.hypes != null ? Number(row.hypes) : undefined,
    hype_points: row.hype_points != null ? Number(row.hype_points) : undefined,
    post_subscribers: row.post_subscribers != null ? Number(row.post_subscribers) : undefined,
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

// Returns one row per clip_code+platform using the latest stat_date.
// Posts without a clip_code are returned as-is (each row is unique).
export async function getLatestPostsPerClip(platform?: string): Promise<UnifiedPost[]> {
  let query = supabase
    .from('posts')
    .select('*')
    .order('stat_date', { ascending: false, nullsFirst: false })
    .order('posted_at', { ascending: false });

  if (platform) query = query.eq('platform', platform);

  const { data, error } = await query;
  if (error) throw error;

  const seen = new Set<string>();
  const result: UnifiedPost[] = [];

  for (const row of data ?? []) {
    const key = row.clip_code
      ? `${row.clip_code as string}::${row.platform as string}`
      : row.id as string;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(mapPostRow(row as Record<string, unknown>));
    }
  }

  return result;
}

// Returns total views per clip_code across all daily rows.
export async function getTotalViewsPerClip(platform?: string): Promise<{
  clip_code: string;
  clip_details_code: string | undefined;
  platform: string;
  total_views: number;
}[]> {
  let query = supabase
    .from('posts')
    .select('clip_code, clip_details_code, platform, views')
    .not('clip_code', 'is', null);

  if (platform && platform !== 'all') query = query.eq('platform', platform);

  const { data, error } = await query;
  if (error) throw error;

  const map = new Map<string, { clip_code: string; clip_details_code: string | undefined; platform: string; total_views: number }>();

  for (const row of data ?? []) {
    const key = `${row.clip_code as string}::${row.platform as string}`;
    const existing = map.get(key);
    if (existing) {
      existing.total_views += Number(row.views ?? 0);
    } else {
      map.set(key, {
        clip_code: row.clip_code as string,
        clip_details_code: row.clip_details_code as string | undefined,
        platform: row.platform as string,
        total_views: Number(row.views ?? 0),
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.total_views - a.total_views);
}

// Returns all rows ordered by stat_date ASC — used by Analytics metric cards.
export async function getAllPostsByDate(platform?: string): Promise<UnifiedPost[]> {
  let query = supabase
    .from('posts')
    .select('*')
    .order('stat_date', { ascending: true, nullsFirst: false });

  if (platform) query = query.eq('platform', platform);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => mapPostRow(row as Record<string, unknown>));
}

// Returns all rows unfiltered — used by the Data Editor.
export async function getAllPosts(platform?: string): Promise<UnifiedPost[]> {
  let query = supabase
    .from('posts')
    .select('*')
    .order('clip_code', { ascending: true, nullsFirst: false })
    .order('stat_date', { ascending: false, nullsFirst: false });

  if (platform) query = query.eq('platform', platform);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => mapPostRow(row as Record<string, unknown>));
}

export async function updatePost(id: string, fields: Partial<UnifiedPost>): Promise<void> {
  const dbFields: Record<string, unknown> = {};

  const directKeys: Array<keyof UnifiedPost> = [
    'clip_code', 'platform', 'title', 'url', 'stat_date', 'duration_seconds',
    'views', 'likes', 'comments', 'shares', 'impressions', 'impression_ctr',
    'watch_time_hours', 'avg_view_duration_seconds', 'avg_view_percentage',
    'daily_engaged_views', 'total_engaged_views', 'unique_viewers',
    'subscribers_gained', 'subscribers_lost', 'youtube_premium_views',
  ];

  for (const key of directKeys) {
    if (key in fields) dbFields[key] = fields[key] ?? null;
  }

  if ('date' in fields) dbFields['posted_at'] = fields.date;

  if (Object.keys(dbFields).length === 0) return;

  const { error } = await supabase.from('posts').update(dbFields).eq('id', id);
  if (error) throw error;
}

export async function deletePost(id: string): Promise<void> {
  const { error } = await supabase.from('posts').delete().eq('id', id);
  if (error) throw error;
}

// Migration SQL — run manually in Supabase SQL editor:
//
// ALTER TABLE posts
//   ADD COLUMN IF NOT EXISTS stayed_to_watch_pct NUMERIC,
//   ADD COLUMN IF NOT EXISTS new_viewers INTEGER,
//   ADD COLUMN IF NOT EXISTS returning_viewers INTEGER,
//   ADD COLUMN IF NOT EXISTS casual_viewers INTEGER,
//   ADD COLUMN IF NOT EXISTS regular_viewers INTEGER,
//   ADD COLUMN IF NOT EXISTS hypes INTEGER,
//   ADD COLUMN IF NOT EXISTS hype_points INTEGER,
//   ADD COLUMN IF NOT EXISTS post_subscribers INTEGER;
export async function upsertPosts(posts: UnifiedPost[]): Promise<void> {
  const rows = posts.map((p) => ({
    clip_code: p.clip_code ?? null,
    clip_details_code: p.clip_details_code ?? null,
    stat_date: p.stat_date ?? null,
    content_id: p.content_id ?? null,
    platform: (p.platform as string).toLowerCase(),
    posted_at: p.date,
    title: p.title,
    content_type: p.content_type ?? null,
    url: p.url ?? null,
    thumbnail_url: p.thumbnail_url ?? null,
    views: p.views,
    likes: p.likes,
    comments: p.comments,
    shares: p.shares,
    // YouTube daily stat fields
    duration_seconds: p.duration_seconds ?? null,
    daily_engaged_views: p.daily_engaged_views ?? null,
    total_engaged_views: p.total_engaged_views ?? null,
    watch_time_hours: p.watch_time_hours ?? null,
    watch_time_minutes: p.watch_time_hours != null ? p.watch_time_hours * 60 : (p.watch_time_minutes ?? null),
    avg_view_duration_seconds: p.avg_view_duration_seconds ?? null,
    avg_view_percentage: p.avg_view_percentage ?? null,
    impressions: p.impressions ?? null,
    impression_ctr: p.impression_ctr ?? null,
    unique_viewers: p.unique_viewers ?? null,
    youtube_premium_views: p.youtube_premium_views ?? null,
    subscribers_gained: p.subscribers_gained ?? null,
    subscribers_lost: p.subscribers_lost ?? null,
    stayed_to_watch_pct: p.stayed_to_watch_pct ?? null,
    new_viewers: p.new_viewers ?? null,
    returning_viewers: p.returning_viewers ?? null,
    casual_viewers: p.casual_viewers ?? null,
    regular_viewers: p.regular_viewers ?? null,
    hypes: p.hypes ?? null,
    hype_points: p.hype_points ?? null,
    post_subscribers: p.post_subscribers ?? null,
    // YouTube legacy fields
    dislikes: p.dislikes ?? null,
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
    .upsert(rows, { onConflict: 'clip_code,platform,stat_date', ignoreDuplicates: false });

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
  clip_details_code: string | null;
  title: string | null;
  headline_banner: string | null;
  question_banner: string | null;
  caption_youtube_title: string | null;
  caption_tiktok: string | null;
  caption_instagram: string | null;
  caption_youtube: string | null;
  caption_linkedin: string | null;
  caption_twitter: string | null;
  video_url: string | null;
  thumbnail_base64?: string | null;
}

export async function fetchClipDetails(clipCode: string): Promise<ClipDetail | null> {
  // Resolve clip_details_code from posts (same pattern as fetchClipStats)
  const { data: postRow } = await supabase
    .from('posts')
    .select('clip_details_code')
    .eq('clip_code', clipCode)
    .not('clip_details_code', 'is', null)
    .limit(1)
    .maybeSingle();

  const lookupCode = (postRow?.clip_details_code as string | null) ?? clipCode;

  const { data, error } = await supabase
    .from('clip_details')
    .select(
      'clip_code, clip_details_code, title, headline_banner, question_banner, ' +
      'caption_youtube_title, caption_tiktok, caption_instagram, caption_youtube, caption_linkedin, caption_twitter, ' +
      'video_url, thumbnail_base64'
    )
    .eq('clip_code', lookupCode)
    .maybeSingle();

  if (error) throw error;
  return data as ClipDetail | null;
}

export async function fetchAllClipDetails(): Promise<ClipDetail[]> {
  const { data, error } = await supabase
    .from('clip_details')
    .select(
      'clip_code, clip_details_code, title, headline_banner, question_banner, ' +
      'caption_youtube_title, caption_tiktok, caption_instagram, caption_youtube, caption_linkedin, caption_twitter, ' +
      'video_url, thumbnail_base64'
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

export async function updatePostsClipDetailsCode(clipCode: string, clipDetailsCode: string): Promise<number> {
  const { data, error } = await supabase
    .from('posts')
    .update({ clip_details_code: clipDetailsCode })
    .eq('clip_code', clipCode)
    .select('id');
  if (error) throw error;
  return (data ?? []).length;
}

export async function upsertClipDetail(row: ClipDetail): Promise<void> {
  const { error } = await supabase.from('clip_details').upsert(row, { onConflict: 'clip_code' });
  if (error) throw error;
}

export async function deleteClipDetail(clipCode: string): Promise<void> {
  const { error } = await supabase.from('clip_details').delete().eq('clip_code', clipCode);
  if (error) throw error;
}

// ── Clip versions ─────────────────────────────────────────────────────────────

export interface ClipVersion {
  id: string;
  clip_details_code: string;
  version_number: number;
  video_url: string;
  created_at: string;
}

export async function getClipVersions(clip_details_code: string): Promise<ClipVersion[]> {
  const { data, error } = await supabase
    .from('clip_versions')
    .select('*')
    .eq('clip_details_code', clip_details_code)
    .order('version_number', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ClipVersion[];
}

export async function addClipVersion(
  clip_details_code: string,
  video_url: string,
  version_number: number
): Promise<void> {
  const { error } = await supabase
    .from('clip_versions')
    .insert({ clip_details_code, video_url, version_number });
  if (error) throw error;
}

// ── Review comments ───────────────────────────────────────────────────────────

export interface ReviewComment {
  id: string;
  clip_details_code: string;
  version_id: string;
  timestamp_start: number;
  timestamp_end: number | null;
  comment: string;
  author: string;
  resolved: boolean;
  created_at: string;
}

export async function getReviewComments(
  clip_details_code: string,
  version_id: string
): Promise<ReviewComment[]> {
  const { data, error } = await supabase
    .from('review_comments')
    .select('*')
    .eq('clip_details_code', clip_details_code)
    .eq('version_id', version_id)
    .order('timestamp_start', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ReviewComment[];
}

export async function addReviewComment(payload: {
  clip_details_code: string;
  version_id: string;
  timestamp_start: number;
  timestamp_end: number | null;
  comment: string;
}): Promise<void> {
  const { error } = await supabase.from('review_comments').insert({
    ...payload,
    author: 'User',
    resolved: false,
  });
  if (error) throw error;
}

export async function resolveComment(id: string): Promise<void> {
  const { error } = await supabase
    .from('review_comments')
    .update({ resolved: true })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteComment(id: string): Promise<void> {
  const { error } = await supabase
    .from('review_comments')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ── Clip stats ──────────────────────────────────────────────────────────────────

export interface ClipStats {
  views: number;
  likes: number;
  comments: number;
  shares: number;
}

export async function fetchClipStats(clipCode: string): Promise<ClipStats> {
  const { data, error } = await supabase
    .from('posts')
    .select('platform, stat_date, views, likes, comments, shares')
    .or(`clip_details_code.eq."${clipCode}",clip_code.eq."${clipCode}"`)
    .order('stat_date', { ascending: false, nullsFirst: false });

  if (error) throw error;

  const seen = new Set<string>();
  const stats: ClipStats = { views: 0, likes: 0, comments: 0, shares: 0 };

  for (const row of (data ?? [])) {
    const platform = row.platform as string;
    if (!seen.has(platform)) {
      seen.add(platform);
      stats.views    += Number(row.views    ?? 0);
      stats.likes    += Number(row.likes    ?? 0);
      stats.comments += Number(row.comments ?? 0);
      stats.shares   += Number(row.shares   ?? 0);
    }
  }

  return stats;
}
