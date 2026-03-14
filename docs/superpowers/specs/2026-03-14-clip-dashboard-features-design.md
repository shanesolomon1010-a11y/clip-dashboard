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
- `Sidebar.tsx`: Add "Comparison" nav entry between "Platforms" and "AI Insights"
- `page.tsx`: Import `ComparisonView`, add case to nav switch

---

## Phase 2 — CSV Export

**Location:** `AnalyticsView.tsx`

**Implementation:**
- Add "Export CSV" button to the Analytics page header (top-right, alongside existing filter pills)
- Reads the already-computed filtered posts array from component state (no extra Supabase fetch)
- Client-side CSV generation: format rows with columns `date, platform, title, views, likes, comments, shares, saves, content_type, url`
- Trigger download via temporary `<a>` element with `href: URL.createObjectURL(blob)`
- Filename: `clip-studio-export-YYYY-MM-DD.csv` (today's date)
- No API route needed — pure browser operation

**Edge case:** Empty filtered set shows a brief "No data to export" toast or is disabled.

---

## Phase 3 — Content Type Tagging

### 3.1 Database Migration (manual step)

The `posts` table has no `content_type` column despite `UnifiedPost` type and `updatePostContentType()` DB function referencing it.

**Required migration — run once in Supabase dashboard:**
```sql
ALTER TABLE posts ADD COLUMN content_type text;
```

### 3.2 UI

**Location:** The full posts table in `ContentView.tsx` (currently renders `TopPostsTable.tsx`).

**Changes to `TopPostsTable.tsx`:**
- Add `content_type` column after the existing columns
- Display a color-coded badge per post
- Empty/null `content_type` shows a dim clickable "—" dash
- Clicking a badge (or the dash) opens an inline dropdown with 8 options:
  - Hook Video, Tutorial, UGC Style, Vlog, Review, Challenge, Trend, Other
- On selection: call `updatePostContentType(platform, title, date, content_type)` → update Supabase, update local `posts` state via callback prop
- Optimistic UI: update badge immediately, revert on Supabase error

**Badge color scheme** (dark theme, muted tones):
| Type | Color |
|------|-------|
| Hook Video | Gold (`#d4922a` / `bg-[var(--gold)]`) |
| Tutorial | Blue (`#3b82f6`) |
| UGC Style | Purple (`#a855f7`) |
| Vlog | Green (`#22c55e`) |
| Review | Orange (`#f97316`) |
| Challenge | Pink (`#ec4899`) |
| Trend | Teal (`#14b8a6`) |
| Other | Gray (`#6b7280`) |

---

## Phase 4 — AI Caption Generator

### 4.1 Navigation

**Changes:**
- `Sidebar.tsx`: Add "Captions" nav entry before "AI Insights" (uses sparkle/wand icon from existing `Icons.tsx`)
- `page.tsx`: Import `CaptionView`, add case to nav switch

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
- API key: `process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY`
- System prompt: instructs Claude to write a platform-native caption optimized for the selected tone, with relevant hashtags, within platform character limits
- Loading state: spinner on button, input fields disabled

**Output:**
- Generated caption displayed in a styled, pre-wrapped text box
- One-click "Copy" button (clipboard API, shows "Copied!" confirmation for 2s)
- On success: call `saveCaption({ clip_description, platform, tone, caption_text })` to persist in Supabase `captions` table

**History section (bottom half):**
- Load past captions on mount via `fetchCaptions()`
- Cards displayed newest-first, each showing: platform badge, tone tag, truncated clip description, full caption text, relative timestamp
- No delete functionality (YAGNI)

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
| `src/components/TopPostsTable.tsx` | Add content_type badge column + inline dropdown |
| `src/components/Sidebar.tsx` | Add Comparison + Captions nav entries |
| `src/app/page.tsx` | Add ComparisonView + CaptionView imports and nav cases |
| `src/components/views/CaptionView.tsx` | New file — AI Caption Generator page |
| Supabase dashboard | Manual migration: `ALTER TABLE posts ADD COLUMN content_type text` |

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
