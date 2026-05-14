# Shorts Auto-Discovery — Implementation Plan

**Spec date:** 2026-05-14
**Author:** planner agent
**Save to:** `/Users/shane/clip-dashboard/docs/superpowers/plans/2026-05-14-shorts-auto-discovery.md`

## Goal

Replace the hardcoded `VIDEO_MAP` in `src/lib/youtube-sync.ts` with a DB-driven registry sourced from `clip_details`. New Shorts auto-register on every cron tick: videos whose `fileDetails.fileName` matches `MBM###-CLIP-###` get their `content_id` written to the matching `clip_details` row; videos that don't match get a PENDING sentinel row so daily-delta collection isn't lost while Shane backfills the real `clip_code` via SQL.

## Pre-locked decisions (do not re-litigate)

- Source of truth flips from `VIDEO_MAP` (TS) to `clip_details` (DB).
- `clip_code` stays episode root (`MBM015`); `clip_details_code` stays full (`MBM015-CLIP-014`).
- PENDING sentinel: `clip_code='PENDING'`, `clip_details_code='PENDING-{content_id}'`.
- ~~Filename regex: `/^(MBM\d{3})-(CLIP-\d{3})/` against `fileDetails.fileName`.~~ **Superseded 2026-05-14 — see Phase 3 pivot below.** Auto-map signal is `snippet.tags`; videos without a matching tag land as PENDING.
- Discovery filters: duration ≤ 180s, status=public, publishedAt ≥ 2023-01-01.
- Founder Report filters out `clip_details_code LIKE 'PENDING-%'`.
- Backfill seed: live `VIDEO_MAP` in `src/lib/youtube-sync.ts` only.
- OAuth `youtube.force-ssl` scope already deployed (confirmed at `src/app/api/auth/route.ts:10`, `src/app/api/auth/url/route.ts:10`).
- Logging: plain `console.log` for v1.
- **Phase 6 (Pending Registration UI) deferred** — Shane edits PENDING rows via Supabase SQL Editor.

## Decisions resolved 2026-05-14

1. **PENDING / `clip_code` uniqueness** — live DB has NO unique constraint on `clip_details.clip_code` (verified via `pg_constraint`: only `clip_details_pkey` and `clip_details_code_unique` exist; no triggers). The original `20260326_clip_details.sql:4` declared `unique` but it was dropped at some point. **No schema change needed.** Phase 1 migration only adds `content_id` + its partial unique index. PENDING rows insert directly with `clip_code='PENDING'`, `clip_details_code='PENDING-{content_id}'`.
2. **Channel ID source** — call `channels.list?mine=true` at the start of every discovery run. Do NOT hardcode.
3. **`getLatestPostsPerClip` grouping** — fall back to `clip_details_code` when `clip_code === 'PENDING'`. Confirmed in Phase 4 sub-task.
4. **Historical window for new PENDING shorts** — today-forward only. The 30-day rolling window in `runYouTubeSync` covers most cases; do NOT add per-video custom windows.
5. **Discovery cadence** — runs on every cron tick (every 6h per `vercel.json`, ~2 quota units per run).

## Phase 3 pivot — auto-map signal (resolved 2026-05-14)

Probe via `videos.list?part=fileDetails,snippet,contentDetails,status` against 4 channel videos (`q_pNnD-JLnQ`, `CGQryafzaAY`, `iXS-UcuSrpY`, `EuC0d-68ghI`) confirmed that **`fileDetails.fileName` is never returned by the YouTube Data API for this channel's uploads** (some videos return a full `fileDetails` object minus `fileName`; others return `{}`). This is a quietly-known regression — `fileDetails.fileName` has been intermittently stripped since ~2024. Force-ssl scope is sufficient; the field is simply absent. The locked decision to regex against `fileDetails.fileName` is therefore **non-viable**.

Probe also confirmed `snippet.title` and `snippet.description` never naturally contain `MBM###-CLIP-###` strings (they're public-facing copy). `snippet.tags` was absent from all 4 responses, meaning the videos are currently untagged.

**New auto-map strategy:**
1. Read `snippet.tags` from each discovered video.
2. For each tag, regex against `/^(MBM\d{3})-(CLIP-\d{3})$/` (anchored — full string match per tag, not substring).
3. On first match, derive `clip_code = m[1]`, `clip_details_code = ${m[1]}-${m[2]}`, then update the matching `clip_details` row's `content_id`. Stop scanning tags after first match.
4. No matching tag (or no tags at all) → register PENDING.

This works as a no-op for Shane today (he doesn't tag uploads — everything lands as PENDING and he updates rows via SQL Editor) and as full auto-map the day he starts adding the tag during upload. No code change required to flip between modes.

The filename regex `/^(MBM\d{3})-(CLIP-\d{3})/` referenced in Phase 3 sub-steps is **replaced** by the tag regex `/^(MBM\d{3})-(CLIP-\d{3})$/` (note the `$` end-anchor for full-tag match). All other Phase 3 architecture (registry table, getShortsRegistry, registerPendingShort, cron wiring) stands unchanged.

---

## Phase 1 — DB migration (S)

### Files
- **Create** `supabase/migrations/20260514_clip_details_content_id.sql`

### Changes
1. `ALTER TABLE clip_details ADD COLUMN IF NOT EXISTS content_id text` (nullable; many historical rows have no YouTube video yet).
2. `CREATE UNIQUE INDEX IF NOT EXISTS clip_details_content_id_idx ON clip_details (content_id) WHERE content_id IS NOT NULL` — partial unique index so multiple NULLs are allowed but each populated `content_id` maps to exactly one `clip_details` row. Mirrors the same partial-unique-index pattern used in `supabase/migrations/20260427_long_form_videos.sql:22-24`.
3. Add a short header comment explaining: this column powers the Shorts auto-discovery registry; nullable because un-uploaded clips still get rows; partial unique index because long-tail clips remain without `content_id` for a while.

### Manual step (per CLAUDE.md)
**Do NOT run via `mcp__supabase__apply_migration`.** Commit the file. Shane runs it in the Supabase SQL Editor and confirms applied before Phase 2 runs.

### Verification
- After Shane applies, run a read-only query: `SELECT column_name FROM information_schema.columns WHERE table_name='clip_details' AND column_name='content_id'` — should return one row.
- `SELECT indexname FROM pg_indexes WHERE tablename='clip_details' AND indexname='clip_details_content_id_idx'` — should return one row.

### Rollback
- `DROP INDEX IF EXISTS clip_details_content_id_idx;`
- `ALTER TABLE clip_details DROP COLUMN IF EXISTS content_id;`
- Both safe because Phase 1 alone changes no runtime behavior.

### Dependencies
None. Phase 1 is the gate for Phases 2 and 3.

---

## Phase 2 — Backfill script (M)

### Files
- **Create** `scripts/backfill-clip-details-content-id.ts`

### Changes
1. Standalone TS script invoked via `npx tsx scripts/backfill-clip-details-content-id.ts [--force] [--dry-run]`.
2. Imports the live `VIDEO_MAP` directly from `src/lib/youtube-sync.ts` (re-export is needed; see sub-step 2a) — **not** the stale 30-entry copy in `scripts/youtube-studio-sync.ts:38` or `scripts/fill-posting-schedule.ts:28`.
   - **2a.** Add `export` keyword to the `VIDEO_MAP` const at `src/lib/youtube-sync.ts:7`. This is the only edit to production code in Phase 2 and is reversed in Phase 5.
3. Uses `dotenv` against `.env.local` (matches existing scripts' pattern, e.g. `scripts/fill-posting-schedule.ts:17`).
4. Calls `getAccessToken()` from `src/lib/youtube.ts:28` to mint a fresh access token.
5. Calls Data API v3 `videos.list?part=fileDetails&id=<batched 50 IDs>` and verifies each returned `fileDetails.fileName` matches the regex `/^(MBM\d{3})-(CLIP-\d{3})/`. Log a warning if the regex doesn't match the corresponding hardcoded `clip_details_code` — this catches map drift.
6. For each `(videoId, clipDetailsCode)` pair, run `UPDATE clip_details SET content_id = $1 WHERE clip_details_code = $2 AND (content_id IS NULL OR $force)`. Idempotent: skips when `content_id` already set unless `--force`.
7. `--dry-run` mode: log every intended UPDATE, run zero writes (lessons.md 2026-04-29 rule).
8. Print summary: matched / skipped (already set) / regex-mismatch / clip_details row missing.

### Verification
- `npm run build` passes after the `export` is added (no other type changes).
- Dry-run first: `npx tsx scripts/backfill-clip-details-content-id.ts --dry-run` — review the planned UPDATEs against the 45-entry VIDEO_MAP.
- Live run, then read-only check: `SELECT count(*) FROM clip_details WHERE clip_details_code LIKE 'MBM%-CLIP-%' AND content_id IS NOT NULL` — expected to equal `Object.keys(VIDEO_MAP).length` (currently 45 entries in the live map at `src/lib/youtube-sync.ts:7-53`; note this is bigger than the stale 19/30 copies in scripts).
- Spot-check one row: `SELECT clip_details_code, content_id FROM clip_details WHERE clip_details_code='MBM015-CLIP-014'` should show `content_id='6dMQ7EyATRU'`.

### Rollback
- `UPDATE clip_details SET content_id = NULL WHERE clip_details_code LIKE 'MBM%-CLIP-%';` (Shane runs manually if needed). Phase 1's schema stays.

### Dependencies
- Requires Phase 1 applied (column must exist).
- Independent of Phase 3 — safe to run before any cron-path edits.

---

## Phase 3 — Discovery + sync cron rewrite (L)

This is the biggest phase. Split into 3a (new helpers), 3b (discovery function), 3c (cron wiring). Each sub-step lands as a separate commit so the cron stays green at every checkpoint.

### Phase 3a — DB and HTTP helpers (S)

#### Files
- **Edit** `src/lib/db.ts`
- **Edit** `src/lib/youtube.ts`

#### Changes
1. **`src/lib/db.ts`** — add a new export `getShortsRegistry()` returning `Array<{ content_id: string; clip_details_code: string; clip_code: string }>`. Query: `SELECT clip_code, clip_details_code, content_id FROM clip_details WHERE content_id IS NOT NULL`. Result type explicit (no `any`). **Decision: include PENDING rows** so daily-delta collection continues for unmapped videos until Shane resolves them.
2. **`src/lib/db.ts`** — add `upsertClipDetailContentId(contentId, clipDetailsCode, clipCode)` helper for the discovery path: inserts a new `clip_details` row (PENDING case) or updates `content_id` on an existing row (match case). Two narrow functions are clearer than one polymorphic upsert here; keep them separate. `onConflict: 'clip_code'` still works for the regular insert path; the PENDING case uses `clip_code='PENDING'` so we'll need a different write strategy — see sub-step 3.
3. Add `registerPendingShort(contentId)` that inserts directly with `clip_code='PENDING'`, `clip_details_code='PENDING-{contentId}'`, and `content_id={contentId}`. **No schema-side concern** — verified 2026-05-14 that live DB has no unique constraint on `clip_code` (Decisions resolved §1 above), so multiple `'PENDING'` rows coexist freely. The partial unique index on `content_id` (Phase 1) is what enforces one-row-per-video.
4. **`src/lib/youtube.ts`** — add `fetchVideoDiscoveryDetails(videoIds: string[], accessToken)`. Batches up to 50 IDs per call to `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,status&id=...`. Returns a `Map<videoId, { tags: string[]; publishedAt: string; durationSeconds: number; privacyStatus: string }>`. Define an explicit response interface mirroring the existing `VideoMetadataResponse` at `src/lib/youtube.ts:125-141` plus tags/duration/status. (`fileDetails` part dropped after the 2026-05-14 probe showed `fileName` is never returned for this channel — see "Phase 3 pivot" section above.)
5. **`src/lib/youtube.ts`** — add `listChannelVideoIds(accessToken)` that enumerates the channel's uploads playlist via `playlistItems.list` (playlist ID = `UU` + channel ID). `playlistItems` is more efficient than `search.list` (1 quota unit vs 100). Paginate with `pageToken` until exhausted. Returns `string[]` of video IDs. (Channel-ID source: derive from `channels.list?mine=true&part=contentDetails` once, cache for the call; or read `YOUTUBE_CHANNEL_ID` from env if it exists — grep first.)

#### Verification
- `npm run build` passes.
- Manual: temporarily call `getShortsRegistry()` from a Node REPL or a throwaway route — expect 45 rows after Phase 2 ran.

#### Dependencies
- Phase 2 must have populated `content_id` for the 45 known mappings, otherwise `getShortsRegistry()` returns an empty array and the cron stops processing data.

### Phase 3b — Discovery module (M)

#### Files
- **Create** `src/lib/shorts-discovery.ts`

#### Changes
1. Export `discoverShorts(accessToken: string): Promise<{ matched: number; pending: number; skipped: number }>`.
2. Steps inside `discoverShorts`:
   - a. `videoIds = await listChannelVideoIds(accessToken)`.
   - b. Batch into chunks of 50, call `fetchVideoDiscoveryDetails(chunk, accessToken)`.
   - c. For each video: skip if `durationSeconds > 180`, `privacyStatus !== 'public'`, or `publishedAt < '2023-01-01'`.
   - d. Read existing registry once via `getShortsRegistry()` to skip videos already in the DB (match by `content_id`).
   - e. Iterate `tags` and apply regex `/^(MBM\d{3})-(CLIP-\d{3})$/` (anchored) to each. On first match → derive `clip_code = m[1]`, `clip_details_code = ${m[1]}-${m[2]}`, then `UPDATE clip_details SET content_id=$videoId WHERE clip_details_code=$clipDetailsCode AND content_id IS NULL`. If zero rows updated (no matching `clip_details` row), log a warning and fall back to the PENDING path so we don't lose the video.
   - f. No matching tag (or no tags at all) → call `registerPendingShort(videoId)`.
3. Plain `console.log` for v1: `[shorts-discovery] scanned N, matched M, pending P, skipped S`.

#### Verification
- `npm run build` passes.
- Manual one-shot test via a throwaway script that calls `discoverShorts(token)` — expect `matched=0` (all 45 already have content_id from Phase 2) and `pending` covering anything new beyond the 45-entry map.

#### Dependencies
- 3a must ship first (uses `fetchVideoFileDetails`, `listChannelVideoIds`, `getShortsRegistry`, `registerPendingShort`).

### Phase 3c — Wire cron to registry (M)

#### Files
- **Edit** `src/lib/youtube-sync.ts`

#### Changes
1. At the top of `runYouTubeSync` (after `getAccessToken`, before line 135), call `await discoverShorts(accessToken)`. Failures here must NOT abort the sync — wrap in try/catch like the existing breakdown call (lines 207-211).
2. Replace the metadata fetch at line 140 — `fetchVideoMetadata(Object.keys(VIDEO_MAP), accessToken)` — with a call that uses `await getShortsRegistry()` to source the video ID list.
3. Replace the iteration at line 148 — `for (const [videoId, clipDetailsCode] of Object.entries(VIDEO_MAP))` — with `for (const { content_id, clip_details_code, clip_code } of registry)`. Use the derived `clip_code` from the registry rather than `clipDetailsCode.split('-CLIP-')[0]` (line 154) — for PENDING rows `clipDetailsCode.split('-CLIP-')[0]` returns `'PENDING'` which is technically correct but using the explicit DB column is clearer.
4. Repeat the same swap in `runBreakdownSync` at line 74.
5. **Do NOT delete `VIDEO_MAP` yet.** Leave the const in place but unused — Phase 5 deletes it. This keeps the diff small and reviewable per CLAUDE.md surgical-edits rule.

#### Verification
- `npm run build` passes; ESLint will warn about the unused `VIDEO_MAP` — silence with a single-line `// eslint-disable-next-line` comment with a TODO referencing Phase 5, **not** by deleting it now.
- Trigger the cron locally (`curl localhost:3000/api/cron/youtube-sync -H "Authorization: Bearer $CRON_SECRET"`) and confirm:
  - response has `rowsProcessed > 0`.
  - logs show `[shorts-discovery] scanned ... matched ... pending ...`.
  - Supabase: `SELECT COUNT(*) FROM posts WHERE stat_date = CURRENT_DATE - 1 AND platform='youtube'` is non-zero.
- Confirm in prod by waiting for the next `/api/cron/youtube-sync` invocation (every 6 hours per `vercel.json`).

#### Rollback
- Revert the three changed sites in `src/lib/youtube-sync.ts` back to `Object.entries(VIDEO_MAP)` — file still has the const.

#### Dependencies
- Phases 3a + 3b shipped.
- Phase 2 backfill complete (registry must be populated).

### Open Q (Phase 3) — historical backfill for newly-discovered PENDING shorts

When `discoverShorts` adds a PENDING row for a video published 5 days ago, the next cron run will only fetch analytics from `now - 30d` to `now`, so we'd capture the missing 5 days. The default 30-day window in `runYouTubeSync` at line 136 covers this — **no extra backfill code needed**. Document this in the PR description so Shane knows.

If the video is older than 30 days when discovered (rare), we lose pre-window data. Recommended v1 stance: **today-forward only**; do not add per-video custom windows. Surface in PR description for Shane's call.

---

## Phase 4 — Founder Report PENDING filter (S)

### Files
- **Edit** `src/app/api/founder-report/route.ts`

### Changes
1. Add `.not('clip_details_code', 'like', 'PENDING-%')` to both Supabase queries:
   - statRows query at line 61-67 (between `.lte('stat_date', endDate)` and `.range(...)`)
   - postedRows query at line 90-97 (between `.not('content_id', 'is', null)` and `.range(...)`).
2. Confirm the existing `.select('content_type, stat_date, ...')` columns don't need `clip_details_code` added since the filter doesn't require the column in the projection — only in the WHERE clause.

### Sub-task — audit aggregation functions in `src/lib/db.ts`
Decide and document for each:
- `getLatestPostsPerClip` (`src/lib/db.ts:127`) — adds PENDING posts as separate rows because they share `clip_code='PENDING'` (line 151's group key would collapse all PENDING into one bucket — a real bug). **Recommended fix:** in the existing key logic at lines 151-152, fall back to `clip_details_code` when `clip_code === 'PENDING'`. Document the choice in the PR.
- `getTotalViewsPerClip` (`src/lib/db.ts:177`) — explicitly groups by `clip_code`, so all PENDING views would collapse into one synthetic "PENDING" row. **Recommended fix:** add `.not('clip_code', 'eq', 'PENDING')` to the query to exclude PENDING from lifetime leaderboards.
- `getAllPostsByDate` (`src/lib/db.ts:216`) — used by Dashboard windowed sums. PENDING rows are real daily-delta data and should be included so the dashboard total reflects channel reality. **Recommended: do not filter.**

These three rules differ on purpose; call out the rationale in the PR. If Shane wants uniform behavior, the cheapest path is to add an optional `includePending = false` flag to each.

### Verification
- `npm run build` passes.
- Hit `/api/founder-report?window=7` and `?window=30` — compare `shortsViews` against the same numbers from before this change. Should be lower or equal (lower if PENDING rows exist in window; equal if none yet).
- Manually browse Dashboard / Content / Comparison views and confirm no obvious regression in totals or per-clip rankings.

### Rollback
- Remove the two `.not(...)` clauses from `route.ts`.

### Dependencies
- Independent of Phase 3 (works fine even if no PENDING rows exist yet).
- Can ship in parallel with Phase 3.

---

## Phase 5 — VIDEO_MAP cleanup (S)

### Files
- **Edit** `src/lib/youtube-sync.ts` — **delete** the `VIDEO_MAP` const (lines 7-53) and the `export` keyword added in Phase 2.

### Files explicitly NOT touched (with reasoning)
- `src/app/api/video-times/route.ts:6` — 20-entry stale copy used by a separate route. The route is read-only (looks up publish times) and works correctly with its current entries. **Leave for follow-up; flag in PR description.**
- `scripts/youtube-studio-sync.ts:38` — 38-entry copy. This is the LaunchAgent watchdog scraper; it's a one-shot per-day tool that doesn't need to track new shorts. **Leave for now; flag in PR.**
- `scripts/fill-posting-schedule.ts:28` — one-off backfill. Already-run completed work. **Leave.**
- `scripts/youtube-studio-sync.test.ts:163` — asserts `VIDEO_MAP.length === 19` against the stale `youtube-studio-sync.ts` copy. Already wrong (current copy has 38). **Leave; not load-bearing per spec.**

### Verification
- `npm run build` passes — no other file imports `VIDEO_MAP` from `src/lib/youtube-sync.ts` (Grep verified).
- Trigger cron locally one more time, confirm logs show registry-driven IDs.

### Rollback
- `git revert` the single commit. The const is restored.

### Dependencies
- Phase 3c must be live in production at least one cron tick before deleting the const (so we never have a window where both paths are inert).

---

## Verification checklist (all phases done)

1. `npm run build` passes from a clean checkout.
2. `npm run lint` passes.
3. `npx tsc --noEmit` passes.
4. Supabase: `SELECT count(*) FROM clip_details WHERE content_id IS NOT NULL` ≥ 45 (the original VIDEO_MAP size, possibly higher after auto-discovery picks up new uploads).
5. Cron healthy: `/api/cron/youtube-sync` returns `{ rowsProcessed > 0, breakdownsProcessed >= 0 }` and no auth errors in logs.
6. `/api/founder-report?window=7` — `shortsViews` and `shortsPublished` look sane; no PENDING `clip_details_code` rows contributing.
7. Dashboard 7d and 30d totals match Founder Report totals (existing parity check).
8. Manual: upload a Short with filename `MBMTEST-CLIP-001.mp4`, wait for next cron, verify a `clip_details` row appears with `clip_code='MBMTEST'`, `content_id=<videoId>`, AND a `posts` row exists with daily metrics.
9. Manual: upload a Short with a non-matching filename, verify a PENDING row appears and daily metrics flow into `posts` under `clip_details_code='PENDING-{id}'`.

---

## Open questions / assumptions

_All 5 of the planner's original open questions were resolved on 2026-05-14 — see the **Decisions resolved 2026-05-14** section near the top of this doc for the answers and rationale. No open items remain._

---

## Sequencing for Shane

- Land Phase 1 migration → Shane applies via SQL Editor.
- Phase 2 backfill (script + dry-run + live run) — single PR, single morning of work.
- Phase 3a, 3b, 3c — separate commits in one PR. Don't merge until 3c verified locally.
- Phase 4 — independent PR, can ship in parallel with Phase 3.
- Phase 5 — after Phase 3c has run in prod at least once. Trivial single-commit cleanup PR.

Total estimated complexity: 1×S + 1×M + 1×L + 1×S + 1×S = roughly 2-3 focused sessions.

---

## Relevant files (absolute paths)

- `/Users/shane/clip-dashboard/src/lib/youtube-sync.ts` — Phase 3c edits, Phase 5 deletion
- `/Users/shane/clip-dashboard/src/lib/youtube.ts` — Phase 3a new helpers (`fetchVideoFileDetails`, `listChannelVideoIds`)
- `/Users/shane/clip-dashboard/src/lib/db.ts` — Phase 3a new helpers (`getShortsRegistry`, `registerPendingShort`)
- `/Users/shane/clip-dashboard/src/lib/shorts-discovery.ts` — Phase 3b new file
- `/Users/shane/clip-dashboard/src/app/api/founder-report/route.ts` — Phase 4 filters
- `/Users/shane/clip-dashboard/supabase/migrations/20260514_clip_details_content_id.sql` — Phase 1 new file
- `/Users/shane/clip-dashboard/scripts/backfill-clip-details-content-id.ts` — Phase 2 new file
- `/Users/shane/clip-dashboard/supabase/migrations/20260326_clip_details.sql` — referenced for original schema (the `UNIQUE` constraint on `clip_code` is the blocker behind Open Q #1)
- `/Users/shane/clip-dashboard/supabase/migrations/20260427_long_form_videos.sql` — referenced for partial-unique-index pattern
