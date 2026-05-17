# Session Primer

_This file is rewritten by Claude at the end of every session._
_It captures current project state so the next session starts with full context._

## Status
HEAD is `07bec9e` (pushed to `origin/main`). Shipped the entire Instagram Graph API ingestion pipeline (Phases 0–3 + 5 fixes). 8 commits this session, 7 already on `origin/main`:

- `9f3558d` feat: Instagram Graph API ingestion pipeline (Phases 0-3)
- `cf3d6fa` fix: route Instagram RLS-blocked writes through service-role client
- `c45a3c2` fix: return post-mutation registry from instagram discovery
- `88d6a92` fix: JS-side filter in getInstagramRegistry — supabase-js .not quirk
- `4964127` fix: decouple instagram comment fetch failures from post writes
- `2cd3c7b` feat: skip_insights flag for pre-Business-conversion IG Reels
- `07bec9e` fix: JS-side filter sweep for parallel .not() patterns
- (this commit, unpushed) chore: session shutdown — IG pipeline shipped end-to-end

Architecture: IG Reels from `matteo.mediabuyer` (IG user 17841476696015978) now flow through the same `posts` daily-delta model as YouTube Shorts. New `instagram_auth` table (server-side, RLS-blocked, service-role only). New `clip_details.instagram_content_id` column (regular UNIQUE constraint, not partial). New `clip_details.skip_insights` column for the 7 pre-Business-conversion Reels that permanently fail `/insights`. New `instagram_comments` table for per-comment rows. New `instagram_discovery_audit` table for non-REELS skipped media (Q6 audit-first). Five migrations applied via Supabase SQL Editor over the session.

Discovery: `src/lib/instagram-discovery.ts` parses captions for `/MBM\d{3}-CLIP-\d{3}/`, auto-maps to existing `clip_details` rows or registers `PENDING-IG-{mediaId}`. Strict `media_product_type === 'REELS'` filter; non-REELS get logged to the audit table. Returns the post-mutation registry incrementally (avoids re-read).

Sync: `src/lib/instagram-sync.ts` orchestrates per-media: insights (lifetime cumulative) → `getPreviousCumulative` via `SUM(posts.metric) WHERE clip_details_code = ?` → `clampDelta` per metric → upsert to posts with `stat_date = today`. First-sight bootstrap writes the full lifetime to `stat_date = yesterday` then skips the today write. Comments wrapped in `tolerantFetchComments` so comment fetch failures don't take the post row down. Token refresh inline on cron tick if `instagram_auth.updated_at > 46d`. Cron at `0 11,17,23,5 * * *` UTC, staggered from YouTube.

## Just completed (2026-05-15 → 2026-05-17)

### Phase 0 — schema (5 migrations)
- `20260515_instagram_auth.sql` — single-row token store (id, access_token, token_expiry, ig_user_id, updated_at).
- `20260515_clip_details_instagram_content_id.sql` — text column + regular UNIQUE constraint (NOT partial, per lessons.md 2026-05-14).
- `20260515_instagram_comments.sql` — per-comment rows (comment_id PK, media_id, text, posted_at, like_count, reply_count, username, parent_comment_id, created_at, updated_at). `media_id` is a soft reference, not FK.
- `20260516_instagram_discovery_audit.sql` — non-REELS audit log (media_id PK, media_type, media_product_type, permalink, caption_first_line, discovered_at).
- `20260515_clip_details_skip_insights.sql` — boolean NOT NULL DEFAULT false. Shane to flag the 7 pre-Business-conversion media IDs via SQL Editor (UPDATE pending — MCP read-only blocked the automated path).

### Phase 1 — Graph API client (`src/lib/instagram.ts`)
- Module-level `supabaseAdmin` (service-role) — safe because `instagram.ts` is server-only-imported. Used by `getInstagramAuth` + token refresh write.
- `getInstagramAuth` / `getAccessToken` / `refreshAccessToken` / `fetchMediaList` (paginated via `paging.next`) / `fetchMediaInsights` (LIFETIME cumulative — Q1 lock confirmed via probe) / `fetchMediaComments` (with `replies.summary(true).limit(0)` for reply count without double-fetch) / `fetchCommentReplies`.
- Strict typing on every response shape. No `any`.

### Phase 2 — discovery (`src/lib/instagram-discovery.ts`)
- `discoverInstagramMedia` accepts optional `preFetchedMedia` (orchestrator passes it to avoid double-fetching /me/media).
- Strict REELS filter; non-REELS upsert to `instagram_discovery_audit` (Q6 audit-first).
- Caption regex auto-map → `setClipDetailInstagramContentIdIfNull` (mapped) or `registerInstagramPending` (PENDING-IG-{mediaId}).
- Returns `InstagramDiscoveryOutcome` extending `InstagramDiscoveryResult` with the post-mutation registry built incrementally (avoids the `.not()` filter quirk + any stale-read risk).

### Phase 3 — orchestrator + cron route
- `src/lib/instagram-sync.ts` — `runInstagramSync` does maybeRefreshToken → fetchMediaList → discovery → per-media loop. First-sight bootstrap path writes `stat_date=yesterday` lifetime row, skips today. `getPreviousCumulative` filtered by `clip_details_code` (per-Reel) + `stat_date < today`. `clampDelta` warns + clamps negative deltas to 0.
- `tolerantFetchComments` wraps the comments fetch so a `/comments` or `/replies` throw logs the full underlying error and returns empty `commentRows`, letting the post still be written.
- `skip_insights` flag silently continues past flagged Reels — no API call, no per-Reel log. Aggregate count in registry summary log.
- `/api/cron/instagram-sync/route.ts` — Bearer CRON_SECRET, force-dynamic, mirrors `/api/cron/youtube-sync` shape. Cron entry in vercel.json at `0 11,17,23,5 * * *`.

### Fixes shipped in-session
- `cf3d6fa` — RLS audit (via Supabase MCP read-only) revealed all 3 new IG tables are RLS-enabled-no-policies. `supabaseAdmin` in `instagram.ts` (module-level, safe), lazy `adminClient()` in `db.ts` (frontend-imported, can't be module-level), used for `upsertInstagramComments` + `logSkippedMediaToAudit`. Token refresh write in `instagram-sync.ts` uses `supabaseAdmin`.
- `c45a3c2` — stale-read fix: discovery returns post-mutation registry incrementally. End-to-end audit confirmed no other stale-read traps.
- `88d6a92` — `supabase-js .not('instagram_content_id', 'is', null)` returned [] from the Vercel runtime even though raw curl returned the rows. JS-side filter workaround. Console.log for visibility.
- `4964127` — comment fetch failures no longer discard the already-built post (35 of 52 today rows were being dropped via outer try/catch swallowing).
- `2cd3c7b` — `skip_insights` column + cron wiring for the 7 pre-Business Reels.
- `07bec9e` — defensive `.not()` sweep at `getShortsRegistry` + founder-report (same pattern as the IG quirk).

### Tooling
- `scripts/instagram-insights-probe.ts` (service-role) — used 2026-05-15 + 2026-05-16 to confirm lifetime-cumulative hypothesis (Q1). Day 2 values went 183→184 views and 158→159 reach in 9 minutes — daily-reset metrics cannot increment within the same calendar day, so running-counter behavior is locked.

### skip_insights UPDATE applied + verified
- Shane ran `UPDATE clip_details SET skip_insights = true WHERE instagram_content_id IN (...)` against the 7 pre-Business media IDs via SQL Editor.
- **Verified live as of 2026-05-17 13:37 UTC cron tick:** `rowsProcessed=54` = 61 registry entries − 7 skip_insights. Flag is working end-to-end.

## In progress
None blocking. IG pipeline is shipping daily-delta rows with skip_insights filtering operational.

## Blocked / open
- **Supabase MCP read-only:** blocked attempting to apply migrations + DML via `mcp__supabase__apply_migration` / `execute_sql`. Shane's MCP config is read-only. Open question whether to enable write mode (and update CLAUDE.md to authorize MCP-driven DDL/DML) or keep manual SQL Editor workflow (status quo, defensive against TRUNCATE-class incidents). Awaiting decision.
- **YouTube Vercel cron's `getShortsRegistry` may have been silently broken** by the same `.not()` quirk pre-`07bec9e`. Per CLAUDE.md the LaunchAgent is the production shorts source, so likely no user-visible impact, but worth a manual `curl` of `/api/cron/youtube-sync` to confirm post-fix.

## Next natural action
1. Push the shutdown commit (8th).
2. Grep Vercel logs for `comments fetch failed for` and assess uniformity (rate-limit vs heterogeneous).
3. If Shane wants MCP write mode, update the CLAUDE.md "Never run schema changes via Claude Code's Supabase MCP tools" rule accordingly.
