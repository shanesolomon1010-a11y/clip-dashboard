# Session Primer

_This file is rewritten by Claude at the end of every session._
_It captures current project state so the next session starts with full context._

## Status
HEAD is `946ece4` (pushed to `origin/main`). Massive session — shipped the entire Shorts auto-discovery feature end-to-end (Phases 1–5 + a hot-fix + a follow-up bundle). 4 feature commits on `origin/main`:
- `aa35a90` feat: DB-driven shorts registry + auto-discovery (Phase 1–4)
- `19f528e` fix: swap clip_details.content_id partial index for UNIQUE constraint
- `8b923b1` refactor: Phase 5 — remove VIDEO_MAP, migrate /api/video-times to registry
- `946ece4` fix: gate /api/founder-report behind DASHBOARD_SECRET + harden PENDING grouping

Architecture shifted: hardcoded `VIDEO_MAP` is gone. `clip_details` is now the source of truth via `content_id` (new column, regular UNIQUE constraint). New `src/lib/shorts-discovery.ts` runs first thing on every cron tick, auto-maps via `snippet.tags` regex `/^(MBM\d{3})-(CLIP-\d{3})$/`, falls back to PENDING for un-tagged uploads. Founder Report is now gated by DASHBOARD_SECRET (same pattern as 5 other dashboard routes).

## Just completed (2026-05-14)

### Phase 0 — OAuth recovery (verification only)
- Mateo's consent landed 2026-05-13. Cron healthy. `youtube_auth.updated_at` doesn't refresh per-tick because `getAccessToken()` exchanges the refresh token in-memory and doesn't write back — expected by design, not a bug.

### Phase 1 — `aa35a90` part 1 — DB migration
- `supabase/migrations/20260514_clip_details_content_id.sql` adds `content_id text NULLABLE` + partial unique index `WHERE content_id IS NOT NULL`. Applied via SQL Editor.

### Phase 2 — `aa35a90` part 2 — backfill (now deleted)
- `scripts/backfill-clip-details-content-id.ts` (one-shot, deleted in Phase 5). Seeded `content_id` for the 45-entry VIDEO_MAP using `getAccessToken()` + YouTube `videos.list?part=fileDetails`. Used `SUPABASE_SERVICE_ROLE_KEY` for UPDATEs. `--dry-run` + `--force` flags. Idempotent.
- Surfaced `[no-filename]` for all 45 videos — `fileDetails.fileName` is no longer returned by YouTube Data API for this channel. Pivot to tag-based auto-map (see Phase 3b).
- Surfaced 3 missing `clip_details` rows (MBM016-CLIP-014, MBM020-CLIP-001/002); Shane added them via SQL.

### Phase 3 — `aa35a90` part 3 — discovery + cron rewrite
- `src/lib/db.ts`: `getShortsRegistry()`, `setClipDetailContentIdIfNull()`, `registerPendingShort()`.
- `src/lib/youtube.ts`: `fetchVideoDiscoveryDetails()` (batched 50/call, returns tags+duration+status+publishedAt), `listChannelVideoIds()` (channels.list?mine=true → paginated playlistItems.list). Also fixed pre-existing B1: `fetchVideoMetadata` now batches 50/call.
- `src/lib/shorts-discovery.ts`: `discoverShorts()` orchestrator. Tag regex match → `setClipDetailContentIdIfNull`; else `registerPendingShort`.
- `src/lib/youtube-sync.ts`: `discoverShorts` called first thing inside `runYouTubeSync` (wrapped in try/catch — failures don't abort sync). Registry loaded once, passed through to `runBreakdownSync`. Three `Object.entries(VIDEO_MAP)` sites replaced.

### Phase 4 — `aa35a90` part 4 — PENDING-aware aggregation
- `getLatestPostsPerClip`: PENDING rows group by `clip_details_code` (not `clip_code`), so each PENDING short stays its own bucket.
- `getTotalViewsPerClip`: filters out `clip_code='PENDING'` entirely.
- `getAllPostsByDate`: unchanged (PENDING is real daily data).
- `/api/founder-report`: `.or('clip_details_code.is.null,clip_details_code.not.like.PENDING-%')` — caught BLOCKER mid-review where naive `.not()` would have zeroed 3,698 long_form rows with NULL `clip_details_code`.

### Hot-fix — `19f528e` — partial-index ON CONFLICT failure
- First prod cron after Phase 3 deploy: `registerPendingShort` 400'd silently (caught by outer try/catch). Root cause: PostgREST can't use a partial unique index (`WHERE content_id IS NOT NULL`) as an inferred ON CONFLICT target via `?on_conflict=col`. Migration `20260514_clip_details_content_id_unique_constraint.sql` drops the partial index and adds a regular `UNIQUE` constraint. `NULLS DISTINCT` default preserves the long-tail "many rows can have NULL" semantic.
- After applying, cron run #2: 6 PENDING rows registered. Shane bulk-resolved via SQL to MBM025 (+1) and MBM026 (+5). End-to-end discovery → PENDING → SQL-resolve → daily stats verified.

### Phase 5 — `8b923b1` — VIDEO_MAP cleanup
- Pre-audit caught: `scripts/*` files each have their own local VIDEO_MAP copies, NOT imports. Only real importer was the Phase 2 backfill script (already deleted).
- Deleted `VIDEO_MAP` const + export from `src/lib/youtube-sync.ts` (50 lines).
- Migrated `/api/video-times/route.ts` from a stale 19-entry local copy to `getShortsRegistry()`. Filters PENDING. Batches 50/call (registry now exceeds 50 entries).
- `scripts/youtube-studio-sync.ts` header STATUS: `"Active as of 2026-04-29"` → `"Inactive — LaunchAgent unloaded 2026-05-05; preserved for revival reference."` (one-line clarification per Shane's spec). Body untouched.
- Net: -89 lines + 1 deletion.

### Follow-ups bundle — `946ece4` — auth gate + defensive tweak
- `/api/founder-report` now gated by `x-dashboard-secret` header (matches 5 other dashboard routes). 500 body changed from raw Supabase error to generic `"founder-report failed"` — detail in `console.error` server logs.
- `FounderReportView.tsx` sends `NEXT_PUBLIC_DASHBOARD_SECRET` in the fetch.
- `/api/diagnostics/route.ts` server-to-server fetch to `/api/founder-report` now forwards the secret (caught by reviewer pre-push — would have 401'd the internal consistency check).
- `getLatestPostsPerClip` defensive guard: `else if (clipCode && clipCode !== 'PENDING')` for the future-writer scenario where a PENDING row has NULL `clip_details_code`. Each such row now falls to `row.id` instead of collapsing to synthetic `PENDING::platform`.

## Recent commits (top down)
- `946ece4` fix: gate /api/founder-report behind DASHBOARD_SECRET + harden PENDING grouping
- `8b923b1` refactor: Phase 5 — remove VIDEO_MAP, migrate /api/video-times to registry
- `19f528e` fix: swap clip_details.content_id partial index for UNIQUE constraint
- `aa35a90` feat: DB-driven shorts registry + auto-discovery (Phase 1–4)
- `eaca78a` chore: sync primer HEAD pointer + cloudmemory log entry
- `bd13277` chore: session shutdown — picker dedup + Dashboard toggle shipped

## In progress
- Nothing actively in progress at session end.

## Blocked / next
- **Watchdog scraper decision** — `scripts/youtube-studio-sync.ts` LaunchAgent confirmed unloaded since 2026-05-05. Header now says "Inactive — preserved for revival reference." Revive (re-install LaunchAgent) or delete (`scripts/youtube-studio-sync.{ts,sh,test.ts}` + `com.clipstudio.youtubesync.plist`)? Studio-snapshots table exists; diagnostics tab depends on this scraper if it runs. **No pressure either way.**
- **Stale `scripts/youtube-studio-sync.test.ts:163`** — asserts `VIDEO_MAP.length === 19`, actual local copy is 38. Already failing if anyone runs the test. Tied to the watchdog scraper decision above.
- **`Q8iJ2gBujpY` long-form video** — status still unresolved (private vs deleted). Needs OAuth in local `.env.local` to disambiguate. YOUTUBE_CLIENT_ID/SECRET were added this session — re-attempt next time.
- **Tag-based auto-map remains theoretical** — discovery handles it, but Shane doesn't currently tag uploads. Every new short → PENDING → manual SQL resolve. If Shane starts tagging (e.g. `MBM027-CLIP-001`), discovery will auto-map without any code change.
- **Pre-existing carryover (unchanged this session):**
  - Manual `sudo pmset repeat cancel` still pending (cosmetic, scraper LaunchAgent is off).
  - Open `docs/data-layer-audit.md` items #4, #6, #9, 6.7, 6.8.
  - Vercel cron reliability — Hobby plan crons are best-effort; consider Pro or external scheduler if long-form freshness becomes critical.
  - `studio_snapshots` migration not yet applied (per primer 2026-05-13).
  - Engine test gate (clip-finder API + UI) still gated.

## Footnotes for next session
- **Two new schema columns / constraints worth knowing:**
  - `clip_details.content_id text` (nullable) — YouTube videoId for uploaded Shorts. Populated by discovery or manual edit.
  - `clip_details_content_id_unique UNIQUE (content_id)` — regular UNIQUE constraint. **Do NOT downgrade to partial index** — PostgREST can't ON CONFLICT against partial indexes (see CLAUDE.md "Upsert conflict keys" + lessons.md 2026-05-14).
- **Auth-gated routes now include `/api/founder-report`.** Pattern: server reads `DASHBOARD_SECRET`, client reads `NEXT_PUBLIC_DASHBOARD_SECRET`, header is `x-dashboard-secret`. Server-to-server callers (`/api/diagnostics`) use unprefixed `DASHBOARD_SECRET`.
- **`scripts/backfill-clip-details-content-id.ts` is deleted** — `getShortsRegistry()` is the equivalent now. If you ever need to re-backfill from a snapshot, write a fresh one-shot.
- **`fetchVideoMetadata` (and `fetchVideoDiscoveryDetails`) batch 50/call.** Any future helper that calls YouTube `videos.list?id=...` must respect the 50-ID limit.
- **6 PENDING shorts resolved via SQL this session** (MBM025 +1, MBM026 +5). Next cron tick will surface any new untagged uploads as fresh PENDING rows — Shane resolves via SQL Editor. The workflow is now permanent until tag-based auto-map is adopted.
- **CLAUDE.md additions this session:** one new bullet in "Upsert conflict keys" (clip_details split into two lines + partial-index warning), one new "Don't" about `.not('col', 'like', X)` against nullable columns.
- **lessons.md additions this session:** three 2026-05-14 entries (import-statement grep vs occurrence grep; auth-gate caller scan; verify reviewer concerns against specific code paths).
