# CLAUDE.md

## Session memory
At the start of every session, read all three files in `/memory/`:
- `memory/project.md` — project identity, env vars, Supabase tables, key files
- `memory/decisions.md` — architectural decisions and their rationale
- `memory/preferences.md` — UI patterns and code style rules in use

After making significant changes (new feature, schema change, architectural shift, format change), update the relevant memory file to keep it current.

---

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server (localhost:3000)
npm run build    # Production build + type-check + lint (must pass before committing)
npm run lint     # ESLint via next lint
npx tsc --noEmit # Type-check only, no emit
```

There are no tests. The build pipeline (`npm run build`) runs ESLint and TypeScript as part of the Next.js build — treat build failures as equivalent to test failures.

## Architecture

This is a **Next.js 14 App Router** project (single-page app in practice). All routes live under `src/app/`, but the entire UI is rendered from one route: `src/app/page.tsx`.

### State & layout shell (`src/app/page.tsx`)

The root component owns all global state:
- `posts: UnifiedPost[]` — the full dataset, initialized from `SAMPLE_POSTS`, merged on CSV upload
- `activeNav: NavSection` — drives which view is rendered

It renders a fixed layout: `<Sidebar>` + `<TopBar>` + one `<*View>` at a time. No routing occurs; navigation is purely state-driven.

### Data model (`src/types/index.ts`)

`UnifiedPost` is the single normalized shape all platforms converge to. `Platform` is the union type `'tiktok' | 'instagram' | 'linkedin' | 'twitter' | 'youtube'`. `PLATFORM_COLORS` and `PLATFORM_LABELS` are the canonical maps — use these everywhere instead of hardcoding strings or hex values.

### CSV ingestion (`src/lib/normalizers.ts`)

`parseCSV(file, onComplete, onError)` is the public entry point. Internally it:
1. Uses PapaParse with `header: true`
2. Calls `detectPlatform(headers)` which identifies the platform from column name signatures (case-sensitive)
3. Runs the appropriate per-platform normalizer that maps raw column names → `UnifiedPost` fields
4. Assigns IDs and calls `onComplete`

When adding a new platform: add a normalizer function, extend `detectPlatform`, add to the switch, and extend the `Platform` type + `PLATFORM_COLORS`/`PLATFORM_LABELS`.

### Views (`src/components/views/`)

Each nav section is a self-contained view component that receives `posts: UnifiedPost[]` (and `onUpload` for Content). Views do their own filtering/aggregation with `useMemo` — they do not share filter state with each other or with the shell.

| View | Key responsibility |
|---|---|
| `DashboardView` | Summary cards, 7d/30d comparison, top content list, right rail with platform breakdown + tips |
| `ContentView` | Recent post cards, full table, CSV upload zone |
| `AnalyticsView` | Date range + platform filter controls, stat strip, charts, engagement table |
| `PlatformsView` | Per-platform breakdown cards with best post + export hint |
| `AIInsightsView` | API key management, Anthropic API call, 4-card insights display, follow-up chat |
| `SettingsView` | Static UI only, no data mutations |

### AI Insights (`src/components/views/AIInsightsView.tsx`)

- API key is stored in `localStorage` under key `clip_studio_anthropic_key`
- Calls `https://api.anthropic.com/v1/messages` directly via `fetch` (no SDK) with model `claude-sonnet-4-20250514`
- Requires header `anthropic-dangerous-direct-browser-access: true` for browser-to-API calls
- The initial analysis requests JSON back with keys `{whatsWorking, whatToImprove, nextClips, bestTimes}`; follow-up messages are plain text chat
- `apiMessages` holds the full conversation history (including the initial data-dump user message) passed to every API call; `chatLog` holds only the display-facing follow-ups

### Charts (`src/components/ViewsLineChart.tsx`, `PlatformBarChart.tsx`)

Built with Recharts. Both accept `posts: UnifiedPost[]` and `activePlatforms: Platform[]`. The line chart groups posts by date × platform and sums views. Custom tooltip components are typed explicitly (no `any`) to satisfy ESLint.

### Icons (`src/components/Icons.tsx`)

All icons are inline SVG functional components. Add new icons here rather than installing an icon library.

## Key constraints

- ESLint rule `@typescript-eslint/no-explicit-any` is enforced — type all Recharts tooltip props explicitly
- ESLint rule `@typescript-eslint/no-unused-vars` is enforced — remove unused imports immediately
- All components that use React hooks or browser APIs must have `'use client'` at the top
- `engagementRate` is stored as a percentage (0–100), not a decimal
- Post `date` fields are always `YYYY-MM-DD` strings; use `.slice(0, 10)` when parsing from CSVs
- Deduplication on upload uses `id` equality — IDs are generated as `{platform}-{slug}-{index}-{timestamp}`
