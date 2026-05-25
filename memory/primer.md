# Session Primer

_This file is rewritten by Claude at the end of every session._
_It captures current project state so the next session starts with full context._

## Status
HEAD is `a8a18e4` on `main`, **6 commits unpushed + 1 close commit pending after this primer write**. Local is 7+ commits ahead of origin/main at session close. Shane will push all in one shot after handoff review.

The 2026-05-22 IG silent-writes arc is fully closed (write_correlation backstop shipped). The 2026-05-25 session shifted focus to demo-prep + a deep root-cause dive on the auto-mapper (rows landing as PENDING for un-mapped YT shorts and IG reels). 7 manually-mapped clips re-keyed via SQL, 90 cross-platform posts rows promoted PENDING→MAPPED. Founder Report 7d shortsViews recovered from 9 → 877.

### Commits unpushed at session close (in order)
1. `6116e26` fix(cron): bump IG sync maxDuration to 300s — same defensive insurance as YT shorts (034643f)
2. `5d59371` fix(dashboard): skeleton stat tiles while window data refetches
3. `28ade1c` chore: strip stray debug console.logs from components and api routes
4. `1a05265` docs(founder-report): explain PENDING-clip exclusion in footer
5. `927ae6b` feat(sidebar): hide Platforms + Comparison views for stakeholder demo
6. `a8a18e4` feat(sidebar): hide Posting Schedule for stakeholder demo
7. (close commit landing right after this primer write — primer + lessons + CLAUDE.md hygiene + cloudmemory.md hook)

Push command: `git push origin main`.

## Just completed

### Auto-mapper backlog cleared via manual mapping (2026-05-25)
**Discovered root cause:** `src/lib/shorts-discovery.ts:72-88` matches `MBM###-CLIP-###` against `snippet.tags`, which is ALWAYS EMPTY on every video the channel has uploaded. The auto-mapper has been running daily on schedule, doing exactly what the code says, but the upstream tagging signal it depends on doesn't exist. Every new YT short and IG reel auto-creates a PENDING row by design. Founder Report 7d shortsViews showed 9 (down from real ~830) because it excludes PENDING-* via `.or('clip_details_code.is.null,clip_details_code.not.like.PENDING-%')`.

**Phase 1 investigation (read-only):** Fetched YT Data API + IG Graph API metadata for 7 YT PENDING shorts + 10 sampled IG PENDING reels. Confirmed zero MBM-pattern occurrence in any title, description, tag, or caption. Discovered that YT/IG cross-publish times sync within 0-6 minutes for every paired clip — strong signal for future automation.

**Phase 2A (executed): YT backlog clearance.** Shane manually pulled 7 video_id → MBM###-CLIP-### mappings from YouTube Studio (the clip code lives in `fileDetails.fileName`, NOT tags — auto-mapper is looking at the wrong field). SQL transaction:
- Inserted 7 MBM clip_details shell rows with titles
- Re-keyed 29 posts rows from PENDING-{vid} → MBM###-CLIP-###
- Deleted 7 PENDING clip_details rows
- Claimed content_id on the 7 MBM rows (in that order — UNIQUE constraint on `clip_details.content_id` requires PENDING delete first)

**Phase 2B (executed): IG pairing.** Used YT `publishedAt` ± 48h window + topic-match on captions. All 7 pairings were obvious 1:1 (posted within 0-6 min of each other, same argument). 61 IG posts rows re-keyed to the corresponding MBM codes. Three IG orphans in the window (no YT counterpart in the 7-list) deferred.

**Result:** Founder Report 7d shortsViews 9 → 877 (+97×). 30d shortsViews 7,994 → 9,905 (+24%). `shortsPublished` 18 → 25 (+7, exactly matching). Zero remaining PENDING for the 14 mapped content_ids.

### Mappings applied this session (for reference / debugging)
```
nBCgJxAlVJE → MBM028-CLIP-003 → IG 18123773506725414 ("Kill Rule")
K03eDcE5CTY → MBM026-CLIP-006 → IG 18097950602037042 ("YouTube Like Facebook")
sz19jc2cv2k → MBM029-CLIP-003 → IG 18095979344277573 ("Stop Letting Google Tank Margins")
gUPfy7yizJI → MBM028-CLIP-004 → IG 17989618715981741 ("High CPMs")
c4St-xx3aaA → MBM027-CLIP-002 → IG 17890685922527525 ("Test Enough Ads")
bCSERqc23Os → MBM026-CLIP-007 → IG 18036326957609126 ("ChatGPT Keyword List")
XtfGF4Qo8Bg → MBM027-CLIP-003 → IG 18100491329090782 ("Wait Too Long to Kill")
```

### Sidebar trimmed for stakeholder demo
Hidden from sidebar: Platforms, Comparison, Posting Schedule. NAV_GROUPS visibility filter commented (NAV_ITEMS catalog intact — keeps icon imports referenced, no `no-unused-vars` break). Views remain reachable via direct URL (`?tab=platforms` / `?tab=comparison` / `?tab=schedule`). Sidebar at demo time shows: **ANALYTICS** Dashboard, Founder Report; **WORKSPACE** Settings.

### Defensive deploy fixes
- **Dashboard stale-window fix** (5d59371): 7d → All Time switch was showing old 7d numbers under "All Time" label for 6-8s during the windowed refetch. Added `windowLoading` state and `SkeletonStatCard` component, mirroring FounderReportView's animate-pulse pattern. Scope: 7 numeric tiles get skeletoned; Unique Viewers tile unaffected (its data isn't windowed).
- **Console.log strip** (28ade1c): 6 debug logs removed across 3 files (VideoPreviewModal, PostingScheduleView, api/import/clips).
- **Founder Report PENDING footer** (1a05265): one-line italic note below data freshness explaining the Dashboard ↔ Founder Report gap.
- **IG cron maxDuration 60s → 300s** (6116e26): one IG cron got stuck `status='running'` on 2026-05-23 23:00 UTC — same class as the YT-shorts hangs pre-034643f. Cleaned up manually via SQL; bumped IG to 300s for parity defensive insurance.

### Write-correlation backstop shipped (already pushed pre-2026-05-25)
The 2026-05-22 carryover item is closed. `buildWriteCorrelation()` in `src/lib/diagnostics.ts` correlates each cron's latest `cron_runs.success` row against `posts.updated_at` to detect silent-write events. Verified end-to-end live: all 3 sub-crons (youtube-sync, youtube-sync-longform, instagram-sync) reporting `posts_touched_after_start == cron_rows_processed`.

## In progress
None at session close.

## Carryover for next session

### 1. Auto-mapper signal fix — `snippet.tags` → `fileDetails.fileName`  [PRIORITY 1]
The actual code lives in YT Studio filename. `src/lib/shorts-discovery.ts:72-88` needs:
- Add `part=fileDetails` to the videos.list request (may require additional OAuth scope — verify against current `youtube_auth` token scopes before assuming).
- Apply the same `/^(MBM\d{3})-(CLIP-\d{3})$/` regex to `item.fileDetails.fileName` (or whatever subfield carries it — likely strip extension first).
- Keep `snippet.tags` as a fallback so the function works if/when tags get added later.

Once shipped, the daily YT cron at 14:00 UTC will start auto-mapping new uploads. The 52 IG reels still PENDING won't be touched — they need their own fix (IG Graph API doesn't expose a fileName equivalent; likely needs caption-similarity matching or a manual UI).

### 2. IG PENDING backlog — 52 reels remaining
Most are older content from April. Lower priority since IG isn't in tomorrow's Founder Report demo. Same Phase 2B pairing approach works: query IG `posted_at` against the long_form_videos table (16 episodes; each long-form likely produces 3-5 short clips); for each unpaired IG reel, find the nearest long-form by date and offer a candidate code. May be cleaner to ship a manual mapping UI in Settings — surface PENDING rows with a dropdown to assign `clip_details_code`.

### 3. Long-form-side auto-mapper validation
The auto-mapper investigation focused on YT shorts. Long-form catalog (`long_form_videos`, 16 rows, all mapped via `video_id`) doesn't appear to have the PENDING problem. Worth a quick sanity check next session: `SELECT COUNT(*) FROM posts WHERE platform='youtube' AND content_type='long_form' AND clip_details_code LIKE 'PENDING-%'` to confirm zero.

### 4. YT cron freshness thresholds still trigger yellow between daily ticks
`cron_health.last_youtube_sync_short/longform` flips yellow ~12h after the 14:00 UTC tick and stays yellow until the next tick. Known issue from May 22 audit (#7). Threshold misalignment — `cron_health` uses 12h yellow / 24h red, but YT runs daily. Either widen thresholds for YT-specific paths (e.g., 26h yellow / 50h red) or fold YT freshness into `cron_completion` (which uses 36h red and behaves correctly). Defer; not visible noise unless someone watches `/api/diagnostics` between ticks.

## Known non-issues (don't escalate)
- **`last_scraper_run`, `studio_snapshots_latest_stat`, `coverage`, `scraper_history`** all read RED forever — LaunchAgent scraper deletion fallout from 2026-05-18. Muted in `KNOWN_RED_PATHS` in `src/app/api/cron/diagnostics-alert/route.ts`.
- **YT cron `stat_date` trailing today by 2-3 days** — intrinsic YouTube Analytics API reporting lag.
- **`/api/diagnostics` has no route-level auth** — Vercel deployment protection is the gate.
- **`cron_health.last_youtube_sync_short.status: yellow` between 14:00 UTC ticks** — see carryover #4. Not a real signal.
- **1 PENDING YT short row + 52 PENDING IG reel rows remaining** at session close — expected daily backlog growth until auto-mapper fix lands (carryover #1).
- **Platforms / Comparison / Posting Schedule views hidden from sidebar** for demo — intentional (commits 927ae6b, a8a18e4). Re-enable = uncomment ids in `NAV_GROUPS[].items`. Views still reachable via `?tab=` URL.

## Data shape facts (current)
- **5,790 posts rows** total. IG reel 678 (52 still PENDING), YT short 1,453 (1 still PENDING), YT longform 3,765.
- **137 clip_details rows.** 70 MAPPED (was 63 — added 7 this session: MBM026-CLIP-006/007, MBM027-CLIP-002/003, MBM028-CLIP-003/004, MBM029-CLIP-003), 66 PENDING_IG, 0 PENDING_YT (down from 8 — cleared the 7 mapped, 1 new from today's cron).
- **IG token** expires 2026-07-14 (50 days remaining).
- **`cron_runs` table** ~60+ rows, all 4 crons running clean.
- **Founder Report 7d (post-cleanup):** shortsViews 877, longFormViews 350, +6 subs, lastDataDate 2026-05-22.
- **Founder Report 30d:** shortsViews 9,905, longFormViews 2,055, +30 subs.

## Architectural patterns established this multi-session arc
- **Computation callable from both an HTTP route AND a cron lives in a runtime-agnostic lib** (no `Request`/`NextResponse`/header reads). Precedents: `src/lib/diagnostics.ts`, `src/lib/founder-report.ts`.
- **Cron observability is three layers**: `cron_runs` (function-completion), `posts.updated_at` (writes-landed), `write_correlation` (correlation between the two). All three shipped.
- **All `posts` upserts bump `updated_at` on UPDATE via BEFORE UPDATE trigger** — code-level discipline no longer required.
- **PENDING→mapped migration ordering**: must DELETE PENDING row BEFORE setting `content_id` on the mapped row (UNIQUE constraint). 4-step transaction pattern documented in CLAUDE.md.
- **Sidebar hide pattern**: comment ids in `NAV_GROUPS[].items`, NOT in `NAV_ITEMS` (avoids unused-import build break).

## Next natural action (in priority order)
1. **Push the 7 unpushed commits** (`git push origin main`) once handoff doc is reviewed.
2. **After demo**: ship the auto-mapper signal fix (carryover #1, `fileDetails.fileName`).
3. **Sometime soon**: revert the sidebar hides (uncomment ids in `NAV_GROUPS[].items` in `Sidebar.tsx`) once the team is ready to demo Platforms / Comparison / Posting Schedule.
4. **Lower priority**: IG PENDING backlog (carryover #2), long-form sanity check (carryover #3), YT freshness threshold tuning (carryover #4).

## Blocked / open
- Supabase MCP write tools (`apply_migration`, `execute_sql` for DML) still blocked. Manual SQL Editor workflow for DDL/DML. Read-only SELECT for diagnostics fine without asking.
- Auto-mapper full fix is blocked on confirming whether `part=fileDetails` requires an additional OAuth scope — verify against current `youtube_auth.refresh_token` scopes before shipping.
