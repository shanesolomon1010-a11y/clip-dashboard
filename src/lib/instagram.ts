import { createClient } from '@supabase/supabase-js';

// Service-role Supabase client. instagram_auth has RLS enabled with no
// policies (verified via pg_class.relrowsecurity + pg_policy on 2026-05-15),
// so anon reads/writes are blocked. The cron sync route + discovery
// orchestrator + probe script all run server-side, so module-level
// instantiation is safe — this file is never imported by frontend code.
// Pattern mirrors src/app/api/library/sync-urls/route.ts:15-18. Exported so
// the sync orchestrator can reuse it for the token refresh write-back.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Instagram Graph API client. Mirrors src/lib/youtube.ts in style.
//
// Locked design decisions (see docs/superpowers/plans/2026-05-15-instagram-pipeline.md):
//   • All Insights metrics returned by fetchMediaInsights are LIFETIME
//     CUMULATIVE. The Phase 3 sync layer diffs against the previously-stored
//     cumulative to produce the daily delta written to posts.* columns.
//     DO NOT write these values directly to posts.views — that's a violation
//     of the daily-delta invariant (CLAUDE.md / lessons.md 2026-04-27).
//   • fetchMediaList returns every media (Reels, Feed Posts, Stories, etc.)
//     so the Phase 2 audit-first discovery code can log what's skipped before
//     the strict REELS-only rule is locked. Filtering is the caller's job.
//   • Pagination is handled internally via paging.next; callers never see
//     cursors or page tokens.

const IG_GRAPH_VERSION = 'v21.0';
const IG_GRAPH_BASE = `https://graph.instagram.com/${IG_GRAPH_VERSION}`;

// ── Auth ─────────────────────────────────────────────────────────────────────

export interface InstagramAuth {
  id: string;
  access_token: string;
  token_expiry: string;
  ig_user_id: string;
  updated_at: string;
}

// Reads the single-row instagram_auth table. Used by the Phase 3 cron to
// decide whether to refresh (compare token_expiry to now) and to source the
// ig_user_id without a hardcoded value in code.
export async function getInstagramAuth(): Promise<InstagramAuth> {
  const { data, error } = await supabaseAdmin
    .from('instagram_auth')
    .select('id, access_token, token_expiry, ig_user_id, updated_at')
    .maybeSingle();

  if (error || !data) {
    throw new Error('No instagram_auth row found — re-consent required');
  }
  const row = data as Record<string, unknown>;
  return {
    id: row.id as string,
    access_token: row.access_token as string,
    token_expiry: row.token_expiry as string,
    ig_user_id: row.ig_user_id as string,
    updated_at: row.updated_at as string,
  };
}

// Convenience wrapper for callers that only need the bearer token.
export async function getAccessToken(): Promise<string> {
  const auth = await getInstagramAuth();
  return auth.access_token;
}

interface RefreshResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: { message: string; type?: string; code?: number };
}

// Rotates the IG long-lived token in place. Caller is responsible for writing
// the new token + new token_expiry back to instagram_auth.
//
// IG's "refresh" is a token rotation via grant_type=ig_refresh_token against
// the existing long-lived token — NOT a separate refresh-token grant. The
// returned token replaces the current one entirely. expires_in is in seconds
// from now (typically 5184000 = 60 days).
export async function refreshAccessToken(
  currentToken: string,
): Promise<{ token: string; expiresIn: number }> {
  const url = new URL(`https://graph.instagram.com/refresh_access_token`);
  url.searchParams.set('grant_type', 'ig_refresh_token');
  url.searchParams.set('access_token', currentToken);

  const res = await fetch(url.toString());
  const data = await res.json() as RefreshResponse;
  if (!res.ok || !data.access_token || typeof data.expires_in !== 'number') {
    throw new Error(`Instagram token refresh failed: ${data.error?.message ?? res.status}`);
  }
  return { token: data.access_token, expiresIn: data.expires_in };
}

// ── Media list ───────────────────────────────────────────────────────────────

export type InstagramMediaType = 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | 'REELS';
export type InstagramMediaProductType = 'AD' | 'FEED' | 'STORY' | 'REELS';

export interface InstagramMedia {
  id: string;
  caption: string | null;
  media_type: InstagramMediaType;
  media_product_type: InstagramMediaProductType;
  permalink: string;
  thumbnail_url: string | null;
  timestamp: string;
}

interface MediaListResponse {
  data?: InstagramMedia[];
  paging?: {
    cursors?: { before?: string; after?: string };
    next?: string;
  };
  error?: { message: string; type?: string; code?: number };
}

// Returns every media item the authenticated IG account has published, across
// every page. Includes Reels, Feed Posts, Stories, Ads — callers filter by
// media_type/media_product_type as needed. The Phase 2 audit-first discovery
// flow uses this raw list to log what's skipped before locking the strict
// REELS-only rule.
//
// Pagination is handled internally via paging.next (full next-page URLs
// returned by the Graph API). No cursor is exposed to callers.
export async function fetchMediaList(
  igUserId: string,
  accessToken: string,
): Promise<InstagramMedia[]> {
  const result: InstagramMedia[] = [];

  const initial = new URL(`${IG_GRAPH_BASE}/${igUserId}/media`);
  initial.searchParams.set(
    'fields',
    'id,caption,media_type,media_product_type,permalink,thumbnail_url,timestamp',
  );
  initial.searchParams.set('access_token', accessToken);

  let nextUrl: string | undefined = initial.toString();

  while (nextUrl) {
    const res = await fetch(nextUrl);
    const data = await res.json() as MediaListResponse;
    if (!res.ok) {
      throw new Error(`Instagram /media error: ${data.error?.message ?? res.status}`);
    }
    for (const m of data.data ?? []) {
      result.push(m);
    }
    nextUrl = data.paging?.next;
  }

  return result;
}

// ── Insights (LIFETIME CUMULATIVE — diff in Phase 3 before writing posts) ───

export interface MediaInsights {
  mediaId: string;
  views: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saved: number;
  totalInteractions: number;
}

interface InsightsResponseValue {
  value: number;
}

interface InsightsResponseEntry {
  name: string;
  period: string;
  values: InsightsResponseValue[];
  title?: string;
  description?: string;
  id?: string;
}

interface InsightsResponse {
  data?: InsightsResponseEntry[];
  error?: { message: string; type?: string; code?: number };
}

const REELS_METRICS = [
  'views',
  'reach',
  'likes',
  'comments',
  'shares',
  'saved',
  'total_interactions',
] as const;

// Fetches Reels insights for one media. All values returned are LIFETIME
// CUMULATIVE — the Phase 3 sync layer is responsible for diffing against the
// previously-stored cumulative (in instagram_media_snapshots or equivalent)
// to derive the daily delta written to posts.* columns.
//
// Calling this on non-REELS media will fail with an unsupported-metric error.
// Filtering by media_product_type === 'REELS' is the caller's job.
export async function fetchMediaInsights(
  mediaId: string,
  accessToken: string,
): Promise<MediaInsights> {
  const url = new URL(`${IG_GRAPH_BASE}/${mediaId}/insights`);
  url.searchParams.set('metric', REELS_METRICS.join(','));
  url.searchParams.set('access_token', accessToken);

  const res = await fetch(url.toString());
  const data = await res.json() as InsightsResponse;
  if (!res.ok) {
    throw new Error(`Instagram /insights error for ${mediaId}: ${data.error?.message ?? res.status}`);
  }

  const byName = new Map<string, number>();
  for (const entry of data.data ?? []) {
    byName.set(entry.name, entry.values[0]?.value ?? 0);
  }

  return {
    mediaId,
    views:             byName.get('views') ?? 0,
    reach:             byName.get('reach') ?? 0,
    likes:             byName.get('likes') ?? 0,
    comments:          byName.get('comments') ?? 0,
    shares:            byName.get('shares') ?? 0,
    saved:             byName.get('saved') ?? 0,
    totalInteractions: byName.get('total_interactions') ?? 0,
  };
}

// ── Comments ─────────────────────────────────────────────────────────────────

export interface InstagramComment {
  id: string;
  text: string;
  timestamp: string;
  username: string | null;
  like_count: number;
  reply_count: number;
  parent_id: string | null;
}

interface CommentRepliesSummary {
  total_count: number;
}

interface CommentApiRow {
  id: string;
  text: string;
  timestamp: string;
  username?: string;
  like_count?: number;
  replies?: {
    summary?: CommentRepliesSummary;
    data?: CommentApiRow[];
  };
}

interface CommentsListResponse {
  data?: CommentApiRow[];
  paging?: { next?: string };
  error?: { message: string; type?: string; code?: number };
}

// Fetches every top-level comment on a media, across all pages. reply_count
// is sourced from the replies edge summary. Reply rows themselves come from
// fetchCommentReplies — IG only supports one level of nesting, but the API
// requires a separate call per parent comment.
//
// username is nullable (commenters with deleted/deactivated accounts or
// privacy restrictions return no username; we keep the comment row).
export async function fetchMediaComments(
  mediaId: string,
  accessToken: string,
): Promise<InstagramComment[]> {
  const result: InstagramComment[] = [];

  const initial = new URL(`${IG_GRAPH_BASE}/${mediaId}/comments`);
  initial.searchParams.set(
    'fields',
    'id,text,timestamp,username,like_count,replies.summary(true).limit(0)',
  );
  initial.searchParams.set('access_token', accessToken);

  let nextUrl: string | undefined = initial.toString();

  while (nextUrl) {
    const res = await fetch(nextUrl);
    const data = await res.json() as CommentsListResponse;
    if (!res.ok) {
      throw new Error(`Instagram /comments error for ${mediaId}: ${data.error?.message ?? res.status}`);
    }
    for (const row of data.data ?? []) {
      result.push({
        id: row.id,
        text: row.text,
        timestamp: row.timestamp,
        username: row.username ?? null,
        like_count: row.like_count ?? 0,
        reply_count: row.replies?.summary?.total_count ?? 0,
        parent_id: null,
      });
    }
    nextUrl = data.paging?.next;
  }

  return result;
}

// Fetches every reply for a given parent comment, across all pages. IG
// caps reply nesting at one level, so reply_count on these rows is always 0
// and parent_id is always populated.
export async function fetchCommentReplies(
  parentCommentId: string,
  accessToken: string,
): Promise<InstagramComment[]> {
  const result: InstagramComment[] = [];

  const initial = new URL(`${IG_GRAPH_BASE}/${parentCommentId}/replies`);
  initial.searchParams.set('fields', 'id,text,timestamp,username,like_count');
  initial.searchParams.set('access_token', accessToken);

  let nextUrl: string | undefined = initial.toString();

  while (nextUrl) {
    const res = await fetch(nextUrl);
    const data = await res.json() as CommentsListResponse;
    if (!res.ok) {
      throw new Error(`Instagram /replies error for ${parentCommentId}: ${data.error?.message ?? res.status}`);
    }
    for (const row of data.data ?? []) {
      result.push({
        id: row.id,
        text: row.text,
        timestamp: row.timestamp,
        username: row.username ?? null,
        like_count: row.like_count ?? 0,
        reply_count: 0,
        parent_id: parentCommentId,
      });
    }
    nextUrl = data.paging?.next;
  }

  return result;
}
