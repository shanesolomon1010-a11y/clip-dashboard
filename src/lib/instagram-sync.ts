/**
 * Instagram sync orchestrator (Phase 3 — see
 * docs/superpowers/plans/2026-05-15-instagram-pipeline.md).
 *
 * Mirrors src/lib/youtube-sync.ts in shape. On each cron tick:
 *   1. Read instagram_auth. If updated_at > 46 days old, refresh the token
 *      in place (rotate via /refresh_access_token, write back, then use the
 *      new token for the rest of the run).
 *   2. Fetch /me/media once. Pass to discoverInstagramMedia so we don't
 *      double-fetch, and reuse it as a lookup for permalink + publish date
 *      during the per-media sync loop.
 *   3. For every registry row (auto-mapped AND PENDING-IG-*):
 *        a. fetchMediaInsights — returns LIFETIME CUMULATIVE values.
 *        b. Compute previous cumulative via SUM(posts.metric) WHERE
 *           clip_details_code = ? AND platform = 'instagram' AND
 *           stat_date < today. Per-Reel scope (NOT clip_code, which is the
 *           shared episode code).
 *        c. Compute today's delta = current_lifetime - previous_cumulative.
 *           Negative deltas clamp to 0 with a warning (deleted comments,
 *           occasional IG metric reissues).
 *        d. Upsert a daily-delta row to posts.
 *        e. fetchMediaComments + fetchCommentReplies per top-level comment
 *           with reply_count > 0. Upsert all to instagram_comments.
 *   4. Wrap per-media work in try/catch — one media failure doesn't kill
 *      the run.
 *
 * Note: total_interactions is NOT stored. Derive on read as
 * likes + comments + shares + saves (Meta's definition for Reels).
 */

import { supabase } from './supabase';
import {
  fetchCommentReplies,
  fetchMediaComments,
  fetchMediaInsights,
  fetchMediaList,
  getInstagramAuth,
  InstagramMedia,
  refreshAccessToken,
  supabaseAdmin,
} from './instagram';
import { discoverInstagramMedia, InstagramDiscoveryResult } from './instagram-discovery';
import {
  getInstagramRegistry,
  InstagramCommentDbRow,
  InstagramRegistryRow,
  upsertInstagramComments,
  upsertPosts,
} from './db';
import type { UnifiedPost } from '@/types';

const TOKEN_REFRESH_WINDOW_DAYS = 46;

export interface InstagramSyncResult {
  rowsProcessed: number;
  mediaProcessed: number;
  commentsIngested: number;
  repliesIngested: number;
  discovered: InstagramDiscoveryResult;
  tokenRefreshed: boolean;
}

interface PreviousCumulative {
  views: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
}

async function getPreviousCumulative(
  clipDetailsCode: string,
  today: string,
): Promise<{ sums: PreviousCumulative; hasHistory: boolean }> {
  const { data, error } = await supabase
    .from('posts')
    .select('views, reach, likes, comments, shares, saves')
    .eq('clip_details_code', clipDetailsCode)
    .eq('platform', 'instagram')
    .lt('stat_date', today);
  if (error) throw error;
  const rows = data ?? [];
  const sums: PreviousCumulative = { views: 0, reach: 0, likes: 0, comments: 0, shares: 0, saves: 0 };
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    sums.views += Number(r.views ?? 0);
    sums.reach += Number(r.reach ?? 0);
    sums.likes += Number(r.likes ?? 0);
    sums.comments += Number(r.comments ?? 0);
    sums.shares += Number(r.shares ?? 0);
    sums.saves += Number(r.saves ?? 0);
  }
  return { sums, hasHistory: rows.length > 0 };
}

function subtractDay(yyyymmdd: string): string {
  const d = new Date(yyyymmdd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function clampDelta(metric: string, clipDetailsCode: string, current: number, previous: number): number {
  const d = current - previous;
  if (d < 0) {
    console.warn(
      `[instagram-sync] negative delta on ${metric} for ${clipDetailsCode} ` +
      `(current=${current}, previous=${previous}) — clamping to 0`,
    );
    return 0;
  }
  return d;
}

async function maybeRefreshToken(): Promise<{ accessToken: string; igUserId: string; refreshed: boolean }> {
  const auth = await getInstagramAuth();
  const updatedAt = new Date(auth.updated_at);
  const ageMs = Date.now() - updatedAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  if (ageDays <= TOKEN_REFRESH_WINDOW_DAYS) {
    return { accessToken: auth.access_token, igUserId: auth.ig_user_id, refreshed: false };
  }

  console.log(`[instagram-sync] token age ${ageDays.toFixed(1)}d > ${TOKEN_REFRESH_WINDOW_DAYS}d — refreshing`);
  const { token, expiresIn } = await refreshAccessToken(auth.access_token);
  const newExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('instagram_auth')
    .update({ access_token: token, token_expiry: newExpiry, updated_at: now })
    .eq('id', auth.id);
  if (error) throw new Error(`Failed to persist refreshed token: ${error.message}`);
  console.log(`[instagram-sync] token refreshed, new expiry ${newExpiry}`);
  return { accessToken: token, igUserId: auth.ig_user_id, refreshed: true };
}

function firstCaptionLine(caption: string | null): string {
  if (!caption) return '';
  return caption.split('\n')[0].slice(0, 200);
}

interface MediaSyncOutcome {
  post?: UnifiedPost;
  commentRows: InstagramCommentDbRow[];
  topLevelCount: number;
  replyCount: number;
}

async function syncOneMedia(
  registryRow: InstagramRegistryRow,
  media: InstagramMedia,
  accessToken: string,
  today: string,
): Promise<MediaSyncOutcome> {
  const { instagram_content_id: mediaId, clip_details_code: clipDetailsCode, clip_code: clipCode } = registryRow;

  const insights = await fetchMediaInsights(mediaId, accessToken);
  const { sums: previous, hasHistory } = await getPreviousCumulative(clipDetailsCode, today);

  const baseFields = {
    clip_code: clipCode,
    clip_details_code: clipDetailsCode,
    content_id: mediaId,
    platform: 'instagram' as const,
    content_type: 'reel',
    date: media.timestamp.slice(0, 10),
    title: firstCaptionLine(media.caption) || clipDetailsCode,
    url: media.permalink,
    thumbnail_url: media.thumbnail_url ?? undefined,
    engagementRate: 0,
  };

  // First-sight bootstrap: no prior posts row exists for this media. Write
  // ONE row at yesterday's stat_date with the full lifetime values, then
  // skip the today write. On the next cron tick, the bootstrap row becomes
  // "previous cumulative" and the standard diff math produces clean daily
  // deltas from then on. Comments still get ingested on the bootstrap tick.
  if (!hasHistory) {
    const bootstrapDate = subtractDay(today);
    const bootstrapPost: UnifiedPost = {
      ...baseFields,
      id: `${mediaId}_${bootstrapDate}`,
      stat_date: bootstrapDate,
      views: insights.views,
      reach: insights.reach,
      likes: insights.likes,
      comments: insights.comments,
      shares: insights.shares,
      saves: insights.saved,
    };
    console.log(
      `[instagram-sync] bootstrapping ${mediaId} (${clipDetailsCode}) at stat_date ${bootstrapDate} ` +
      `with lifetime views=${insights.views} reach=${insights.reach} likes=${insights.likes} ` +
      `comments=${insights.comments} shares=${insights.shares} saved=${insights.saved}`,
    );
    const commentRows = await tolerantFetchComments(mediaId, clipDetailsCode, accessToken);
    return {
      post: bootstrapPost,
      commentRows: commentRows.rows,
      topLevelCount: commentRows.topLevelCount,
      replyCount: commentRows.replyCount,
    };
  }

  const post: UnifiedPost = {
    ...baseFields,
    id: `${mediaId}_${today}`,
    stat_date: today,
    views: clampDelta('views', clipDetailsCode, insights.views, previous.views),
    reach: clampDelta('reach', clipDetailsCode, insights.reach, previous.reach),
    likes: clampDelta('likes', clipDetailsCode, insights.likes, previous.likes),
    comments: clampDelta('comments', clipDetailsCode, insights.comments, previous.comments),
    shares: clampDelta('shares', clipDetailsCode, insights.shares, previous.shares),
    saves: clampDelta('saved', clipDetailsCode, insights.saved, previous.saves),
  };

  const commentRows = await tolerantFetchComments(mediaId, clipDetailsCode, accessToken);
  return {
    post,
    commentRows: commentRows.rows,
    topLevelCount: commentRows.topLevelCount,
    replyCount: commentRows.replyCount,
  };
}

// Wraps fetchCommentsForMedia so a comments-fetch failure doesn't lose the
// posts row that was already constructed. Root cause hypothesis: bootstrap
// burst (52 insights + 52 comments + N replies in ~13s) triggers transient
// IG rate-limiting / per-Reel errors that throw out of fetchMediaComments
// or fetchCommentReplies. Pre-fix, the orchestrator's outer try/catch
// swallowed the post too; posts table missed 28 of 52 today rows
// (2026-05-15 incident). Full error message logged so the next cron tick
// can be grep'd to confirm whether the 28 failures are uniform (rate
// limit, scope) or heterogeneous.
async function tolerantFetchComments(
  mediaId: string,
  clipDetailsCode: string,
  accessToken: string,
): Promise<{ rows: InstagramCommentDbRow[]; topLevelCount: number; replyCount: number }> {
  try {
    return await fetchCommentsForMedia(mediaId, accessToken);
  } catch (err) {
    console.warn(
      `[instagram-sync] comments fetch failed for ${mediaId} (${clipDetailsCode}): ` +
      `${err instanceof Error ? err.message : String(err)} — post still written`,
    );
    return { rows: [], topLevelCount: 0, replyCount: 0 };
  }
}

async function fetchCommentsForMedia(
  mediaId: string,
  accessToken: string,
): Promise<{ rows: InstagramCommentDbRow[]; topLevelCount: number; replyCount: number }> {
  const topLevel = await fetchMediaComments(mediaId, accessToken);
  const rows: InstagramCommentDbRow[] = topLevel.map((c) => ({
    comment_id: c.id,
    media_id: mediaId,
    text: c.text,
    posted_at: c.timestamp,
    like_count: c.like_count,
    reply_count: c.reply_count,
    username: c.username,
    parent_comment_id: null,
  }));

  let replyCount = 0;
  for (const c of topLevel) {
    if (c.reply_count <= 0) continue;
    const replies = await fetchCommentReplies(c.id, accessToken);
    for (const r of replies) {
      rows.push({
        comment_id: r.id,
        media_id: mediaId,
        text: r.text,
        posted_at: r.timestamp,
        like_count: r.like_count,
        reply_count: 0,
        username: r.username,
        parent_comment_id: c.id,
      });
      replyCount++;
    }
  }

  return { rows, topLevelCount: topLevel.length, replyCount };
}

export async function runInstagramSync(): Promise<InstagramSyncResult> {
  const { accessToken, igUserId, refreshed: tokenRefreshed } = await maybeRefreshToken();

  // Fetch /me/media once — used for both discovery and the per-media sync loop.
  const allMedia = await fetchMediaList(igUserId, accessToken);
  const mediaById = new Map<string, InstagramMedia>(allMedia.map((m) => [m.id, m]));
  console.log(`[instagram-sync] fetched ${allMedia.length} media items from /me/media`);

  let discovered: InstagramDiscoveryResult = { matched: 0, pending: 0, skipped: 0, audited: 0 };
  let registry: InstagramRegistryRow[] = [];
  try {
    // Discovery returns the POST-MUTATION registry built incrementally so we
    // don't pay a second DB roundtrip or risk a stale read against rows we
    // just wrote. The registry field is stripped from the JSON response.
    const outcome = await discoverInstagramMedia(igUserId, accessToken, allMedia);
    const { registry: postDiscoveryRegistry, ...counters } = outcome;
    discovered = counters;
    registry = postDiscoveryRegistry;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[instagram-sync] discovery failed: ${message} — falling back to fresh registry read`);
    try {
      registry = await getInstagramRegistry();
    } catch (innerErr) {
      const innerMessage = innerErr instanceof Error ? innerErr.message : String(innerErr);
      console.error(`[instagram-sync] fallback getInstagramRegistry also failed: ${innerMessage}`);
    }
  }

  const pendingCount = registry.filter((r) => r.clip_code === 'PENDING').length;
  const mappedCount = registry.length - pendingCount;
  console.log(`[instagram-sync] registry has ${registry.length} entries (${mappedCount} mapped, ${pendingCount} pending)`);

  const today = new Date().toISOString().slice(0, 10);
  const posts: UnifiedPost[] = [];
  let mediaProcessed = 0;
  let commentsIngested = 0;
  let repliesIngested = 0;

  for (const registryRow of registry) {
    const media = mediaById.get(registryRow.instagram_content_id);
    if (!media) {
      console.warn(
        `[instagram-sync] registry has ${registryRow.instagram_content_id} (${registryRow.clip_details_code}) ` +
        `but /me/media did not return it — skipping (possibly deleted)`,
      );
      continue;
    }

    try {
      const outcome = await syncOneMedia(registryRow, media, accessToken, today);
      if (outcome.post) posts.push(outcome.post);
      if (outcome.commentRows.length > 0) {
        await upsertInstagramComments(outcome.commentRows);
      }
      mediaProcessed++;
      commentsIngested += outcome.topLevelCount;
      repliesIngested += outcome.replyCount;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[instagram-sync] media ${registryRow.instagram_content_id} ` +
        `(${registryRow.clip_details_code}) failed: ${message} — continuing`,
      );
    }
  }

  if (posts.length > 0) {
    await upsertPosts(posts);
  }

  console.log(
    `[instagram-sync] done: rowsProcessed=${posts.length}, mediaProcessed=${mediaProcessed}, ` +
    `commentsIngested=${commentsIngested}, repliesIngested=${repliesIngested}, ` +
    `tokenRefreshed=${tokenRefreshed}`,
  );

  return {
    rowsProcessed: posts.length,
    mediaProcessed,
    commentsIngested,
    repliesIngested,
    discovered,
    tokenRefreshed,
  };
}
