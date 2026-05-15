# Instagram Graph API Ingestion — Implementation Plan

**Date:** 2026-05-15
**Status:** Planning (not started)
**Account:** matteo.mediabuyer (IG user ID `17841476696015978`)

## 1. Summary

Mirror the YouTube Shorts pipeline for Instagram Reels published from the matteo.mediabuyer Business account. New `instagram_auth` table (long-lived token), new `clip_details.instagram_content_id` column (regular UNIQUE constraint — not partial), new `src/lib/instagram.ts` for the Graph API client, new `src/lib/instagram-discovery.ts` for PENDING + caption-regex auto-mapping, and a new `/api/cron/instagram-sync` route. Reuses the existing `posts` table with `platform='instagram'` and the daily-delta invariant. Token refresh runs inside the cron tick.

## 2. Files to create / modify

Create:
- `supabase/migrations/20260515_instagram_auth.sql`
- `supabase/migrations/20260515_clip_details_instagram_content_id.sql`
- `src/lib/instagram.ts`
- `src/lib/instagram-discovery.ts`
- `src/lib/instagram-sync.ts` (orchestrator — sibling of `src/lib/youtube-sync.ts`)
- `src/app/api/cron/instagram-sync/route.ts`

Modify:
- `src/lib/db.ts` — add `getInstagramRegistry`, `setClipDetailInstagramContentIdIfNull`, `registerPendingInstagramMedia` (siblings of the Shorts versions at lines 605–651).
- `vercel.json` — add cron entry + `maxDuration` for the new route.
- `src/types/index.ts` — only if a new IG-specific field is needed on `UnifiedPost` beyond what's already there (it already has `plays`, `reach`, `saves`, `profile_visits`, `follows`, `accounts_reached`, `accounts_engaged`).
- `CLAUDE.md` — add new entries under "Upsert conflict keys" for `clip_details.instagram_content_id` and the IG sync writer.
- `memory/primer.md` (end-of-session, per protocol).

Out-of-band (Shane manually, per CLAUDE.md DDL rule):
- Apply both migrations via Supabase SQL Editor.
- Insert the long-lived token row into `instagram_auth`.
- Add `INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET` to Vercel envs.

## 3. Phases

### Phase 0 — Schema + env (must precede all other phases)

**0.1** Create migration `supabase/migrations/20260515_instagram_auth.sql`. Single-row source-of-truth table mirroring the implicit `youtube_auth` shape inferred from `src/app/api/auth/callback/route.ts:35-61`. Columns: `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`, `access_token text NOT NULL`, `token_expiry timestamptz NOT NULL`, `ig_user_id text NOT NULL`, `updated_at timestamptz NOT NULL DEFAULT now()`. No `refresh_token` column — IG's "refresh" is a token rotation against the existing long-lived token, not a separate refresh-token grant. Add a comment header explaining the single-row pattern.

**0.2** Create migration `supabase/migrations/20260515_clip_details_instagram_content_id.sql`. Adds `instagram_content_id text` (nullable) to `clip_details`. **Add a regular `UNIQUE` constraint** (`clip_details_instagram_content_id_unique UNIQUE (instagram_content_id)`), NOT a partial unique index. This is the explicit lesson from `supabase/migrations/20260514_clip_details_content_id_unique_constraint.sql` and `tasks/lessons.md:15` (2026-05-14): PostgREST cannot use a partial unique index as an inferred ON CONFLICT target via `?on_conflict=col` and will 400 silently. NULLS DISTINCT (Postgres default) preserves the long-tail "many rows with NULL" semantic.

**0.3** Verify the `posts.platform` CHECK constraint already accepts `'instagram'`. The `Platform` union in `src/types/index.ts:1` already includes it, and the table has IG-shaped columns (`plays`, `reach`, `saves`, `profile_visits`, `follows`, `accounts_reached`, `accounts_engaged` — see `src/lib/db.ts:104-108` and `src/lib/db.ts:360-367`). Run a read-only `SELECT pg_get_constraintdef(...)` via the Supabase MCP to confirm before assuming. If it doesn't include `'instagram'`, add a small migration to extend it.

**0.4** Confirm Vercel envs `INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET` are set before deploy. Access token lives only in DB.

Steps 0.1, 0.2, 0.3 are independent and can run in parallel; 0.4 is a manual prerequisite.

---

### Phase 1 — `src/lib/instagram.ts` (Graph API client)

Depends on: Phase 0 (the `instagram_auth` table must exist before `getAccessToken` can read it).

**1.1** `getAccessToken(): Promise<string>` — single-row read from `instagram_auth`, mirroring `src/lib/youtube.ts:28-60`. Returns the long-lived token directly (no exchange — IG long-lived tokens are used as bearers as-is). Throw a clear error if no row found ("re-consent required").

**1.2** `interface InstagramMedia` and `fetchMediaList(igUserId, accessToken): Promise<InstagramMedia[]>` — paginate `https://graph.instagram.com/v21.0/{ig_user_id}/media` with fields `id,caption,media_type,media_product_type,permalink,thumbnail_url,timestamp`. Handle the cursor pagination shape (`data[]` + `paging.next` URL — Graph API returns full next-page URL). Loop until `paging.next` is absent. **Open question 3** below — pagination shape needs doc verification.

**1.3** `interface MediaInsights` and `fetchMediaInsights(mediaId, accessToken): Promise<MediaInsights>` — `https://graph.instagram.com/v21.0/{media_id}/insights?metric=...`. For Reels: `views,reach,likes,comments,shares,saved,total_interactions`. Treat the response as **lifetime-cumulative until proven otherwise** — see Open question 1 / Risks section. This helper returns raw API values; the delta computation happens in the sync orchestrator (Phase 3).

**1.4** `fetchMediaComments(mediaId, accessToken): Promise<MediaComment[]>` — `/v21.0/{media_id}/comments?fields=id,text,timestamp,username,like_count` with pagination. Return count + raw comment array; caller decides what to persist (see Open question 4).

**1.5** `refreshAccessToken(currentToken): Promise<{ token: string; expiresIn: number }>` — GET `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token={token}`. Returns the new long-lived token and `expires_in` seconds. Caller is responsible for writing back to `instagram_auth.access_token` + `token_expiry` + `updated_at`.

Type all response shapes explicitly — no `any` (CLAUDE.md rule). Use the YouTube file's pattern of one interface per response shape (`AnalyticsResponse`, `VideoMetadataResponse`, etc.).

Sub-steps 1.1 through 1.5 are mostly independent helpers in the same file; can be written sequentially but reviewed together.

---

### Phase 2 — `src/lib/instagram-discovery.ts` (PENDING + auto-map)

Depends on: Phase 0 (constraint), Phase 1 (`fetchMediaList`).

**2.1** Add three DB helpers to `src/lib/db.ts` mirroring lines 605–651:
- `getInstagramRegistry()` — returns `clip_details` rows where `instagram_content_id IS NOT NULL`.
- `setClipDetailInstagramContentIdIfNull(igMediaId, clipDetailsCode)` — update-if-null pattern, returns boolean.
- `registerPendingInstagramMedia(igMediaId)` — upsert with `onConflict: 'instagram_content_id', ignoreDuplicates: true`. Insert a placeholder row with `clip_code='PENDING'`, `clip_details_code='PENDING-IG-{igMediaId}'`, `instagram_content_id=igMediaId`. **The `PENDING-IG-` prefix differentiates IG PENDING rows from YouTube PENDING rows** — both share the `clip_details` table.

**2.2** Create `src/lib/instagram-discovery.ts` mirroring `src/lib/shorts-discovery.ts` end-to-end:
- Caption regex: `/MBM\d{3}-CLIP-\d{3}/` (anywhere in caption — not anchored, since IG captions usually have hashtags/emoji surrounding the code).
- Optionally filter `media_product_type === 'REELS'` to skip Feed Posts / Stories (Open question 2).
- Skip media already registered (`instagram_content_id` already in registry).
- For each new media: regex match on caption → `setClipDetailInstagramContentIdIfNull`; else → `registerPendingInstagramMedia`.
- Return `DiscoveryResult` with `matched`, `pending`, `skipped` counts (same shape as `shorts-discovery.ts:32-36`).
- Wrap caption-match path with the same "tagged but no matching clip_details row → PENDING fallback" warning as `shorts-discovery.ts:81-83`.

**2.3** Apply the same lesson from `tasks/lessons.md:13` (2026-05-14): when verifying anything is "wired in", grep for IMPORT STATEMENTS, not symbol occurrences.

Sub-steps 2.1 and 2.2 are sequential (2.2 imports 2.1).

---

### Phase 3 — `src/lib/instagram-sync.ts` + `/api/cron/instagram-sync/route.ts`

Depends on: Phases 1 and 2.

**3.1** Create `src/lib/instagram-sync.ts` — orchestrator. Steps inside `runInstagramSync()`:

1. `getAccessToken()` from `instagram_auth`.
2. `discoverInstagramMedia(accessToken, igUserId)` — wrapped in try/catch (failures don't abort sync; mirrors `youtube-sync.ts:89-95`).
3. Read `igUserId` from a constant or from `instagram_auth.ig_user_id` (recommend the latter — single source of truth, no hardcoded `17841476696015978` in code).
4. Load the full IG registry (`getInstagramRegistry()`).
5. For each registry entry: `fetchMediaInsights(mediaId)` → **compute daily delta** by reading the latest existing `posts` row for that `(content_id, platform='instagram')` and subtracting; today's row gets the diff (see Risks). Comments count from `fetchMediaComments` length, or from the `comments` insight metric if available.
6. Build `UnifiedPost[]` and call `upsertPosts(...)` from `src/lib/db.ts:316`. The IG rows must populate `content_id`, `clip_details_code`, `clip_code`, `stat_date`, `platform='instagram'`, plus IG-specific fields. Set `content_type` to `'reel'` (new value; verify no CHECK constraint blocks it).

**3.2** Decide upsert conflict key for IG rows: the existing `upsertPosts` at `src/lib/db.ts:382` uses `onConflict: 'clip_details_code,platform,stat_date'`. This works for IG because every IG row (mapped or PENDING) has a non-null `clip_details_code` (PENDING rows use `PENDING-IG-{mediaId}`). **Reuse `upsertPosts` as-is** — no new writer needed. This is symmetric with Shorts and avoids a parallel constraint.

**3.3** Create `src/app/api/cron/instagram-sync/route.ts` — verbatim shape of `src/app/api/cron/youtube-sync/route.ts`: CRON_SECRET bearer check, call `runInstagramSync()`, return summary JSON. Match the error logging shape from the long-form cron route (`src/app/api/cron/youtube-sync-longform/route.ts:18-26`) since IG insights errors will have a similar variety of failure modes.

**3.4** Update `vercel.json`: add a cron entry (recommend `0 15 * * *` — 15:00 UTC, 1h after Shorts cron at 14:00; staggered so they don't compete for the 60s function timeout). Add `maxDuration: 60` for the new route under `functions`.

**3.5** **Dedupe-before-upsert at sync layer.** `upsertPosts` at `src/lib/db.ts:371-376` already dedupes by `clip_details_code|platform|stat_date`, so IG inherits the protection. But also apply the dedupe pattern from `src/lib/youtube-longform-sync.ts:336-342` if IG's `/me/media` list ever returns duplicates across pages (it shouldn't, but defensive).

Sub-steps 3.1–3.4 are sequential; 3.5 is verification only.

---

### Phase 4 — Token refresh

Depends on: Phase 1 (`refreshAccessToken`).

**4.1 — Recommended approach: refresh inside the cron tick, opportunistically.** At the top of `runInstagramSync`, after `getAccessToken()`, check `token_expiry` — if it's within 14 days of expiring, call `refreshAccessToken()`, update the `instagram_auth` row, and use the new token for the run. IG long-lived tokens are valid for 60 days and refreshable any time after 24h of age, so refreshing every cron tick is fine but wasteful; the 14-day-window heuristic is cheap and idempotent.

**Rationale:**
- One fewer cron entry to monitor than a dedicated weekly refresh route.
- Co-located with the only consumer; no risk of refresh running while sync is mid-flight against an about-to-expire token.
- The Vercel Hobby cron is best-effort (primer.md / lessons.md 2026-05-06); a dedicated weekly route adds a single point of failure that, if missed, silently breaks ingestion 60 days later. Cron-tick refresh self-heals on the next successful tick.

**Alternative:** A `/api/cron/instagram-refresh` route on a weekly schedule. Cleaner separation of concerns. Shane to decide.

**4.2** When writing back to `instagram_auth`: bump `updated_at` AND `token_expiry`. Use `supabase.from('instagram_auth').update(...).eq('id', existing.id)` per the callback pattern at `src/app/api/auth/callback/route.ts:41-49`.

---

## 4. Open questions (for Shane)

1. **Are IG Insights metrics daily-delta or lifetime-cumulative?** YouTube Analytics returns clean per-day rows (`fetchAnalyticsForVideo` at `src/lib/youtube.ts:62-114`). IG `/insights` is suspected to return lifetime totals for Reels (`views`, `reach`, `likes`, `comments`, `shares`, `saved`). **Verification step:** before writing the sync logic, hit `/insights` for one known media on two consecutive days, diff manually, and confirm. If lifetime, the sync must compute `today_value - latest_posts_row_for_that_media.cumulative_value` to produce the daily delta — and store the cumulative anywhere needed for the next diff (recommend a separate `instagram_media_snapshots` table or a `total_*` column family on `posts` that is read-only after write). **The daily-delta invariant on `posts.views` is non-negotiable per CLAUDE.md.**
2. **Reels vs Feed Posts vs Stories.** MBM clips are Reels. Confirm we should filter `media_product_type === 'REELS'` in discovery and skip everything else. Stories have a 24h lifespan and different metric availability — almost certainly out of scope.
3. **`/me/media` pagination shape.** Cursor-based via `paging.next` (full URL) is the Graph API convention. Confirm against IG docs at planning-handoff time; the helper interface in Phase 1.2 assumes this. (Use context7 to fetch live IG Graph API docs if unsure.)
4. **Comment data home.** Three options: (a) store only `comments` count on `posts.comments` (lossless if we only ever need the count); (b) new `instagram_comments` table with full text per comment; (c) both. **Recommend (a) for v1** — Shane has `instagram_business_manage_comments` scope but no current use case for comment text, and (b) creates a moderation burden (PII, retention). Revisit when there's a feature that needs comment text.
5. **Token refresh strategy.** Recommended cron-tick refresh in Phase 4.1; alternative dedicated weekly route in 4.2. Shane to decide.
6. **`media_product_type` for older Reels.** Reels published before IG's product-type unification may have `media_type='VIDEO'` and `media_product_type='FEED'`. Need to confirm whether to include those or only `REELS`. Verify against the actual matteo.mediabuyer media list at first run.

## 5. Risks / things that will bite us

- **Daily-delta invariant on `posts.views`** (CLAUDE.md "posts is daily-delta, not cumulative"). If IG returns lifetime cumulative totals, naively writing those to `posts.views` reproduces the exact "YouTube Merger CSV bug" called out in CLAUDE.md ("8K one day, 2.5K the next" volatility). Open question 1 must be resolved before any write to `posts`.
- **Partial-index ON CONFLICT trap** (lessons.md 2026-05-14, line 15). The `clip_details.instagram_content_id` UNIQUE constraint MUST be a regular UNIQUE, not a partial unique index. The migration in Phase 0.2 spells this out explicitly. Anyone "optimizing" later by switching to a partial index will re-introduce a silent 400 in production.
- **Supabase 1000-row response cap** (`src/lib/db.ts:226-244`). If IG account history grows beyond 1000 daily rows in a single query window, `getInstagramRegistry()` will silently truncate. The registry select uses `.not('instagram_content_id', 'is', null)` which today is ~50 rows — fine — but any sync-side `SELECT posts WHERE platform='instagram'` for diffing must push date filters to the DB, not fetch-all-and-filter-in-JS. (See commit `5da96e7` referenced in CLAUDE.md.)
- **`posts.platform` CHECK constraint.** Phase 0.3 verifies it accepts `'instagram'`, but if a CHECK explicitly enumerates allowed values and IG is missing, the first upsert will throw `23514`. Read-only diagnostic before deploy.
- **Token refresh deadlock.** If the cron-tick refresh happens but the write-back to `instagram_auth` fails, the run continues with a now-rotated token that's not persisted. Next cron tick re-fetches the old (now invalid) token from DB and dies. Mitigation: in Phase 4.1, refresh + write-back BEFORE the discovery + sync work, not after, so a failure short-circuits cleanly.
- **`/me/media` only returns the user's own media.** If matteo's account ever re-posts a clip from another collaborator, that media won't appear. Acceptable for v1.
- **`media_product_type` filter accidentally hiding all media.** Belt-and-suspenders: log every skipped media + reason at discovery time so the first cron run can be eyeballed.
- **IG comment text persistence.** If Phase 4 / Open question 4 lands on option (b), this introduces a new table with PII. Out of scope for v1 per recommendation.

## 6. Out of scope / explicit non-goals

- Stories ingestion (24h lifespan, different metric model).
- IG Feed Posts (non-Reels). Re-evaluate when the matteo account starts posting non-Reels.
- Demographic breakdowns (`audience_*` insights metrics) — equivalent to YouTube's `post_breakdowns` table. Add later if needed; no breakdown table for IG in v1.
- A UI view dedicated to IG. The existing platform-filtered views (`DashboardView`, `ContentView`, `PlatformsView`, `ComparisonView`) already render `platform='instagram'` rows from `posts`. No new view registration in `Sidebar.tsx` / `page.tsx`.
- Two-account support. Matteo's account only; the `instagram_auth` table is single-row by design. Multi-account = future migration to keyed rows.
- Backfill of historical IG data prior to first cron run. The first run starts fresh from whatever `/me/media` returns; pre-existing manual IG rows (if any) in `posts` stay as-is.
- A `scripts/backfill-*.ts` one-shot (the Shorts equivalent was deleted in commit `8b923b1` Phase 5 cleanup; don't recreate it).

---

## Verification checklist

- `npm run build` passes (TS strict + ESLint + Next build). Per CLAUDE.md this is the build gate; no unit tests.
- `npx tsc --noEmit` clean — confirms no `any` leaked into the new Graph API response interfaces.
- Both migrations applied via Supabase SQL Editor (Shane runs by hand per CLAUDE.md "Never run schema changes via Claude Code's Supabase MCP tools").
- Long-lived token row inserted into `instagram_auth` (Shane, per spec).
- Hit `/api/cron/instagram-sync` locally with the `Authorization: Bearer $CRON_SECRET` header; confirm summary JSON shape.
- Verify diff-from-lifetime logic with a 2-consecutive-day spot-check on one known Reel ID before letting the cron write to `posts` for real (depends on Open question 1).
- After first cron run, `SELECT count(*) FROM clip_details WHERE clip_code='PENDING' AND clip_details_code LIKE 'PENDING-IG-%'` confirms PENDING IG rows landed. Resolve via SQL per the existing Shorts workflow.
- `SELECT * FROM posts WHERE platform='instagram' ORDER BY stat_date DESC LIMIT 10` — daily-delta sanity: views should be O(daily traffic), not O(lifetime traffic).
- Manual UI check: open Dashboard, filter to Instagram, confirm rows render with expected platform color (`#C855E8` from `src/types/index.ts:85`) and label.
- Confirm `/api/diagnostics` consistency check still passes (no new auth-gate surprises like the founder-report fix on 2026-05-14).
