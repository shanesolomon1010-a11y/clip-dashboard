# Session Primer

_This file is rewritten by Claude at the end of every session._
_It captures current project state so the next session starts with full context._

## Status
HEAD = `98d864b` on `main` = `origin/main` (clean before this close commit). After this primer write the close commit lands as a single new commit on top of 98d864b — Shane will push in one shot after handoff review. No code changes this session; this was a diagnose-and-revert incident response, all writes via Supabase SQL Editor.

## What happened this session (2026-05-25 → 2026-05-26 00:xx UTC)

### 00:00 UTC heartbeat fired RED — `cron_completion.instagram_sync.status`
Heartbeat read "IG 9.6h ago." Suspected possibilities: (a) the IG `maxDuration` 60s → 300s bump from 6116e26 wasn't pushed, or (b) something else. Diagnosed:
- **Push state**: origin/main = HEAD = 98d864b. (a) ruled out.
- **cron_runs**: Both 17:00 and 23:00 UTC IG ticks fired and **failed in ~30s** (well under 60s — not a timeout) with `duplicate key value violates unique constraint "posts_contentid_platform_statdate_key"`. The 11:00 and 05:00 UTC ticks succeeded (59 rows each). The break started between 11:00 and 17:00 UTC.
- **posts**: `MAX(updated_at) WHERE platform='instagram'` = `2026-05-25 14:23:32 UTC` — 13h frozen at exactly the timestamp of yesterday's Phase 2B SQL run.

### Root cause: Phase 2B IG re-key broke the IG cron's upsert contract
Phase 2B (commits in 98d864b's SQL transaction, applied yesterday via SQL Editor) re-keyed `posts.clip_details_code` from `PENDING-IG-{igid}` → `MBM###-CLIP-###` for 7 IG content_ids — but did NOT migrate `clip_details.instagram_content_id` onto the new MBM rows. The PENDING-IG `clip_details` rows still exist with `instagram_content_id={igid}`, so `getInstagramRegistry()` still returns them. The IG cron upserted with the stale `PENDING-IG-{igid}` clip_details_code → no match on the new `(MBM###-CLIP-###, instagram, today)` row → fell back to INSERT → collided on the separate unique constraint `(content_id, platform, stat_date)` → 23505 error → cron aborts before any rows persist.

Shane's initial framing ("clip_details.content_id is dual-use — stores YT video_id AND IG media_id for PENDING-IG rows") was incorrect — actual schema has a dedicated `instagram_content_id` column, and `content_id` is NULL on PENDING-IG rows. Surfaced the correction before drafting SQL.

### Revert (DB-only — no code changed)
Drafted SQL transaction; Shane pasted and ran in Supabase SQL Editor:
1. UPDATE posts SET clip_details_code = 'PENDING-IG-' || content_id for the 7 IG content_ids
2. INSERT INTO clip_details (idempotent `ON CONFLICT (instagram_content_id) DO NOTHING`) — no-op since the 7 PENDING-IG rows hadn't actually been deleted in Phase 2B (further evidence the user's mental model of "deleted PENDING-IG rows" didn't match reality)
3. Two verification SELECTs

### Verification: clean
- Manual IG cron fire: HTTP 200, `rowsProcessed > 0`, no errors
- Founder Report 7d: YT numbers unchanged (shortsViews=877, longFormViews matches yesterday) — IG isn't in the Founder Report so no shift expected there

### Memory hygiene shipped this close commit
- **CLAUDE.md**: Added "Don't" rule about IG re-keying — full forward-migration sequence (set `instagram_content_id` on MBM → re-key posts → delete PENDING-IG clip_details) must happen in one transaction; partial re-keys break the IG cron.
- **lessons.md**: Two-part entry — (1) audit all consumer crons that key off a column before migrating it, (2) verify user-stated schema claims against actual columns before drafting SQL.

## The 7 affected IG content_ids (currently reverted to PENDING-IG-{igid})

| IG media_id | Mapped MBM (pre-revert) | YT video_id | Title |
|---|---|---|---|
| 17890685922527525 | MBM027-CLIP-002 | c4St-xx3aaA | Test Enough Ads |
| 17989618715981741 | MBM028-CLIP-004 | gUPfy7yizJI | High CPMs |
| 18036326957609126 | MBM026-CLIP-007 | bCSERqc23Os | ChatGPT Keyword List |
| 18095979344277573 | MBM029-CLIP-003 | sz19jc2cv2k | Stop Letting Google Tank Margins |
| 18097950602037042 | MBM026-CLIP-006 | K03eDcE5CTY | YouTube Like Facebook |
| 18100491329090782 | MBM027-CLIP-003 | XtfGF4Qo8Bg | Wait Too Long to Kill |
| 18123773506725414 | MBM028-CLIP-003 | nBCgJxAlVJE | Kill Rule |

These will need to be re-mapped properly when next-session priority 2 lands (cross-platform mapping refactor).

## In progress
None at session close.

## Carryover for next session (priorities locked in tonight)

### Priority 1 — Auto-mapper signal fix (`fileDetails.fileName`)
`src/lib/shorts-discovery.ts:72-88` matches `MBM###-CLIP-###` against `snippet.tags`, which is always empty on this channel. Switch to `fileDetails.fileName` (YT Studio filename carries the clip code). Requires `part=fileDetails` on the videos.list call and likely an additional OAuth scope — verify against current `youtube_auth.refresh_token` scopes first. **Solves the PENDING growth problem at the source** — once shipped, daily YT cron at 14:00 UTC auto-maps new uploads instead of accumulating PENDING rows. Plan stub at `docs/superpowers/plans/2026-05-14-shorts-auto-discovery.md:36`.

### Priority 2 — Cross-platform mapping refactor (Option B from tonight's debate)
The real fix for the schema gap that broke us tonight. Set `instagram_content_id` on MBM clip_details rows + delete the corresponding PENDING-IG clip_details rows + re-key posts.clip_details_code to MBM###-CLIP-### — all in one transaction. Tonight's revert is technical debt that must be paid off; until then, the 7 IG-paired clips stay PENDING-IG and don't count in Founder Report.

The minimum viable implementation is a SQL migration plus a one-time backfill script. Longer term, formalize this in `upsertClipDetail()` so the mapping UI in Settings (when built) writes both the YT and IG sides atomically.

### Priority 3 — 52 remaining PENDING IG reels — batch-pair via publishedAt + topic match
Same Phase 2B pairing pattern (publishedAt ± 48h window + caption topic match) the 7-clip batch used. Most are older April content. Should land AFTER priority 2 so the pairing migration uses the proper cross-platform schema, not the broken Phase 2B pattern.

### Priority 4 — Right-rail skeleton state (Channel Summary + Platforms widgets)
Claude in Chrome flagged: these widgets render with old/stale data during the windowed refetch instead of skeletoning like the 7 numeric tiles do. Mirror the `SkeletonStatCard` pattern from 5d59371. Scope is small — likely 2 components and a `widgetLoading` flag on the relevant view.

### Priority 5 — 8 remaining `.not(...is,null)` patterns in `diagnostics.ts`
Deferred from May 22 audit. Same client-runtime quirk as the cron-hot-path patterns already fixed (88d6a92, 07bec9e, ce23a65, 1d25889). Pattern: fetch-all-then-JS-filter. Not user-visible but causes diagnostics rows to drop silently.

### Priority 6 — 3 orphan IG reels from tonight's pairing investigation
Three IG reels in/near the 7d window had no YT counterpart in the 7-clip pairing batch. May be IG-only content, or paired with YT shorts that haven't been mapped yet. Worth a focused pairing pass once priority 2's schema lands.

## Known non-issues (don't escalate)
- **`last_scraper_run`, `studio_snapshots_latest_stat`, `coverage`, `scraper_history`** all read RED forever — LaunchAgent scraper deletion fallout. Muted in `KNOWN_RED_PATHS`.
- **YT cron `stat_date` trailing today by 2-3 days** — intrinsic YouTube Analytics API reporting lag.
- **`/api/diagnostics` has no route-level auth** — Vercel deployment protection is the gate.
- **`cron_health.last_youtube_sync_short.status: yellow` between 14:00 UTC ticks** — known threshold misalignment.
- **52 PENDING IG reel rows + 1+ daily PENDING YT short rows growing** — auto-mapper fix (priority 1) closes the tap.
- **Platforms / Comparison / Posting Schedule views hidden from sidebar** for demo — intentional. Re-enable = uncomment ids in `NAV_GROUPS[].items`.
- **The 7 IG reels re-keyed to PENDING-IG-{igid} tonight** are NOT counted in Founder Report short views right now (PENDING exclusion filter applies). This will resolve when priority 2 lands.

## Data shape facts (current, post-revert)
- **5,790+ posts rows** total. IG reel 678 (59 currently PENDING-IG — was 52 + the 7 that just reverted), YT short 1,453 (≥1 still PENDING), YT longform 3,765.
- **137 clip_details rows.** 70 MAPPED (the 7 MBM rows from Phase 2A still exist, but with `instagram_content_id=NULL`), 66 PENDING_IG (back up to 66 from 59 — the 7 re-key targets all re-exist intact), 0 PENDING_YT.
- **IG token** expires 2026-07-14 (~49 days remaining).
- **`cron_runs`** all 4 crons green again post-revert.
- **Founder Report 7d:** shortsViews 877 (unchanged), longFormViews unchanged, lastDataDate 2026-05-22 (still trailing per YT Analytics lag).
- **Founder Report 30d:** shortsViews ~9,905 (the 7 IG paired clips' counted views came from the YT side, not the IG side, so 30d numbers unchanged by tonight's revert).

## Architectural patterns established this multi-session arc
- **Computation callable from both an HTTP route AND a cron lives in a runtime-agnostic lib** (no `Request`/`NextResponse`/header reads). Precedents: `src/lib/diagnostics.ts`, `src/lib/founder-report.ts`.
- **Cron observability is three layers**: `cron_runs` (function-completion), `posts.updated_at` (writes-landed), `write_correlation` (correlation between the two).
- **All `posts` upserts bump `updated_at` on UPDATE via BEFORE UPDATE trigger** — code-level discipline no longer required.
- **PENDING→mapped migration ordering**: must DELETE PENDING row BEFORE setting `content_id` on the mapped row.
- **Sidebar hide pattern**: comment ids in `NAV_GROUPS[].items`, NOT in `NAV_ITEMS`.
- **NEW tonight**: re-keying `posts.clip_details_code` is a multi-table contract — touching it requires auditing every consumer cron's registry/upsert pattern, especially IG which uses `clip_details_code` for both. Priority 2 paves the lasting fix.

## Next natural action
1. **Push the 1 unpushed close commit** once handoff doc is reviewed: `git push origin main`
2. **Tackle Priority 1** (auto-mapper signal fix) — directly addresses the daily PENDING growth.
3. **Then Priority 2** (cross-platform mapping refactor) — pays off the technical debt from tonight's revert, unblocks Priority 3.

## Blocked / open
- Supabase MCP write tools blocked for DML/DDL — SQL Editor workflow only. Read-only SELECT fine without asking.
- Priority 1 (auto-mapper fix) is blocked on confirming whether `part=fileDetails` needs an additional OAuth scope.
- Priority 2 (cross-platform mapping refactor) approach is decided — **Option B** from tonight's discussion: set `instagram_content_id` on MBM rows + delete PENDING-IG clip_details rows + re-key posts in one transaction. Next session: draft the migration + backfill script.
