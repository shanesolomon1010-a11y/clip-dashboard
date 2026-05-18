# Session Primer

_This file is rewritten by Claude at the end of every session._
_It captures current project state so the next session starts with full context._

## Status
HEAD is `e336ba0` (the close commit) on `main` (local). **1 commit unpushed**: only the close itself. Branch tracking `origin/main` at `c1e38db` (today's orphan cleanup) — the prior 21 commits from yesterday + today already shipped to remote during this session. Single `git push origin main` lands the close commit (primer/lessons/CLAUDE updates).

Yesterday (2026-05-17) was the comprehensive UI-vs-data audit and 6-round Dashboard fix arc. Today (2026-05-18) was the follow-on audit pass: Founder Report verification → Posting Schedule audit → posts.url + modal video_url investigation → IG embed iframe fix → orphan cleanup. Net: dashboard surfaces verified clean, RLS gap closed, 3,076 lines of dead code removed, 3 small UI discrepancies queued for next session.

### Commits unpushed on `main` (yesterday + today, oldest → newest)
**Yesterday (2026-05-17):**
- `b78f2cd` fix: re-key PENDING posts rows when shorts discovery auto-maps a video
- `0e9e28a` fix: mirror founder-report's PENDING-shorts filter in diagnostics consistency check
- `b131a62` fix: Dashboard A+B+D3+D7 — All Time pagination, kill localStorage, wire platform toggle
- `8619ded` feat: inline platform toggle in DashboardView control row
- `24ebe57` fix: D1+D2+D5 — lifetime engagement metrics across analytical views
- `ce23a65` fix: paginate getTotalViewsPerClip to defeat 1000-row response cap
- `560a37b` fix: include PENDING clips in getTotalViewsPerClip for analytical views
- `6572803` fix: align getTotalViewsPerClip keying with getLatestPostsPerClip's PENDING fallback
- `92c5a12` fix: use clipKey at totalsMap population sites, not just lookup sites
- `1d25889` fix: D4 — per-clip granularity via clipKey, plus NULL-clip_code shorts rescue
- `5e16e3e` fix: D4 rendering sweep — displayClipCode helper, four-pass keying contract complete
- `c007bfc` fix: Dashboard per-clip unification + Top Clips by Unique Viewers clickability
- `649f77d` chore: session shutdown — IG cron live + Dashboard UI-vs-data audit complete

**Today (2026-05-18):**
- `9facd5c` fix: founder-report follow-ups (B + C from audit) — comma-format watch-time, .order('id') on pagination
- `03c55a5` fix: nowrap MetricCard value+suffix (B follow-up) — prevents "6,204.6 hrs" wrap at All Time
- `44e9e0f` fix(rls): add UPDATE policy for scheduled_posts + log Optimizer stub
- `5b738c1` docs: trim scheduled_posts migration + log audit in primer Just-completed
- `77618a5` data: backfill 208 NULL urls on YT shorts + log in primer
- `d2d7640` fix: VideoPreviewModal falls back to post.url when clip_details.video_url is null
- `505fbee` fix: IG embed collapsed to 2px — switch to direct /embed/ iframe
- `c1e38db` refactor: orphan cleanup pass — revive 2 nav entries, delete 16 dead files
- (the close commit you're about to write — primer.md / lessons.md / CLAUDE.md updates)

## Just completed (2026-05-17 → 2026-05-18)

### Health sweep + two cascading fixes (yesterday)
- **YT cron silent failure (3 days stale)**: diagnosed as `posts_contentid_platform_statdate_key` collision after shorts auto-discovery auto-mapped previously-PENDING content_ids that already had posts rows under their old `PENDING-{contentId}` clip_details_code. Fix: `rekeyPendingPostsToMappedCode()` runs immediately after `setClipDetailContentIdIfNull()` in `shorts-discovery.ts`, shifts existing posts rows to the new code. Plus a one-shot SQL UPDATE for the 4 already-stuck content_ids (3xEuwroHK48, QW4qkjBxYLM, 7WUxFwyHpIw, HOoXWvKsCHc).
- **Diagnostics consistency check 34% undercount**: `/api/diagnostics`'s recompute query lacked the `.or('clip_details_code.is.null,clip_details_code.not.like.PENDING-%')` filter founder-report applied. One-line fix.

### Six rounds of Dashboard fixes (yesterday, per the audit)
Original audit identified 7 issues (D1–D7) plus 2 user-flagged (A: All-Time empty; B: localStorage persistence). All addressed across Rounds 1–5 culminating in `c007bfc`. Key invariants now enforced: pagination always uses `.order()`, per-clip keying uses the `clipKey()` helper, JSX renders via `displayClipCode()`, and Top Content widget granularity matches the rest of the Dashboard.

### D6 closed-as-by-design (yesterday)
PENDING-row treatment is now intentionally inconsistent across surfaces: **founder-report excludes PENDING** (founder-facing semantics — un-curated content shouldn't reach stakeholders), **analytical views include PENDING** (operational semantics — see real platform performance during the transient PENDING→mapped window). Diagnostics mirrors founder-report's filter. Both decisions deliberate.

### Founder Report audit + B/C fixes (today)
Audited all 7 metric cards across 7d / 30d / All Time. All ground-truth-clean. Two real bugs fixed:
- **B (comma-format + nowrap)**: MetricCard's decimal branch used `toFixed(1)` which stripped thousands separators; "6204.6 hrs" wrapped to two lines at All Time. Fixed via `toLocaleString` + `whitespace-nowrap` on the value paragraph (two commits: 9facd5c + 03c55a5).
- **C (.order() on pagination)**: both pagination loops in `/api/founder-report/route.ts` lacked stable ordering — latent multi-page-fetch bug at All Time (5,107 + 4,899 rows / 6+5 page fetches). Added `.order('id', { ascending: true })`. CLAUDE.md rule citation in commit message.
- **A (sidebar nav)**: deferred-then-closed as not-a-bug. Code looked correct; DevTools repro confirmed bug doesn't reproduce on clean session. Original report was probably clicking from already-active state (no-op).
- **D (30d numeric drift)**: closed as not-a-bug. UI window shifts ±1 day because `presetRange()` uses UTC date math (`toISOString().slice(0,10)`) while `setDate(getDate()-30)` operates on local date. The 3% "drift" was my ground-truth query missing this — UI is correct.

### Posting Schedule audit + RLS UPDATE policy fix (today)
The "Posting Schedule" tab is a calendar CRUD, NOT an optimizer (primer reference to "Option 1 → Option 2" upgrade was a planning conversation that never translated to code; logged as NOT YET BUILT in carryover). One real bug: `scheduled_posts` had RLS with INSERT/READ/DELETE policies but no UPDATE — silent no-op on `post_time` inline edits (same pattern that hit IG cron on 2026-05-15). Fixed via SQL Editor + migration file `20260517_scheduled_posts_update_policy.sql`. Calendar CRUD is otherwise clean: no aggregation drift, no pagination concerns at 76 rows, no `.not(is, null)` patterns, no D4 keying issues.

### posts.url NULL backfill + modal video_url fallback (today)
Two-part fix that became a recovery story:
- **First half (data hygiene)**: YT shorts had 208 historical rows with NULL posts.url from pre-fa30b23 writer paths; backfilled deterministically from content_id via single UPDATE. Migration file `20260517_backfill_youtube_shorts_url.sql`. All current writers (youtube-sync.ts, youtube-longform-sync.ts, instagram-sync.ts) populate url on every insert — no regression going forward.
- **Recovery**: backfill verified at DB level (0 NULL urls), but modal STILL showed "Video URL not set yet". Diagnosed: VideoPreviewModal reads `clipDetail?.video_url` from the `clip_details` table (86.7% NULL across that table), not `posts.url`. The `post` prop was passed through VideoModalContext but never destructured at the modal call site. Wired the dead prop, added `clipDetail?.video_url ?? post?.url ?? null` fallback (`d2d7640`). MP4 preview clips (17 manually-uploaded MBM015-CLIP-* headline banners) still take precedence; YouTube/IG URLs fill in the rest. 20 PENDING-IG-only clips continue showing the placeholder by design.
- **Lesson**: see `tasks/lessons.md` 2026-05-18 — don't recommend a backfill from a UI symptom without tracing the actual rendering column first.

### IG embed iframe fix (today)
IG reel modal rendered the blockquote + Instagram embed.js script, which produced an iframe with no intrinsic dimensions inside a heightless blockquote → collapsed to 2px. Switched to a direct `/embed/` iframe matching YouTube's pattern (sized 280px container, `className="w-full h-full"`). Net -33 lines: deleted `InstagramEmbed` component and `Window.instgrm` global type declaration; no more third-party script load or race conditions on rapid modal open/close (`505fbee`).

### Round 23 — carryover discrepancies closed (today)
Three small Dashboard tile fixes closed the carryover queue from the end-of-session ground-truth check: Top Clips by Unique Viewers card now hides when platform === 'instagram' (IG has no unique-viewers source), Avg View Duration shows 'N/A' on IG (matches the Impression CTR pattern), and adds a 'YouTube only' caption on All Platforms (IG contributes nothing to the weighted blend, so the value is YT-only by construction — caption surfaces that). Single bundled commit `83253cb`. Build clean, all tests passed.

### Orphan cleanup pass (today)
Audited 7 NAV_ITEMS missing from NAV_GROUPS + 3 truly-orphan components. Decisions:
- **Revived 2 NAV entries**: `platforms` and `comparison` added to NAV_GROUPS Analytics (alongside dashboard + founder-report).
- **Deleted 5 NAV surfaces + cascade**: content, captions, transcriber, scriptAnalyzer, editor — all 5 view files plus transitive orphans (TopPostsTable, UploadZone, src/components/ScriptAnalyzer/ folder with 4 sub-components, src/types/scriptAnalyzer.ts, src/app/api/transcribe/, src/app/api/analyze-script/, 5 dead icons in Icons.tsx, dead db.ts sections: editor_feedback/goals/captions/script_analyses, GoalMetric+GOAL_METRIC_LABELS in types/index.ts).
- **Deleted 3 orphan components**: TopBar (superseded), BestTimeCard, GoalsSection.
- **Preserved**: `goals`, `captions`, `script_analyses`, `editor_feedback` DB tables (per CLAUDE.md — preservation over deletion when future use uncertain).
- **Also removed**: the "Upload Data → Upload CSV" CTA in the sidebar footer (its target tab was content, now deleted; no other CSV upload surface remains).
- **Net**: 24 files changed, +13 / -3,076 lines. Build clean. Final sidebar shape: Analytics (Dashboard, Founder Report, Platforms, Comparison) + Workspace (Posting Schedule, Settings) (`c1e38db`).

## In progress
None. All 22 commits on `main` are local and build-clean. Push is Shane's call.

## Carryover for next session

### Three small UI discrepancies surfaced in end-of-session ground-truth check
- **(a) Dashboard All Time YT shows 138.8K but Platforms shows 138.7K** (ground truth 138,705). Two aggregation paths diverge by ~50-100 views. Likely filter mismatch between `getAllPostsByDate` per-day SUM and `getTotalViewsPerClip` clip-level SUM. Both use `clipKey` but one of them may be filtering differently. Diagnosis: run both functions against the same input, compare row sets.
- **(b) Top Clips by Unique Viewers widget on Dashboard ignores platform filter** — shows YouTube clips when Instagram filter is active. Either (i) apply the platform filter in the widget's data fetch, or (ii) add an explicit "YouTube only" label and accept that the widget is YT-scoped by design (YT is the only platform with unique_viewers data anyway).
- **(c) Avg View Duration UI shows 0:42, ground truth is 133.8s (2:13)** — ~3x divergence. Suggests weighted-vs-simple-average mismatch or YT-only vs all-platforms scoping issue. Low priority since metric isn't load-bearing.

### Still pending from prior carryover (verify status before acting)
- **Founder Report tab + Posting Schedule tab** both got code + ground-truth-level audits today; Founder Report was browser-verified by Claude in Chrome. Posting Schedule has the RLS fix shipped but not browser-verified end-to-end (specifically the post_time edit happy path now that the policy is in place).
- **Posting Schedule Optimizer — NOT YET BUILT.** Planning conversation past; no code. Decision-trigger: when `scheduled_posts` crosses 200 rows per platform (~6 months of posting history, currently at 38 per platform). Then build the statistical analysis + Claude narrative widget on top of PostingScheduleView. Stub for now.

## Known non-issues (don't escalate)
- **YT cron `stat_date` trailing today by 2-3 days is the YouTube Analytics API's intrinsic reporting lag, NOT a cron failure.** Confirmed today (2026-05-18) — IG cron at stat_date 5-18, YT cron at stat_date 5-15. Proof YT cron is running fine: YT shorts row count +8 in 24h, +5 view drift on existing rows in same period. Per `tasks/lessons.md` 2026-05-18.

## Data shape facts (still current)
- **Modal URL backfill holds**: 0 NULL urls across 5,385 total `posts` rows (1,395 YT shorts + 3,721 YT long_form + 269 IG reels). All current writers populate url on every insert.
- **52 distinct shorts** in `posts` under 11 distinct clip_codes (10 mapped + 1 PENDING). Post-D4: visible as 52 individual clip entries in analytical views.
- **16 long-form videos** with `clip_code = the full title` (NOT "MBM016" — that's Shorts-episode framing). 16 distinct clip_codes, NULL clip_details_code, 1:1 with content_id.
- **54+ IG Reels** all currently `clip_code='PENDING'` because no captions match `/MBM\d{3}-CLIP-\d{3}/`. Distinct via `clip_details_code='PENDING-IG-{mediaId}'`. Post-D4, each is a distinct entry.

## Shared helpers in db.ts
- `clipKey({ clip_code?, clip_details_code?, platform })` → string. Per-clip key for any lookup table. Prefers clip_details_code, falls back to clip_code, then "unknown::{platform}".
- `displayClipCode({ clip_code?, clip_details_code? })` → string. User-facing label. Same precedence minus platform suffix.
- `ClipTotals` interface — return shape from `getTotalViewsPerClip` including total_likes/comments/shares/saves.

## Next natural action (in priority order)
1. **Push the 22 unpushed commits** to ship both sessions' work to prod (Shane's call — run `git push origin main` manually).
2. **Browser-verify post-deploy**: (i) IG modal embed renders at 280px not 2px; (ii) modal URL fallback shows YouTube iframe for shorts/long-form; (iii) sidebar has Dashboard + Founder Report + Platforms + Comparison + Posting Schedule + Settings only; (iv) post_time inline edit on Posting Schedule actually persists across refresh.
3. **Investigate discrepancy (a)** — Dashboard vs Platforms All Time YT views diverge by ~50-100. Single-function diff likely.
4. **Investigate discrepancy (b)** — Top Clips by Unique Viewers platform filter. Pick (i) wire filter or (ii) explicit YT-only label.
5. **Investigate discrepancy (c)** — Avg View Duration 3x mismatch. Lowest priority.

## Blocked / open
- **Supabase MCP read-only** (carried from prior session): still blocked from running migrations + DML via `mcp__supabase__apply_migration` / `execute_sql`. Workflow remains manual SQL Editor for writes. Two migration files committed this session were applied by Shane manually (RLS UPDATE policy + posts.url backfill); MCP was used only for the verifying SELECT after.
