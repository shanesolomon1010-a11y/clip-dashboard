# Session Primer

_This file is rewritten by Claude at the end of every session._
_It captures current project state so the next session starts with full context._

## Status
HEAD is `c007bfc` (local; **13 commits unpushed** on `main`). Branch tracking `origin/main` at `29ee77a` (prior session's IG-pipeline shutdown). Single `git push origin main` lands everything.

This session was a comprehensive UI-vs-data audit and 6-round Dashboard fix arc. Started by diagnosing two anomalies from a routine health sweep (YT cron silent failure + diagnostic 34% undercount), then escalated into a full audit of every dashboard surface that displays numbers.

### Commits in this session (oldest → newest, all unpushed)
- `b78f2cd` fix: re-key PENDING posts rows when shorts discovery auto-maps a video
- `0e9e28a` fix: mirror founder-report's PENDING-shorts filter in diagnostics consistency check
- `b131a62` fix: Dashboard A+B+D3+D7 — All Time pagination, kill localStorage, wire platform toggle
- `8619ded` feat: inline platform toggle in DashboardView control row
- `24ebe57` fix: D1+D2+D5 — lifetime engagement metrics across PlatformsView, ComparisonView, ContentView, TopPostsTable
- `ce23a65` fix: paginate getTotalViewsPerClip to defeat 1000-row response cap
- `560a37b` fix: include PENDING clips in getTotalViewsPerClip for analytical views
- `6572803` fix: align getTotalViewsPerClip keying with getLatestPostsPerClip's PENDING fallback
- `92c5a12` fix: use clipKey at totalsMap population sites, not just lookup sites
- `1d25889` fix: D4 — per-clip granularity via clipKey, plus NULL-clip_code shorts rescue
- `5e16e3e` fix: D4 rendering sweep — displayClipCode helper, four-pass keying contract complete
- `c007bfc` fix: Dashboard per-clip unification + Top Clips by Unique Viewers clickability
- (the close commit you're about to write — CLAUDE.md / lessons.md / primer.md updates)

## Just completed (2026-05-17)

### Health sweep + two cascading fixes
- **YT cron silent failure (3 days stale)**: diagnosed as `posts_contentid_platform_statdate_key` collision after shorts auto-discovery auto-mapped previously-PENDING content_ids that already had posts rows under their old `PENDING-{contentId}` clip_details_code. Fix: `rekeyPendingPostsToMappedCode()` runs immediately after `setClipDetailContentIdIfNull()` in `shorts-discovery.ts`, shifts existing posts rows to the new code. Plus a one-shot SQL UPDATE for the 4 already-stuck content_ids (3xEuwroHK48, QW4qkjBxYLM, 7WUxFwyHpIw, HOoXWvKsCHc).
- **Diagnostics consistency check 34% undercount**: `/api/diagnostics`'s recompute query lacked the `.or('clip_details_code.is.null,clip_details_code.not.like.PENDING-%')` filter founder-report applied. One-line fix.

### Six rounds of Dashboard fixes (per the audit)
Original audit identified 7 issues (D1–D7) plus 2 user-flagged (A: All-Time empty; B: localStorage persistence). All addressed:
- **Round 1** (b131a62 + 8619ded): A (paginate getAllPostsByDate), B (kill localStorage layer), D3 (drop hardcoded `'youtube'` platform arg), D7 (wire FilterContext platform toggle into Dashboard memos with carve-out for cross-platform comparison rail), plus an inline platform toggle UI component since TopBar was orphan.
- **Round 2** (24ebe57): D1+D2+D5 — extended `getTotalViewsPerClip` to return `total_likes / total_comments / total_shares / total_saves` alongside views; updated PlatformsView, ComparisonView, ContentView, TopPostsTable to read engagement from the lifetime map instead of latest-day deltas. Fixed YT under-reporting of ~99.9% on likes.
- **Round 2.5** (ce23a65): pagination on getTotalViewsPerClip (1000-row cap was silently dropping ~80% of rows).
- **Round 2.75** (560a37b): include PENDING-clip rows in `getTotalViewsPerClip` so IG (where all 54 Reels are PENDING-keyed because no captions match the MBM###-CLIP-### regex yet) shows real engagement instead of zero.
- **Round 3** (6572803 + 92c5a12): D4 — extracted `clipKey()` helper, aligned producer + lookup + population keying contracts so 54 IG Reels stop collapsing into a single 'PENDING::instagram' bucket. Took two commits because the first missed the per-consumer map *population* sites.
- **Round 4** (1d25889): D4 main — per-clip granularity via `clipKey` now also preferring `clip_details_code` for non-PENDING (was PENDING-only). Long-form (NULL clip_details_code, clip_code = title) unchanged. Bonus: rescued 26 NULL-clip_code shorts via JS-side filtering replacing `.not('clip_code', 'is', null)`.
- **Round 5** (5e16e3e + c007bfc): D4 rendering sweep — added `displayClipCode()` helper for user-facing labels, swept JSX in TopPostsTable / ContentView / PlatformsView / DashboardView. Plus the Dashboard "Top Content" widget got the per-clip unification treatment (its own four bucketing memos all switched to clipKey). Plus wired onClick on "Top Clips by Unique Viewers" rows (issue B from final verification).

### D6 closed-as-by-design
PENDING-row treatment is now intentionally inconsistent across surfaces: **founder-report excludes PENDING** (founder-facing semantics — un-curated content shouldn't reach stakeholders), **analytical views include PENDING** (operational semantics — see real platform performance during the transient PENDING→mapped window). Diagnostics mirrors founder-report's filter. Both decisions deliberate.

### Posting Schedule audit + RLS UPDATE policy fix
scheduled_posts had RLS with INSERT/READ/DELETE policies but no UPDATE — silent no-op on post_time edits (same pattern that hit IG cron on 2026-05-15). Fixed via SQL Editor + migration file. Calendar CRUD is otherwise clean: no aggregation drift, no pagination concerns at 76 rows, no .not(is, null) patterns, no D4 keying issues.

### posts.url NULL backfill + modal video_url fallback
Two-part fix. First half: YT shorts had 208 historical rows with NULL posts.url from pre-fa30b23 writer paths; backfilled deterministically from content_id (data hygiene, correct fix going forward — all current writers populate url on every insert). Second half: separate-but-related — VideoPreviewModal was reading clip_details.video_url (86.7% NULL across clip_details table), not posts.url. The `post` prop was already passed through VideoModalContext but never destructured at the modal call site. Wired the dead prop, added clipDetail?.video_url ?? post?.url fallback. MP4 preview clips (the 17 manually-uploaded MBM015-CLIP-* headline banners in Supabase Storage) still take precedence; YouTube/IG URLs fill in the rest. 20 PENDING-IG-only clips continue showing the placeholder by design.

## In progress
None blocking. All 13 commits on `main` are local and build-clean. Push is Shane's call.

## Carryover for next session
- **Founder Report tab + Posting Schedule tab not yet verified in browser.** Claude in Chrome only ran TEST 1–4 on Dashboard + PlatformsView + ComparisonView + ContentView. These two tabs got code-level review during the audit but no live click-through.
- **Modal "Video URL not set yet" empty body.** Looks like `posts.url` is NULL for most rows — data ingestion gap, not rendering. Separate investigation; could be missing in YT sync's metadata pass, IG sync's permalink mapping, or a per-row data quality issue. Probe `SELECT COUNT(*) FROM posts WHERE url IS NULL GROUP BY platform, content_type` first.
- **Top Content widget design call now closed.** Round 5 made it per-clip; prior rounds had deferred this as an "intentional design decision." Shane decided this round.
- **Posting Schedule Optimizer — NOT YET BUILT.** Planning conversation past; no code. Decision-trigger: when `scheduled_posts` crosses 200 rows per platform (~6 months of posting history, currently at 38). Then build the statistical analysis + Claude narrative widget on top of PostingScheduleView. Stub for now.

## Orphan inventory (flagged for revive-or-delete)
- **Components** mounted nowhere — `TopBar.tsx` (date pills + platform select, replaced inline this session), `BestTimeCard.tsx` (day-of-week eng rate bucket), `GoalsSection.tsx` (per-platform goal-vs-actual). Need decision: delete or revive.
- **Views** only reachable via `?tab=` URL parameter (NOT in `Sidebar.tsx`'s `NAV_ITEMS`) — `PlatformsView`, `ComparisonView`, `ContentView`. Major surfaces that fixed bugs landed on, but invisible from the sidebar. Discoverability gap.

## Data shape facts captured this session
- **26 NULL-clip_code shorts** previously silently excluded from PlatformsView/ComparisonView/ContentView totals (the `.not('clip_code', 'is', null)` filter). After 1d25889, they're rescued — they have valid clip_details_codes that naturally consolidate with their mapped counterparts.
- **52 distinct shorts** (1,387 daily rows total) live in posts under 11 distinct clip_codes (10 mapped + 1 PENDING). Pre-D4: visible as ~10 episode buckets. Post-D4: visible as 52 individual clip entries.
- **16 long-form videos** with `clip_code = the full title` (NOT "MBM016" — that's Shorts-episode framing). 16 distinct clip_codes, NULL clip_details_code, 1:1 with content_id. CLAUDE.md correction applied this session.
- **54 IG Reels** all currently `clip_code='PENDING'` because no captions match `/MBM\d{3}-CLIP-\d{3}/`. Distinct via `clip_details_code='PENDING-IG-{mediaId}'`. Post-D4, each is a distinct entry.

## New shared helpers in db.ts (Round 3 + Round 5)
- `clipKey({ clip_code?, clip_details_code?, platform })` → string. Per-clip key for any lookup table. Prefers clip_details_code, falls back to clip_code, then "unknown::{platform}".
- `displayClipCode({ clip_code?, clip_details_code? })` → string. User-facing label. Same precedence minus platform suffix.
- `ClipTotals` interface — extended return shape from `getTotalViewsPerClip` including total_likes/comments/shares/saves.

## Next natural action (in priority order)
1. **Push the 13 unpushed commits** to ship Round 5 to prod.
2. **Verify** Top Content widget shows per-clip labels (MBM015-CLIP-XXX, etc.) and Top Clips by Unique Viewers rows are now clickable.
3. **Audit Founder Report tab + Posting Schedule tab** in browser if those numbers matter for the next decision.
4. **Investigate `posts.url` ingestion gap** (modal "Video URL not set yet"). Single SQL probe surfaces the scale.
5. **Orphan cleanup pass** — decide revive-or-delete for TopBar / BestTimeCard / GoalsSection. If reviving the views, add them to `Sidebar.tsx`'s `NAV_ITEMS`.

## Blocked / open
- **Supabase MCP read-only** (carried from prior session): still blocked from running migrations + DML via `mcp__supabase__apply_migration` / `execute_sql`. Workflow remains manual SQL Editor for writes. Open question whether to enable write mode — answered defensively this session by running the DB writes (PENDING posts re-key) through SQL Editor, not MCP.
