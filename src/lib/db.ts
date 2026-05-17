import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { Platform, UnifiedPost } from '@/types';

// Lazy service-role client for the handful of helpers below that touch tables
// with RLS enabled and no anon policies (instagram_comments,
// instagram_discovery_audit — verified via pg_class.relrowsecurity 2026-05-15).
// LAZY (not module-level) because db.ts is imported by frontend components;
// instantiating createClient at module load would put SUPABASE_SERVICE_ROLE_KEY
// references into the client bundle. This function is only ever called from
// server-side cron code paths.
let _adminClient: SupabaseClient | null = null;
function adminClient(): SupabaseClient {
  if (_adminClient) return _adminClient;
  _adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  return _adminClient;
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

  // Fields written only by the Playwright agent (period aggregates merged onto a
  // specific stat_date row). The Analytics API writes newer daily rows without
  // these, so the "latest" row is often null for them. We scan older rows to fill.
  const AGENT_FIELDS = [
    'unique_viewers', 'new_viewers', 'returning_viewers', 'casual_viewers',
    'regular_viewers', 'impressions', 'impression_ctr', 'stayed_to_watch_pct',
    'hypes', 'hype_points', 'post_subscribers',
  ];

  // Group all rows by clip_code::platform (already sorted stat_date DESC).
  // PENDING rows share clip_code='PENDING' so we fall back to clip_details_code
  // for the key suffix — otherwise every PENDING short collapses into one bucket.
  const byKey = new Map<string, Record<string, unknown>[]>();
  for (const row of data ?? []) {
    const clipCode = row.clip_code as string | null;
    const clipDetailsCode = row.clip_details_code as string | null;
    let key: string;
    if (clipCode === 'PENDING' && clipDetailsCode) {
      key = `${clipDetailsCode}::${row.platform as string}`;
    } else if (clipCode && clipCode !== 'PENDING') {
      key = `${clipCode}::${row.platform as string}`;
    } else {
      key = row.id as string;
    }
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(row as Record<string, unknown>);
  }

  // Use the latest row as the base, then back-fill any null agent-only fields
  // from the most-recent older row that has a value for that field.
  const result: UnifiedPost[] = [];
  for (const rows of Array.from(byKey.values())) {
    const merged: Record<string, unknown> = { ...rows[0] };
    for (const field of AGENT_FIELDS) {
      if (merged[field] == null) {
        for (const row of rows) {
          if (row[field] != null) { merged[field] = row[field]; break; }
        }
      }
    }
    result.push(mapPostRow(merged));
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
    .not('clip_code', 'is', null)
    .neq('clip_code', 'PENDING');

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

// Returns rows ordered by stat_date ASC. When startDate/endDate are provided,
// the filter is applied at the DB layer to keep the result set under Supabase's
// default 1000-row response cap.
export async function getAllPostsByDate(
  platform?: string,
  startDate?: string,
  endDate?: string,
): Promise<UnifiedPost[]> {
  // Paginated to defeat the Supabase 1000-row response cap (CLAUDE.md). Without
  // bounds (e.g. Dashboard "All Time") the table easily exceeds 1000 rows and a
  // single .select() would silently return only the oldest 1000 — same defensive
  // pattern as /api/founder-report.
  const PAGE = 1000;
  const all: Record<string, unknown>[] = [];
  let from = 0;
  for (;;) {
    let query = supabase
      .from('posts')
      .select('*')
      .order('stat_date', { ascending: true, nullsFirst: false })
      .range(from, from + PAGE - 1);

    if (platform) query = query.eq('platform', platform);
    if (startDate) query = query.gte('stat_date', startDate);
    if (endDate) query = query.lte('stat_date', endDate);

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as Record<string, unknown>[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return all.map((row) => mapPostRow(row));
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
function fillWatchTimeFields(
  hours: number | null | undefined,
  minutes: number | null | undefined,
): { watch_time_hours: number | null; watch_time_minutes: number | null } {
  const h = hours ?? null;
  const m = minutes ?? null;
  if (h != null && m == null) {
    return { watch_time_hours: h, watch_time_minutes: Math.round(h * 60 * 100) / 100 };
  }
  if (m != null && h == null) {
    return { watch_time_hours: Math.round((m / 60) * 100) / 100, watch_time_minutes: m };
  }
  return { watch_time_hours: h, watch_time_minutes: m };
}

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
    ...fillWatchTimeFields(p.watch_time_hours, p.watch_time_minutes),
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

  // Deduplicate by conflict key — last row wins
  const seen = new Map<string, typeof rows[0]>();
  for (const row of rows) {
    const key = `${row.clip_details_code}|${row.platform}|${row.stat_date}`;
    seen.set(key, row);
  }
  const dedupedRows = Array.from(seen.values());

  console.log(`[upsertPosts] inserting ${dedupedRows.length} rows. First row sample:`, JSON.stringify(dedupedRows[0], null, 2));

  const { error } = await supabase
    .from('posts')
    .upsert(dedupedRows, { onConflict: 'clip_details_code,platform,stat_date', ignoreDuplicates: false });

  if (error) throw error;
}

export interface BreakdownUpsertRow {
  clip_details_code: string;
  clip_code: string | null;
  content_id: string;
  platform: string;
  stat_date: string;
  dimension_type: string;
  dimension_value: string;
  views: number;
  watch_time_minutes: number;
  avg_view_duration_seconds: number;
  updated_at: string;
}

export async function upsertBreakdowns(rows: BreakdownUpsertRow[]): Promise<void> {
  const seen = new Map<string, BreakdownUpsertRow>();
  for (const row of rows) {
    const key = `${row.content_id}|${row.platform}|${row.stat_date}|${row.dimension_type}|${row.dimension_value}`;
    seen.set(key, row);
  }
  const deduped = Array.from(seen.values());

  const CHUNK = 500;
  for (let i = 0; i < deduped.length; i += CHUNK) {
    const { error } = await supabase
      .from('post_breakdowns')
      .upsert(deduped.slice(i, i + CHUNK), {
        onConflict: 'content_id,platform,stat_date,dimension_type,dimension_value',
        ignoreDuplicates: false,
      });
    if (error) throw error;
  }
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
  let lookupCode = clipCode;

  if (!clipCode.includes('-CLIP-')) {
    // Resolve clip_details_code from posts
    const { data: postRow } = await supabase
      .from('posts')
      .select('clip_details_code')
      .eq('clip_code', clipCode)
      .not('clip_details_code', 'is', null)
      .limit(1)
      .maybeSingle();

    lookupCode = (postRow?.clip_details_code as string | null) ?? clipCode;
  }

  const { data, error } = await supabase
    .from('clip_details')
    .select(
      'clip_code, clip_details_code, title, headline_banner, question_banner, ' +
      'caption_youtube_title, caption_tiktok, caption_instagram, caption_youtube, caption_linkedin, caption_twitter, ' +
      'video_url, thumbnail_base64'
    )
    .eq('clip_details_code', lookupCode)
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

// ── Shorts registry (Phase 3a — see docs/superpowers/plans/2026-05-14-shorts-auto-discovery.md) ──

export interface ShortsRegistryRow {
  content_id: string;
  clip_details_code: string;
  clip_code: string;
}

// Every clip_details row with a populated content_id. Includes PENDING rows so
// the cron still collects daily stats for un-mapped uploads.
//
// JS-side filtering (not .not('content_id', 'is', null) at the SQL layer) —
// defensive transform per 2026-05-15 incident on the IG analog
// (getInstagramRegistry / 88d6a92): the supabase-js .not(...is...null) filter
// returned [] from the Vercel runtime even though the equivalent PostgREST URL
// returned the rows via raw curl with the same anon key. Same pattern here,
// same fix. clip_details is small (~200 rows), so JS-side filtering has no
// perf cost.
export async function getShortsRegistry(): Promise<ShortsRegistryRow[]> {
  const { data, error } = await supabase
    .from('clip_details')
    .select('content_id, clip_details_code, clip_code');
  if (error) throw error;
  const all = data ?? [];
  const filtered = all.filter((row) => {
    const r = row as Record<string, unknown>;
    return r.content_id != null;
  });
  console.log(
    `[db] getShortsRegistry fetched ${all.length} rows total, ` +
    `${filtered.length} with non-null content_id`,
  );
  return filtered.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      content_id: r.content_id as string,
      clip_details_code: r.clip_details_code as string,
      clip_code: r.clip_code as string,
    };
  });
}

// Auto-map path: sets content_id on an existing clip_details row only when
// currently null. Returns true if a row was updated.
export async function setClipDetailContentIdIfNull(
  contentId: string,
  clipDetailsCode: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('clip_details')
    .update({ content_id: contentId })
    .eq('clip_details_code', clipDetailsCode)
    .is('content_id', null)
    .select('clip_details_code');
  if (error) throw error;
  return (data ?? []).length > 0;
}

// Re-keys posts rows previously written under PENDING-{contentId} to the newly
// mapped clip_details_code. Must run after setClipDetailContentIdIfNull so the
// next cron tick's upsert (keyed by clip_details_code,platform,stat_date)
// matches an existing row instead of attempting an INSERT that would collide
// on posts_contentid_platform_statdate_key. Returns count of rows re-keyed.
//
// Failure path (most likely 23505 if posts already has rows under the new code
// for overlapping stat_dates) is swallowed: we log and return 0 so discovery
// keeps running. The orphan PENDING rows can be cleaned up by hand.
export async function rekeyPendingPostsToMappedCode(
  contentId: string,
  newClipDetailsCode: string,
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('posts')
      .update({ clip_details_code: newClipDetailsCode })
      .eq('platform', 'youtube')
      .eq('content_id', contentId)
      .like('clip_details_code', 'PENDING-%')
      .select('id');
    if (error) {
      console.warn(
        `[db] rekeyPendingPostsToMappedCode ${contentId} → ${newClipDetailsCode} failed: ${error.message}. Leaving orphan PENDING rows for manual cleanup.`,
      );
      return 0;
    }
    return (data ?? []).length;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[db] rekeyPendingPostsToMappedCode ${contentId} → ${newClipDetailsCode} threw: ${message}. Leaving orphan PENDING rows.`,
    );
    return 0;
  }
}

// PENDING path: inserts a placeholder clip_details row for an un-mapped channel
// video. Idempotent via upsert on the partial unique index on content_id —
// concurrent discovery runs become no-ops on the duplicate, not warnings.
export async function registerPendingShort(contentId: string): Promise<void> {
  const { error } = await supabase
    .from('clip_details')
    .upsert(
      {
        clip_code: 'PENDING',
        clip_details_code: `PENDING-${contentId}`,
        content_id: contentId,
      },
      { onConflict: 'content_id', ignoreDuplicates: true },
    );
  if (error) throw error;
}

// ── Instagram registry (Phase 2 — see docs/superpowers/plans/2026-05-15-instagram-pipeline.md) ──

export interface InstagramRegistryRow {
  instagram_content_id: string;
  clip_details_code: string;
  clip_code: string;
  skip_insights: boolean;
}

// Every clip_details row with a populated instagram_content_id. Includes
// PENDING-IG- rows so the cron still collects daily stats for un-mapped Reels.
//
// JS-side filtering (not .not('instagram_content_id', 'is', null) at the SQL
// layer) — 2026-05-15 incident: the supabase-js .not(...is...null) filter
// returned [] from the Vercel runtime even though the equivalent PostgREST
// URL ?instagram_content_id=not.is.null returned 59 rows via raw curl with
// the same anon key. Root cause unidentified (possibly a supabase-js client
// quirk specific to the Vercel runtime / new column / null-filter combo);
// not worth debugging in production hot-path code. clip_details is small
// (~200 rows), so JS-side filtering has no perf cost.
export async function getInstagramRegistry(): Promise<InstagramRegistryRow[]> {
  const { data, error } = await supabase
    .from('clip_details')
    .select('instagram_content_id, clip_details_code, clip_code, skip_insights');
  if (error) throw error;
  const all = data ?? [];
  const filtered = all.filter((row) => {
    const r = row as Record<string, unknown>;
    return r.instagram_content_id != null;
  });
  console.log(
    `[db] getInstagramRegistry fetched ${all.length} rows total, ` +
    `${filtered.length} with non-null instagram_content_id`,
  );
  return filtered.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      instagram_content_id: r.instagram_content_id as string,
      clip_details_code: r.clip_details_code as string,
      clip_code: r.clip_code as string,
      skip_insights: (r.skip_insights as boolean | null) ?? false,
    };
  });
}

// Auto-map path: sets instagram_content_id on an existing clip_details row
// only when currently null. Returns true if a row was updated.
export async function setClipDetailInstagramContentIdIfNull(
  instagramContentId: string,
  clipDetailsCode: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('clip_details')
    .update({ instagram_content_id: instagramContentId })
    .eq('clip_details_code', clipDetailsCode)
    .is('instagram_content_id', null)
    .select('clip_details_code');
  if (error) throw error;
  return (data ?? []).length > 0;
}

// PENDING path: inserts a placeholder clip_details row for an un-mapped IG
// media. The PENDING-IG- prefix on clip_details_code differentiates IG PENDING
// rows from YouTube PENDING rows in the shared clip_details table — avoids
// any collision if an IG media_id ever happened to match a YouTube video_id.
// Idempotent via the regular UNIQUE constraint on instagram_content_id
// (20260515_clip_details_instagram_content_id.sql).
export async function registerInstagramPending(instagramContentId: string): Promise<void> {
  const { error } = await supabase
    .from('clip_details')
    .upsert(
      {
        clip_code: 'PENDING',
        clip_details_code: `PENDING-IG-${instagramContentId}`,
        instagram_content_id: instagramContentId,
      },
      { onConflict: 'instagram_content_id', ignoreDuplicates: true },
    );
  if (error) throw error;
}

export interface InstagramAuditRow {
  media_id: string;
  media_type: string;
  media_product_type: string;
  permalink: string;
  caption_first_line: string | null;
}

// Audit log of non-REELS media skipped by the discovery flow (Q6 audit-first).
// Idempotent via PRIMARY KEY on media_id — re-running discovery is a no-op for
// already-audited media. Uses service-role because instagram_discovery_audit
// has RLS enabled with no anon policies.
export async function logSkippedMediaToAudit(row: InstagramAuditRow): Promise<void> {
  const { error } = await adminClient()
    .from('instagram_discovery_audit')
    .upsert(row, { onConflict: 'media_id', ignoreDuplicates: true });
  if (error) throw error;
}

export interface InstagramCommentDbRow {
  comment_id: string;
  media_id: string;
  text: string;
  posted_at: string;
  like_count: number;
  reply_count: number;
  username: string | null;
  parent_comment_id: string | null;
}

// Upserts per-comment rows into instagram_comments. Conflict key is the
// PRIMARY KEY (comment_id); ignoreDuplicates: false so updated like_count /
// reply_count / text edits land on later syncs. Uses service-role because
// instagram_comments has RLS enabled with no anon policies.
export async function upsertInstagramComments(rows: InstagramCommentDbRow[]): Promise<void> {
  if (rows.length === 0) return;
  const now = new Date().toISOString();
  const withTimestamps = rows.map((r) => ({ ...r, updated_at: now }));
  const { error } = await adminClient()
    .from('instagram_comments')
    .upsert(withTimestamps, { onConflict: 'comment_id', ignoreDuplicates: false });
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

