# Session Primer

_This file is rewritten by Claude at the end of every session._
_It captures current project state so the next session starts with full context._

## Status
HEAD = `ded3fc3` on `main`. `origin/main` = `3694460` (Shane pushed the earlier session commits between turns). **Unpushed: `ded3fc3` + this close commit = 2 commits** awaiting `git push origin main`.

This was a large build + integrity + ops session (2026-05-29 → 2026-06-02). Shipped the manual clip-mapping feature, retired the dead Studio-scraper diagnostics, added the DB-level `posts → clip_details` FK guard, hardened every silent data-load/write path in the three editor views, fixed the Clip Library empty-render bug, and added a redundant YT cron tick. Also built a ground-truth image-match pipeline that produced a 47-call `map_clip` batch (applied a prior session) plus a 5-reel follow-on block (applied 2026-06-02) — together these cleared most of the PENDING-IG backlog; `ig_mapping_desync()` = 0.

## Shipped this session (commits on top of ba6ec80)
- `c00e05e` **feat(mapping): manual clip-mapping tab + map-clip route** — Settings → "Mapping" sub-tab (`stab=mapping`, 2nd after Clip Library); new `getPendingMappings()` in db.ts; server route `POST /api/library/map-clip` (x-dashboard-secret gated, service-role, validates `/^MBM\d+-CLIP-\d+$/` + ≥1 id, calls `supabase.rpc('map_clip', …)`, returns jsonb). New `MappingTab.tsx`.
- `da5899d` **feat(mapping): same-date suggestions + invalid-code feedback + badge count** — same-date candidate ranking (token-overlap), pre-fill on single candidate, inline invalid-code error + red border, badge counts mappable (has-posts) reels only.
- `1061c2c` **chore(diagnostics): retire dead Studio-scraper checks** — removed `last_scraper_run`, `studio_snapshots_latest_stat`, `scraper_history` from diagnostics.ts + DiagnosticsView + KNOWN_RED_PATHS. `studio_snapshots` table & `studio_snapshots_null_clip_details_code_count` left intact; `scraperRunStatus` + tests left alone.
- `efc208e` **chore(diagnostics): retire coverage check** — removed `coverage`/`CoverageCheck`/`buildCoverage` end-to-end. **`KNOWN_RED_PATHS` is now empty** (`new Set<string>([])`) — every remaining check is load-bearing; heartbeat red-by-design count = 0.
- `1844b38` **feat(integrity): posts→clip_details FK guard + Clip Library delete guard** — recorded the live FK (`posts_clip_details_code_fkey`, ON UPDATE CASCADE / ON DELETE RESTRICT, applied 2026-06-01 via SQL Editor) in `supabase/migrations/20260529_clip_mapping_integrity.sql`; SettingsView `handleDeleteClip` now catches SQLSTATE 23503.
- `7c32cbb` **fix(clip-library): drop unused thumbnail_base64 from list selects** — root cause of the "Episodes (0) / No clips yet" empty-render. `fetchAllClipDetails` + `fetchClipDetails` selects no longer include `thumbnail_base64` (zero render consumers).
- `5a985c1` **fix(settings): surface clip/pending load failures** — `clipsLoadError`/`pendingLoadError` states + visible error lines instead of silent empty state.
- `89063b8` **fix(views): surface load failures in Data Editor and Posting Schedule** — `loadError` (DataEditorTab); `fetchError` carries message + `clipLoadError` (PostingScheduleView).
- `7532043` **fix(views): surface write/action and refetch failures** — DataEditor save/delete `actionError`; SettingsView delete-clip non-23503 branch sets clipStatus; split PostingScheduleView refetch into non-destructive `refetchError` banner.
- `3694460` **fix(schedule): surface calendar post-delete failures** — wrapped `handleDeletePost` in try/catch + `deleteError` banner (the last fully-silent mutation handler).
- `ded3fc3` **harden YT crons: add 21:00 UTC redundant tick** — `youtube-sync` → `0 14,21 * * *`, `youtube-sync-longform` → `30 14,21 * * *`. Mitigates Hobby-tier skipped daily runs. **Takes effect only after deploy.**

## Clip-mapping backlog — image-match batches APPLIED ✅
Built a ground-truth image-match pipeline (clip files on disk are named with MBM codes) to pair PENDING-IG reels → MBM clips, replacing the unreliable same-date guess. **Both batches are applied and verified — `ig_mapping_desync()` = 0.**
- **47-call batch** (winners pHash dist ≤6, deduped, existing clip_details row): applied a prior session.
- **5-reel follow-on block** (the clip_details-gap rows that needed map_clip to create the MBM shell): applied **2026-06-02**.
- **Method (for re-use)**: ffmpeg banner-frame extraction (t=0,1s) per clip rep → pHash vs each reel thumbnail (by `thumbnail_url`) → min distance, deduped by target code, cutoff ≤6 (clean cliff: 0/2/4/6 then nothing until 10). Each call `SELECT map_clip('MBM###-CLIP-###', NULL, '<ig_media_id>');` — `p_yt=NULL` preserves YT `content_id`, sets `instagram_content_id`, re-keys posts, deletes the PENDING-IG row. Artifacts were in `/tmp/clipmatch/` (volatile); source clips in `~/Downloads` + `~/Movies` are intact (162 files → 68 distinct MBM codes) so the pipeline is fully re-runnable; deps installed (ffmpeg, pillow, imagehash, requests).

## Next natural action (in order)
1. **Push the 2 unpushed commits** (`git push origin main`) → Vercel deploy activates the 21:00 UTC redundant YT cron tick (ded3fc3 has no effect until deployed).
2. **Adjudicate the ~5 hard-held reels** — 3 collision losers likely from MBM022/023 (no local clip files exist for those episodes, so image-match can't place them) + 2 with best pHash distance >6. Needs a manual/visual call.
3. **Clear the rest of the PENDING backlog** — the 13 PENDING_IG = the ~5 hard-held + 7 known IG orphans + 1 new overnight reel; plus 8 PENDING_YT. Pair via the same `map_clip` path wherever a ground-truth match exists.
4. **Refresh the IG token before 2026-07-14** (~6 weeks out).

## Mapping is MANUAL now (auto-mapper is dead — confirmed 2026-05-29)
Both upload-side signals are gone: `snippet.tags` always empty on this channel; `fileDetails.fileName` no longer returned by the YT Data API (verified, not scope-gated). The sanctioned re-key path is the atomic `map_clip(p_code, p_yt_video_id, p_ig_content_id)` plpgsql fn. The new Settings → Mapping UI + the `/tmp/clipmatch` image-match pipeline are how the backlog gets cleared. **Old "Priority 1: auto-mapper fix" is obsolete — do not revive it.**

## Integrity model now complete (prevent / detect / guard)
- **PREVENT** — `map_clip()` is the only sanctioned re-key path (atomic, RAISEs on half-state).
- **DETECT** — `ig_mapping_desync()` heartbeat probe; wired into diagnostics, NOT muted.
- **GUARD** — `posts_clip_details_code_fkey` FK (live since 2026-06-01) makes a posts row referencing a non-existent clip_details_code physically impossible. NULL children (long-form posts) exempt. ON DELETE RESTRICT blocks deleting a clip_details row with live posts (Clip Library delete catches 23503 → friendly message).

## Cron health
- `youtube-sync` cron entry is present & correctly wired (route → `runYouTubeSync()`, Bearer auth, maxDuration 300s). A "dead" shorts cron is NOT a config problem — most likely Vercel Hobby skipped-run unreliability. The new 21:00 tick (ded3fc3) is the mitigation; needs deploy to take effect.
- Schedules: shorts `0 14,21 * * *`, longform `30 14,21 * * *`, IG `0 11,17,23,5 * * *`, diagnostics-alert `0 */6 * * *`.
- Shorts and longform use SEPARATE sync fns (`runYouTubeSync` in `youtube-sync.ts`; `syncLongFormVideos` in `youtube-longform-sync.ts`) — not shared.

## Data shape facts (live, queried 2026-06-02 post-batch-apply)
- **96 clip_details rows**: 75 MAPPED, 13 PENDING_IG, 8 PENDING_YT. `clip_details_code` is UNIQUE (`clip_details_code_unique`), 0 nulls, 0 dupes.
- **`ig_mapping_desync()` = 0** — no cross-row desync after the mapping batches.
- **0 orphan posts** — every non-null `posts.clip_details_code` has a matching clip_details row, now guaranteed by the FK.
- The 13 PENDING_IG ≈ 5 hard-held image-match reels (3 collision losers likely MBM022/023 + 2 dist>6) + 7 known IG orphans + 1 new overnight reel; the 8 PENDING_YT are separate.
- `posts.posted_at` is **date-resolution only** (midnight / batch-stamped constants) — no minute-level publish time, which is why same-date pairing was ambiguous and image-match is the better signal.

## Known non-issues (don't escalate)
- **YT cron `stat_date` trailing today by 2-3 days** — intrinsic YouTube Analytics API reporting lag, not a failure.
- **`/api/diagnostics` has no route-level auth** — Vercel deployment protection is the gate.
- **`clip_details.thumbnail_base64` is unusable via the anon/PostgREST client** — selecting it returns []/400 (browser empty-render + reel-download 400 both traced to it). Fetch thumbnails by `thumbnail_url` instead. Column stays in the DB.
- **Some sidebar views hidden for demo** (Posting Schedule etc.) — intentional; re-enable = uncomment ids in `NAV_GROUPS[].items`.
- **`KNOWN_RED_PATHS` is now empty** — the 4 studio-scraper RED-forever checks were removed entirely, not muted. Any RED now is real and alerts.

## Blocked / open
- Supabase MCP write tools blocked for DML/DDL — SQL Editor workflow only; read-only SELECT fine without asking.
- Commit author resolves to `Shane Solomon <shane@Mac.lan>` — git identity not configured (`git config --global` to fix; harmless).
- 8 remaining `.not(...is,null)` patterns in `diagnostics.ts` still deferred (same client quirk; fetch-all-then-JS-filter fix). Not user-visible.
