# Deletion Plan — Library, Insights, Analytics tabs

Phase 1 inventory. **No files have been deleted yet.** This document classifies every file or code path tied to the three tabs and recommends what to do in Phase 2.

## Legend

- **EXCLUSIVE** — used only by Library/Insights/Analytics. Safe to delete the whole file.
- **SHARED** — also used by tabs that survive (Dashboard, Content, Posting Schedule, Founder Report, Platforms, Comparison, Captions, Script Analyzer, Transcriber, Editor, Social Copy, Settings). The file must NOT be deleted; only the imports/usages from the three deleted views are removed.
- **AMBIGUOUS** — needs human review before deciding.

## What "the three tabs" actually consume

The user-facing entry points being removed are:

- **Analytics tab** → `AnalyticsView` (rendered when `activeNav === 'analytics'` in `src/app/page.tsx:112`)
- **Insights tab** → `InsightsView` (rendered when `activeNav === 'insights'` in `src/app/page.tsx:118`)
- **Library tab** → `LibraryView` (rendered when `activeNav === 'library'` in `src/app/page.tsx:122`)

Note: `src/components/views/AIInsightsView.tsx` exists in the repo but is **not imported anywhere in `page.tsx`** — it is dead code, unrelated to the live `InsightsView`. Two `localStorage` keys in `page.tsx:63-64` (`clip_studio_ai_insights_v1`, `clip_studio_anthropic_key`) are remnants of `AIInsightsView`, not the live `InsightsView`. Flagged as **AMBIGUOUS / out-of-scope** — not deleting it as part of these three tabs unless you say so.

---

## Inventory

### Tab components (top-level views being deleted)

| File | Classification | Where else used | Recommended action |
|---|---|---|---|
| `src/components/views/AnalyticsView.tsx` | EXCLUSIVE | Only `src/app/page.tsx` (the import + the render condition) | **Delete file.** Remove import on line 10 and render condition on line 112 of `page.tsx`. |
| `src/components/views/InsightsView.tsx` | EXCLUSIVE | Only `src/app/page.tsx` (the import + the render condition) | **Delete file.** Remove import on line 12 and render condition on line 118 of `page.tsx`. |
| `src/components/views/LibraryView.tsx` | EXCLUSIVE | Only `src/app/page.tsx` (the import + the render condition) | **Delete file.** Remove import on line 20 and render condition on line 122 of `page.tsx`. |

### Sub-components used only by these views

| File | Classification | Where else used | Recommended action |
|---|---|---|---|
| `src/components/views/ClipGrid.tsx` | EXCLUSIVE | Only `LibraryView` (verified via grep — no other importer) | **Delete file.** |
| `src/components/views/ClipReviewView.tsx` | EXCLUSIVE | Only `ClipGrid` (verified via grep — no other importer) | **Delete file.** |
| `src/components/DemographicsNotice.tsx` | EXCLUSIVE | Only `AnalyticsView` (verified via grep — no other importer) | **Delete file.** |
| `src/components/charts/BreakdownCharts.tsx` | EXCLUSIVE | Only `AnalyticsView` (all 5 named exports — `TrafficSourcesChart`, `DeviceDistributionChart`, `SubscriberStatusChart`, `CountriesChart`, `PlaybackLocationChart`) | **Delete file.** Also delete the now-empty `src/components/charts/` directory. |

### Lib modules used only by these views

| File | Classification | Where else used | Recommended action |
|---|---|---|---|
| `src/lib/insights-db.ts` | EXCLUSIVE | `InsightsView`, `src/app/api/insights/analyze/route.ts`, `src/app/api/insights/weekly-report/route.ts` — all three are scheduled for deletion | **Delete file.** |
| `src/lib/insights-helpers.ts` | EXCLUSIVE | `src/app/api/insights/weekly-report/route.ts` only | **Delete file.** |
| `src/lib/schedule-analyzer.ts` | EXCLUSIVE | `src/app/api/insights/schedule-optimizer/route.ts` only | **Delete file.** |
| `src/lib/breakdowns-db.ts` | EXCLUSIVE | `BreakdownCharts.tsx` and `DemographicsNotice.tsx` — both being deleted | **Delete file.** |
| `src/lib/db.ts` | SHARED | Used by virtually every view | **Keep file**, remove nothing. The four functions called by deleted views (`getAllPostsByDate`, `getTotalViewsPerClip`, `getLatestPostsPerClip`, `fetchAllClipDetails`) are also called by surviving views (DashboardView, ContentView, PlatformsView, ComparisonView, PostingScheduleView, SettingsView, page.tsx). No exports should be removed from this file. |
| `src/lib/utils.ts` (`formatNum`) | SHARED | Used by many views | **Keep.** |
| `src/lib/supabase.ts` | SHARED | Used by many views | **Keep.** |
| `src/types/index.ts` (`UnifiedPost`, etc.) | SHARED | Used by virtually every view | **Keep.** No type fields are exclusively used by the deleted views in a way that warrants removal — the type is the data model for posts everywhere. |

### API routes

| File / dir | Classification | Where else used | Recommended action |
|---|---|---|---|
| `src/app/api/insights/analyze/route.ts` | EXCLUSIVE | Called only by `InsightsView` (`fetch('/api/insights/analyze', …)`) | **Delete file.** |
| `src/app/api/insights/weekly-report/route.ts` | EXCLUSIVE | Called by `InsightsView` and by the cron in `vercel.json` (Monday 14:00). Cron exists only to feed `InsightsView`. | **Delete file.** Also remove the cron entry — see "Cron / scheduled tasks" below. |
| `src/app/api/insights/schedule-optimizer/route.ts` | EXCLUSIVE | Called only by `InsightsView` (`fetch('/api/insights/schedule-optimizer', …)`) | **Delete file.** |
| `src/app/api/insights/route.ts` | **AMBIGUOUS** | Zero callers anywhere in `src/`. It is a bare POST endpoint that uses Gemini + Claude Opus 4.5 to produce a structured JSON insight report — appears to be a legacy/orphan endpoint that pre-dates the `analyze`/`weekly-report` split. May be invoked externally (curl, scripts, or removed UI). | **Human review.** If nothing external calls it, delete with the rest of the `src/app/api/insights/` directory. Otherwise keep it standalone (and the `src/app/api/insights/` directory survives just for this route). |
| `src/app/api/library/scan/route.ts` | EXCLUSIVE | Called only by `ClipReviewView` (`fetch('/api/library/scan', …)` at line 188), which is being deleted | **Delete file.** |
| `src/app/api/library/sync-urls/route.ts` | **SHARED** | Called by `SettingsView` (`fetch('/api/library/sync-urls', …)` at line 99) | **Keep file.** |
| `src/app/api/library/set-video-url/route.ts` | **AMBIGUOUS** | Zero callers anywhere in `src/`. Lives under the same `/api/library/` namespace but is not invoked by `LibraryView` or its sub-components. May be called by an external tool/script. | **Human review.** If nothing external calls it, delete. |
| `src/app/api/video-proxy/` (whole route) | **SHARED** | Called by `LibraryView`, `ClipGrid` (both deleted) AND `src/components/VideoPreviewModal.tsx` (line 109). `VideoPreviewModal` is used by the shared `VideoModalContext`, which is used by Dashboard, Content, Analytics (deleted), Platforms, PostingSchedule. | **Keep route.** |

The `src/app/api/insights/` directory becomes effectively empty once `analyze/`, `weekly-report/`, `schedule-optimizer/` are removed — the only thing left is the ambiguous bare `route.ts` (item above). If you decide that one is also dead, delete the whole `src/app/api/insights/` directory.

The `src/app/api/library/` directory: `scan/` deletes, `sync-urls/` stays, `set-video-url/` is ambiguous. Directory survives.

### Cron jobs / scheduled tasks (`vercel.json`)

| Entry | Classification | Recommended action |
|---|---|---|
| Cron `/api/cron/youtube-sync` (daily 14:00) | SHARED — feeds the entire posts dataset, not Insights/Analytics/Library specifically | **Keep.** |
| Cron `/api/cron/youtube-sync-longform` (daily 14:30) | SHARED — same as above | **Keep.** |
| Cron `/api/insights/weekly-report` (Monday 14:00) | EXCLUSIVE — exists only to populate the weekly_reports table that `InsightsView` reads | **Remove this cron entry from `vercel.json`.** The route file itself is deleted in the API row above. |
| `functions` block entries for `cron/youtube-sync` and `cron/youtube-sync-longform` | SHARED | **Keep.** |

### Navigation / shell (must edit, not delete)

| File | Classification | Recommended action |
|---|---|---|
| `src/app/page.tsx` | SHARED | **Edit only.** Remove three view imports (lines 10, 12, 20). Remove `'analytics'`, `'insights'`, `'library'` from the `VALID_NAV_SECTIONS` set (line 29). Remove the three `{activeNav === '…' && <…View …/>}` lines (112, 118, 122). The `localStorage.removeItem('clip_studio_ai_insights_v1')` and `clip_studio_anthropic_key` lines (63–64) belong to the dead `AIInsightsView` — flagged AMBIGUOUS, decide separately. |
| `src/components/Sidebar.tsx` | SHARED | **Edit only.** Remove `'analytics'`, `'insights'`, `'library'` from the `NavSection` union (line 5). Remove `IconAnalytics` and `IconLibrary` from the imports on line 3 (keep `IconSparkles` — still used by Captions). Delete the three matching entries from `NAV_ITEMS` (lines 11, 16, 20). In `NAV_GROUPS`: drop `'analytics'` from the "Analytics" group and drop `'insights'` and `'library'` from the "Workspace" group (lines 25–26). |
| `src/components/Icons.tsx` | SHARED | **Edit only.** After Sidebar is updated, the named exports `IconAnalytics` and `IconLibrary` become unused (verified — no other consumer in `src/`). Either remove those two exports, or leave them — they are inline SVG components with no runtime cost if unreferenced. Recommend removing for tidiness. |

### Documentation / project memory

| File | Classification | Recommended action |
|---|---|---|
| `CLAUDE.md` (project doc) | SHARED | **Edit only.** Remove the `AnalyticsView` row from the views table (line 76) and the entire "AI Insights" section (line 78 and lines 81–86 — note this section is about `AIInsightsView`, the dead one). |
| `memory/project.md`, `memory/decisions.md`, `memory/preferences.md`, `memory/primer.md`, `memory/cloudmemory.md` | SHARED | **Edit if needed in Phase 2.** Update `primer.md` at end of Phase 2 to reflect the deletion. The other memory files only need updates if they describe these tabs explicitly (verify during Phase 2). |
| `docs/analytics-spec/analytics-spec.md` | EXCLUSIVE (visual spec for the deleted Analytics tab) | **Keep as historical reference** — it was just written specifically as a pre-deletion record. Do not delete. |

---

## Phase 2 deletion summary (preview only — do not execute)

When you're ready to run Phase 2, the deletion set is:

**Delete files (8 + 1 ambiguous + 1 ambiguous):**
1. `src/components/views/AnalyticsView.tsx`
2. `src/components/views/InsightsView.tsx`
3. `src/components/views/LibraryView.tsx`
4. `src/components/views/ClipGrid.tsx`
5. `src/components/views/ClipReviewView.tsx`
6. `src/components/DemographicsNotice.tsx`
7. `src/components/charts/BreakdownCharts.tsx` (and remove the now-empty `src/components/charts/` directory)
8. `src/lib/insights-db.ts`
9. `src/lib/insights-helpers.ts`
10. `src/lib/schedule-analyzer.ts`
11. `src/lib/breakdowns-db.ts`
12. `src/app/api/insights/analyze/route.ts`
13. `src/app/api/insights/weekly-report/route.ts`
14. `src/app/api/insights/schedule-optimizer/route.ts`
15. `src/app/api/library/scan/route.ts`

Pending your review:
- `src/app/api/insights/route.ts` (AMBIGUOUS — orphan POST endpoint)
- `src/app/api/library/set-video-url/route.ts` (AMBIGUOUS — orphan POST endpoint)
- `src/components/views/AIInsightsView.tsx` + the two `localStorage` lines in `page.tsx:63-64` (AMBIGUOUS — dead code, but unrelated to the live `InsightsView`)

**Edit only (do not delete):**
- `src/app/page.tsx` — remove imports, render conditions, and `VALID_NAV_SECTIONS` entries
- `src/components/Sidebar.tsx` — remove nav entries, icons imports, group memberships
- `src/components/Icons.tsx` — optionally remove `IconAnalytics`, `IconLibrary` exports
- `vercel.json` — remove the `/api/insights/weekly-report` cron entry
- `CLAUDE.md` — drop AnalyticsView/AIInsightsView documentation lines
- `memory/primer.md` — update at end of Phase 2

**Questions for you before Phase 2:**

1. Is `src/app/api/insights/route.ts` called by anything outside this repo (a script, a scheduled webhook, a curl recipe in your notes)? If no, delete it.
2. Is `src/app/api/library/set-video-url/route.ts` called by anything outside this repo? If no, delete it.
3. Should `src/components/views/AIInsightsView.tsx` be removed at the same time? It's dead code already (not imported anywhere) and removing it cleans up the two orphan `localStorage.removeItem` calls in `page.tsx`. It would also make `fetchInsightHistory`, `saveInsight`, `clearInsightHistory` in `src/lib/db.ts` unused — they could be removed from `db.ts` too.
4. Any opinion on whether to remove `IconAnalytics` and `IconLibrary` exports from `Icons.tsx`, or leave the SVG components as latent assets?
