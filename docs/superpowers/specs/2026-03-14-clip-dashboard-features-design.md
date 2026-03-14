# Clip Dashboard — Feature Completion Design

**Date:** 2026-03-14
**Status:** Approved
**Approach:** Wire-first, then build (sequential)

---

## Context

Six features are partially or fully built but incomplete or unreachable. Three components exist but are orphaned (never imported). Three features need new implementation. This spec covers all six.

**Tech stack:** Next.js 14, TypeScript, Tailwind, Recharts, Supabase, Anthropic API
**Navigation:** State-driven (no Next.js routing). `activeNav` in `page.tsx` controls which view renders.

---

## Phase 1 — Wire Orphaned Components

### 1.1 Goal Tracking

**What exists:** `GoalsSection.tsx` (249 lines) — complete UI with progress bars, edit modal, Supabase integration.
**What's missing:** Never imported anywhere.

**Change:** Import and render `GoalsSection` in `DashboardView.tsx`, below the metric cards row, above the views line chart. Pass `posts` prop for computing current metric values against stored targets.

No new logic needed. The component handles its own Supabase reads/writes via `fetchGoals()` and `saveGoal()`.

> **Note:** `GoalsSection.tsx` exists at `src/components/GoalsSection.tsx` — confirmed present, just never imported.

### 1.2 Best Time to Post

**What exists:** `BestTimeCard.tsx` (134 lines) — 7×7 heatmap (platform rows × day-of-week columns), color intensity by avg engagement rate, best-day highlight.
**What's missing:** Never imported anywhere.

**Decision:** Keep existing day-of-week design (hour-of-day requires timestamp data not present in CSV exports).

**Change:** Import and render `BestTimeCard` in `AnalyticsView.tsx`, below the `PlatformBarChart`. Pass the currently filtered `posts` array so the heatmap respects active date/platform filters.

### 1.3 Platform Comparison

**What exists:** `ComparisonView.tsx` (299 lines) — sortable table (8 columns) + RadarChart (5 metrics), reads from Supabase `posts` table.
**What's missing:** Sidebar routes to `PlatformsView` only; `ComparisonView` is unreachable.

**Decision:** Two separate nav items (Platforms + Comparison).

**Changes:**
- `Sidebar.tsx`:
  - Add `'comparison'` to `NavSection` union type
  - Add `{ id: 'comparison', label: 'Comparison', icon: <IconAnalytics className="w-4 h-4" /> }` to `NAV_ITEMS`
  - Add `'comparison'` to the `'Analytics'` group in `NAV_GROUPS` (after `'platforms'`)
- `page.tsx`: Import `ComparisonView`, add `'comparison'` case to nav switch, add `'comparison'` to `NAV_TITLES` record

---

## Phase 2 — CSV Export

**Location:** `AnalyticsView.tsx`

**Implementation:**
- Add "Export CSV" button to the Analytics page header (top-right, alongside existing filter pills)
- Reads the already-computed filtered posts array from component state (no extra Supabase fetch)
- Client-side CSV generation: format rows with columns `date, platform, title, views, likes, comments, shares, saves, content_type`
  - `content_type` is optional on `UnifiedPost` — write empty string for null/undefined values
  - `url` is not a field on `UnifiedPost` — omit from export
- Trigger download via temporary `<a>` element with `href: URL.createObjectURL(blob)`
- Filename: `clip-studio-export-YYYY-MM-DD.csv` (today's date)
- No API route needed — pure browser operation

**Edge case:** Empty filtered set shows a brief "No data to export" toast or is disabled.

---

## Phase 3 — Content Type Tagging

### 3.1 Database Migrations (manual steps — run in Supabase dashboard)

**Migration 1 — `posts` table** (blocks content type UI):
```sql
ALTER TABLE posts ADD COLUMN content_type text;
```

**Migration 2 — `captions` table** (blocks Caption Generator):
```sql
CREATE TABLE IF NOT EXISTS captions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  clip_description text,
  platform text,
  tone text,
  caption_text text
);
```
> If the `captions` table already exists in Supabase, skip Migration 2.

### 3.2 UI

**Location:** The full posts table in `ContentView.tsx` (currently renders `TopPostsTable.tsx`).

**Changes to `TopPostsTable.tsx`:**
- Add `content_type` column after the existing columns
- Display a color-coded badge per post
- Empty/null `content_type` shows a dim clickable "—" dash
- Clicking a badge (or the dash) opens an inline dropdown with 8 options from the canonical `CONTENT_TYPES` constant in `src/types/index.ts`:
  - Hook Video, Tutorial, UGC Style, Talking Head, B-Roll, Podcast Clip, Text Post, Other
- On selection: call `updatePostContentType(platform, title, date, content_type)` → update Supabase; fire `onContentTypeChange(post.id, content_type)` callback to update parent state
- `TopPostsTable` gains new prop: `onContentTypeChange?: (postId: string, contentType: string) => void`
- `ContentView.tsx` (which renders `TopPostsTable`) wires the handler: updates the top-level `posts` state in `page.tsx` via its existing `onUpload`-style callback pattern (a new `onPostUpdate` prop passed down from `page.tsx`)
- Optimistic UI: update badge immediately, revert on Supabase error

**Badge color scheme** (dark theme, muted tones):
| Type | Color |
|------|-------|
| Hook Video | Gold (`#d4922a` / `bg-[var(--gold)]`) |
| Tutorial | Blue (`#3b82f6`) |
| UGC Style | Purple (`#a855f7`) |
| Talking Head | Green (`#22c55e`) |
| B-Roll | Orange (`#f97316`) |
| Podcast Clip | Pink (`#ec4899`) |
| Text Post | Teal (`#14b8a6`) |
| Other | Gray (`#6b7280`) |

---

## Phase 4 — AI Caption Generator

### 4.1 Navigation

**Changes:**
- `Sidebar.tsx`:
  - Add `'captions'` to `NavSection` union type
  - Add `{ id: 'captions', label: 'Captions', icon: <IconSparkles className="w-4 h-4" />, badge: 'AI' }` to `NAV_ITEMS` before `'insights'`
  - Add `'captions'` to the `'Tools'` group in `NAV_GROUPS` before `'insights'`
- `page.tsx`: Import `CaptionView`, add `'captions'` case to nav switch, add `'captions'` to `NAV_TITLES` record

### 4.2 New Component: `CaptionView.tsx`

**Generator section (top half):**

| Field | Type | Options |
|-------|------|---------|
| Clip description | Textarea | Placeholder: "Describe your clip — what happens, the vibe, key moments" |
| Platform | Pill selector | TikTok, Instagram, LinkedIn, X, YouTube |
| Tone | Pill selector | Engaging, Professional, Casual, Viral |
| Generate button | Button | Disabled while loading |

**API call:**
- Direct `fetch()` to `https://api.anthropic.com/v1/messages` — matches existing pattern in `AIInsightsView.tsx`
- Model: `claude-sonnet-4-20250514`
- API key: read from `localStorage` under key `clip_studio_anthropic_key` — same storage key used by `AIInsightsView`. If absent, show a prompt directing user to enter it in AI Insights first (or show the same inline input pattern).
- System prompt: instructs Claude to write a platform-native caption optimized for the selected tone, with relevant hashtags, within platform character limits
- Loading state: spinner on button, input fields disabled

**Output:**
- Generated caption displayed in a styled, pre-wrapped text box
- One-click "Copy" button (clipboard API, shows "Copied!" confirmation for 2s)
- On success: call `saveCaption({ clip_description, platform, tone, caption_text })` to persist in Supabase `captions` table

**History section (bottom half):**
- Load past captions on mount via `fetchCaptions()` — show spinner while loading, empty state message if no captions yet
- Cards displayed newest-first, each showing: platform badge, tone tag, truncated clip description, full caption text, relative timestamp
- No delete functionality (YAGNI)
- On `saveCaption()` failure: show inline error message below the output box; caption remains visible for manual copy

### 4.3 System Prompt Template

```
You are a social media caption writer. Write a single caption for a ${platform} post.
Tone: ${tone}.
The clip: ${description}.
Requirements: Platform-native voice, relevant hashtags, within ${platform} character limits.
Output only the caption text with hashtags — no explanation, no quotes.
```

---

## File Change Summary

| File | Change |
|------|--------|
| `src/components/views/DashboardView.tsx` | Add GoalsSection import + render |
| `src/components/views/AnalyticsView.tsx` | Add BestTimeCard import + render; add CSV Export button |
| `src/components/views/ContentView.tsx` | Add `onPostUpdate` prop; wire `onContentTypeChange` handler |
| `src/components/TopPostsTable.tsx` | Add content_type badge column + inline dropdown; add `onContentTypeChange` prop |
| `src/components/Sidebar.tsx` | Update `NavSection` union; add `comparison` + `captions` to `NAV_ITEMS` and `NAV_GROUPS` |
| `src/app/page.tsx` | Add `ComparisonView` + `CaptionView` imports; add nav cases; update `NAV_TITLES`; add `onPostUpdate` handler for content type updates |
| `src/components/views/CaptionView.tsx` | New file — AI Caption Generator page |
| Supabase dashboard | Migration 1: `ALTER TABLE posts ADD COLUMN content_type text` |
| Supabase dashboard | Migration 2: `CREATE TABLE IF NOT EXISTS captions (...)` (if not already present) |

---

## Implementation Order

1. Sidebar + page.tsx nav wiring (unblocks all views being reachable)
2. GoalsSection → DashboardView
3. BestTimeCard → AnalyticsView
4. CSV Export button → AnalyticsView
5. Run Supabase migration (manual), then TopPostsTable content_type badges
6. CaptionView new component

---

## Out of Scope

- Hour-of-day heatmap (requires timestamp data not in CSV exports)
- Caption delete / edit history
- Goal tracking outside of Dashboard
- CSV import changes
