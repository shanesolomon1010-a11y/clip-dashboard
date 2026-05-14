# Session Primer

_This file is rewritten by Claude at the end of every session._
_It captures current project state so the next session starts with full context._

## Status
Local HEAD is `bd13277` (chore: previous session shutdown — picker dedup + Dashboard toggle shipped, plus CLAUDE.md / lessons.md / primer.md updates). `bd13277` is **1 commit ahead of `origin/main`** which sits at `664e102`. Phase 1 + Phase 2 code is on origin (Shane pushed manually); only the previous shutdown commit is unpushed. Dashboard filter system is the only meaningful UI surface that changed last session: the date-range picker calendar is now a single shared component, has month + year dropdowns, opens at the picked range's month, closes on click-outside in both call sites, and a new content-type toggle (All | Long-form | Shorts) sits next to it on the Dashboard with filter state synced to URL + localStorage.

## Just completed (2026-05-12 → 2026-05-13, picker dedup + Dashboard toggle)

### Phase 1 — `b82b07f` refactor: extract shared DateRangeCalendar, fix picker UX
- New `src/components/DateRangeCalendar.tsx` — single source of truth for the calendar popover. Same prop signature as before plus an optional `containerRef` so parents pass their wrapper div and the shared component owns the `mousedown` click-outside listener.
- Seeds `viewYear`/`viewMonth` from `initialStart` (fallback today) so reopening jumps back to the picked range's month instead of always landing on today.
- Adds month + year `<select>` dropdowns in the calendar header for fast multi-year navigation. Year range: `2023..currentYear+1` (≈ `MBM_ERA_START` through next year).
- `DateFilterBar.tsx` — deleted inline calendar (~140 lines) and local `mousedown` `useEffect`; imports shared component. `useDateFilter` signature unchanged in Phase 1.
- `FounderReportView.tsx` — deleted inline calendar copy; `calendarRef` (previously dead since no listener was attached) is now wired as `containerRef`, so click-outside works there too. Persistence extended: new `founder_report_filter_custom_range` localStorage key holds `{start,end}`; `readStoredFilterPreset` now honors `'custom'` only if a valid stored range is also present (else falls back to `'30d'`).

### Phase 2 — `664e102` feat: dashboard content-type toggle + URL state for filters
- New `src/components/ContentTypeToggle.tsx` — 3-segment pill (`All` | `Long-form` | `Shorts`), same visual styling as `DateFilterBar`. `data-testid="content-type-toggle"` on root, `data-testid="content-type-{value}"` per button.
- `DateFilterBar.tsx` — `useDateFilter` extended with optional `defaultCustomRange` (2nd arg, defaults `null`). Backward-compatible; lets a caller hydrate both preset and custom range in one render, avoiding double-fetch on mount.
- `DashboardView.tsx`:
  - `readInitialDashboardState` reads URL params (`?range`, `?start`, `?end`, `?contentType`) first, then falls back to localStorage (`dashboard_filter_preset` / `dashboard_filter_custom_range` / `dashboard_content_type`), then defaults. If `preset === 'custom'` with no range, falls back to `'30d'`.
  - URL sync `useEffect` writes state → URL (`router.replace`, `scroll: false`) on every change of `[filterPreset, customRange, contentType]`. `firstSyncRef` skips the very first write so the just-read state doesn't thrash history. localStorage always writes.
  - Content-type filter applied to `filteredPosts`, `dateFilteredDailyPosts`, `peakByClip`, `topUniqueViewers`. Decision: `'all'` keeps everything (including undefined `content_type`) to preserve baseline totals; `'long_form'` / `'short'` use strict equality. `peakByClip` respects the toggle so peak labels match the active view.
  - Toggle rendered next to `DateFilterBar` in a `flex items-center gap-3 flex-wrap` row.

### Sidequest — standalone whisper-transcribe tool
Not connected to clip-dashboard. Built at `~/whisper-transcribe` (separate git repo, commit `55404da`, local only). Watches `input/` for `.mp4/.mov/.mp3/.wav/.m4a`, transcribes via mlx-whisper large-v3, writes `.txt` to `output/`, moves source to `processed/`. Smoke-tested end-to-end with a `say`-generated wav — transcript verbatim accurate. One-command start via `./watch.sh` (auto-creates venv + installs deps on first run). README in the repo. Not relevant to clip-dashboard ongoing work.

## Recent commits (top down)
- `bd13277` chore: session shutdown — picker dedup + Dashboard toggle shipped _(LOCAL ONLY)_
- `664e102` feat: dashboard content-type toggle + URL state for filters _(on origin)_
- `b82b07f` refactor: extract shared DateRangeCalendar, fix picker UX _(on origin)_
- `3bf3f3e` fix: normalize /api/auth/url env vars to YOUTUBE_* prefix
- `e3d82fe` feat: source YouTube auth from DB + upgrade OAuth scope to force-ssl
- `b4e2644` chore: append commit log entry to cloudmemory
- `935006b` data: register 7 missing shorts in both VIDEO_MAPs
- `7e342fc` chore: correct primer push state (origin already at c693061)
- `f619021` chore: session shutdown — data accuracy + long-form gap diagnosis

## In progress
- Nothing.

## Blocked / next
- **Phase 2 prod verification** — Shane was going to verify on prod after the manual push. Verification checklist (from the post-build report):
  - Toggle each content type, confirm all 8 stat cards + Top Content + Channel Summary + Platforms + Top Clips by Unique Viewers update.
  - Sanity: `Long-form` Total Views + `Shorts` Total Views ≤ `All` Total Views for the same range.
  - Set `7d` + `Shorts`, confirm URL becomes `?tab=dashboard&range=7d&contentType=short`. Reload → state rehydrates.
  - Set custom range + `Long-form`, copy URL, open in new tab → same state loads.
  - Navigate away and back → filters persist (URL + localStorage).
  - Founder Report does NOT show the content-type toggle (unchanged).
  - Peak labels in Top Content respect the toggle — `Shorts` shows peak short days, not lifetime peaks across both.
- **"Two pills highlighted" claim (unresolved)** — Shane reported the Dashboard had two preset pills highlighted at once after applying a custom range, and asked me to "copy Founder Report's deselection logic over." A diff confirmed the two preset-pill blocks in `DateFilterBar.tsx` and `FounderReportView.tsx` are byte-equivalent — there is literally nothing to copy. Lesson recorded in `tasks/lessons.md` 2026-05-12. Most likely cause: stale CDN bundle on Vercel from before the Phase 1 push reached prod. If still observed after a hard refresh, ask Shane for a screenshot — likely a different element (focus ring? dropdown chevron?) being read as a second highlight.
- **Bug A — "38K shorts views" UI vs 10,915 API (closed as not-a-code-bug)** — `FounderReportView` renders `data.shortsViews` verbatim via `.toLocaleString()`, no formatter and no label swap. DB sum agrees with API (10,915 across 1,351 rows). Shorts data in `posts` only goes back to 2026-03-15 — the 38K Mateo saw was likely from a pre-truncate snapshot or stale browser cache. Action: none in code. If Shane wants to recover historical shorts data, that's a separate data-layer task.
- **Pagination without ordering in `/api/founder-report/route.ts`** (lines 60-76, 86-107) — Supabase pagination without `.order(...)` can return duplicate/missing rows across pages. Currently works because the result set fits in one page (~5k rows), but the pattern is fragile. Worth fixing eventually — add `.order('id')` or similar stable column before `.range(...)`. Not urgent.
- **Possible follow-up: extend content-type filter to other views** — `ContentView`, `PlatformsView`, `ComparisonView` currently show lifetime totals across all content types. Shane explicitly scoped this round to Dashboard only, so no action — but the `ContentTypeToggle` component is reusable if/when he wants to extend.
- **Pre-existing carryover (unchanged this session):**
  - Manual `sudo pmset repeat cancel` still pending (cosmetic, scraper LaunchAgent is off).
  - `Q8iJ2gBujpY` long-form video status still unresolved (need OAuth in local `.env.local` to disambiguate private vs deleted).
  - Open `docs/data-layer-audit.md` items #4, #6, #9, 6.7, 6.8.
  - Vercel cron reliability — Hobby plan crons are best-effort; consider Pro or external scheduler if long-form freshness becomes critical.
  - `studio_snapshots` migration not yet applied.
  - `scripts/youtube-studio-sync.test.ts:163` asserts VIDEO_MAP=19, actual=30 (harmless, stale).
  - Engine test gate (clip-finder API + UI) still gated.

## Footnotes for next session
- **`useDateFilter` signature note**: now accepts an optional `defaultCustomRange: CustomRange | null` as its second argument. Existing single-arg callers are unaffected. If you ever add a third view that uses the date picker, you can hydrate both preset and range from a single source via the two-arg form.
- **URL-state pattern reference**: `DashboardView.tsx` is the working example for `?range=&start=&end=&contentType=` syncing on a single-route SPA. Shape and validation are minimal (regex on YMD, type guards on enums). If you extend to other views, factor out `readInitialDashboardState` + the sync `useEffect` into a hook rather than duplicating.
- **Calendar widget reuse**: `DateRangeCalendar` is a standalone component. The `containerRef` prop is optional — passing it enables click-outside relative to the parent's wrapper (which contains both the trigger and the popover). Omitting it disables click-outside entirely.
- **Memory additions this session**: one new CLAUDE.md "Don'ts" entry about `git push` deny-rule behavior, and one new `tasks/lessons.md` entry (2026-05-12) about diffing before acting on "copy from sibling" requests.
