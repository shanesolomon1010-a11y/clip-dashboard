# Session Primer

_This file is rewritten by Claude at the end of every session._
_It captures current project state so the next session starts with full context._

## Status
Library, Insights, and Analytics tabs deleted from the dashboard along with all backing code. Data-layer audit identified the YouTube Merger CSV path as the root cause of the "8K one day, 2.5K the next" volatility bug; root cause and downstream Dashboard read-side bugs fixed in a second wave. Build passes.

## Just completed (2026-05-01, data-layer fix wave)
- **Deleted YouTubeMergerTab** (`src/components/YouTubeMergerTab.tsx`) and its Settings tab entry — the Merger flow stamped lifetime YouTube Studio totals into the daily-delta `views` column, which was the smoking gun for the views volatility identified in `docs/data-layer-audit.md` Section 3 #1.
- **Removed the `total_views` fallback** in `normalizers.normalizeYouTube` (`src/lib/normalizers.ts`) — the silent `views || Views || total_views` substitution that let lifetime cumulative numbers reach the daily-delta `views` column.
- **Removed `total_views`** from the `EXPECTED_COLUMNS.youtube` CSV column hint in `src/components/UploadZone.tsx` so the UI no longer advertises a column the normalizer ignores.
- **Dashboard read-side fixes** (`src/components/views/DashboardView.tsx`):
  - **Platform Breakdown** (right rail) now SUMs `dateFilteredDailyPosts` grouped by platform — previously summed `getLatestPostsPerClip` output, systematically under-reporting by ~30× for a 30d window (audit Section 3 #2).
  - **Impression CTR** is now window-correct: SUM(impressions) and SUM(views) over `dateFilteredDailyPosts`, divided once at the end — previously read back-filled latest-day-only impressions (audit Section 3 #3).
  - **Total Posts** (right rail) now counts distinct `(clip_code, platform)` keys present in the date window, not `filteredPosts.length` — clips whose latest snapshot fell outside the window were silently disappearing (audit Section 3 #5).
- **Removed dead exports from `src/lib/db.ts`**: `getPosts`, `fetchAllPosts`, `fetchClipStats`, plus the orphan `ClipStats` interface — zero callers in `src/`, and `fetchClipStats` was particularly dangerous (name implied totals, body returned latest-day-per-platform).

## Just completed (2026-05-01, earlier — tab deletion wave)
- **Pre-deletion visual spec** captured at `docs/analytics-spec/analytics-spec.md` and committed (`221ead1`) before any code was removed — covers all 7 charts in the Analytics tab, plus the date filter / platform toggle / metric selector controls.
- **Phase 1 inventory** written to `docs/deletion-plan.md` — classified every file/route/cron tied to the three tabs as EXCLUSIVE, SHARED, or AMBIGUOUS, with explicit "where else it's used" justification.
- **Phase 2 deletion** executed:
  - Deleted 18 files: `AnalyticsView`, `InsightsView`, `LibraryView`, `AIInsightsView` (dead code), `ClipGrid`, `ClipReviewView`, `DemographicsNotice`, `BreakdownCharts`, `insights-db`, `insights-helpers`, `schedule-analyzer`, `breakdowns-db`, and 6 API routes under `src/app/api/insights/` and `src/app/api/library/`.
  - Removed empty directories: `src/components/charts/`, `src/app/api/insights/` (and its 3 sub-routes), `src/app/api/library/scan/`, `src/app/api/library/set-video-url/`. `src/app/api/library/sync-urls/` survives — still called by `SettingsView`.
  - Edited `src/app/page.tsx` (removed 3 view imports, 3 nav constants, 3 render conditions, 2 `localStorage.removeItem` calls), `src/components/Sidebar.tsx` (removed 3 entries from `NavSection` / `NAV_ITEMS` / `NAV_GROUPS` and the `IconAnalytics` / `IconLibrary` imports), `src/components/Icons.tsx` (removed `IconAnalytics` + `IconLibrary` exports), `src/lib/db.ts` (removed `fetchInsightHistory`, `saveInsight`, `clearInsightHistory` + `InsightRow` interface — orphan after `AIInsightsView` removal).
  - Removed the `/api/insights/weekly-report` cron entry from `vercel.json`. The two `youtube-sync` crons remain.
  - Updated `CLAUDE.md` — dropped the `AnalyticsView` row from the views table and the entire AI Insights section.

## In progress
- Nothing.

## Blocked / next
- **Engine test gate**: the clip-finder feature itself (API endpoint + UI) is gated on a separate engine test. Don't add wiring until that test ships.
- **Pre-existing**: studio_snapshots migration still not applied to Supabase (from prior session).
- **Pre-existing**: `scripts/youtube-studio-sync.test.ts:163` asserts `VIDEO_MAP has exactly 19 entries` — actual is 30, harmless but stale.
- **Possible follow-ups from the deletion**: the Supabase tables that fed the deleted UIs (`weekly_reports`, `schedule_recommendations`, `performance_analyses`, `breakdowns_daily`/equivalents, `insights`) are now write/read-orphans. Decide whether to drop them on the database side. Not done as part of this deletion since it touches shared infrastructure.
- **Remaining items from `docs/data-layer-audit.md`** still open: #4 (Stats Grid Total Impressions — depends on confirming which writer touches `impressions`), #6 (Top Content fallback labeling), #7 already handled (`fetchClipStats` removed), #9 (studio_snapshots semantics), 6.7 (write-side guard in `upsertPosts`), 6.8 (rename `getLatestPostsPerClip` → `getLatestSnapshotPerClip` + JSDoc warning).
