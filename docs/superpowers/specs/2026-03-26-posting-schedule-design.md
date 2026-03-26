# Posting Schedule Page — Design Spec

**Date:** 2026-03-26
**Project:** Clip Dashboard
**Status:** Approved

---

## Overview

Add a full-page Posting Schedule calendar view to the Clip Dashboard. Displays scheduled posts pulled from Supabase in a monthly grid. Clicking a day opens a slide-in drawer showing post details.

---

## 1. Database

**New table:** `scheduled_posts`

```sql
CREATE TABLE scheduled_posts (
  id             uuid primary key default gen_random_uuid(),
  clip_code      text not null,
  title          text not null,
  platform       text not null,   -- 'yt' | 'ig' | 'tt' | 'tw'
  scheduled_date date not null,
  post_time      text default '11:00 AM CT',
  status         text default 'scheduled',
  content_type   text,
  created_at     timestamptz default now()
);
```

**Seed data:** 16 rows — one per platform per clip:
- MBM015-CLIP-001 "Your customer data is your only real moat" → yt + ig → 2026-03-26
- MBM015-CLIP-003 "Audience to angle to format" → yt + ig → 2026-03-27
- MBM015-CLIP-005 "Why volume-based creative testing fails" → yt + ig → 2026-03-28
- MBM015-CLIP-007 "Facebook as a market research tool" → yt + ig → 2026-03-30
- MBM015-CLIP-009 "The insight extraction framework" → yt + ig → 2026-04-01
- MBM015-CLIP-012 "Mining customer reviews the right way" → yt + ig → 2026-04-03
- MBM015-CLIP-013 "1 insight can change your whole year" → ig → 2026-04-06
- MBM015-CLIP-002 "What your competitor's reviews reveal" → yt → 2026-04-08
- MBM015-CLIP-004 "Stop testing creative, test insights" → yt + ig → 2026-04-10

**Migration file:** `supabase/migrations/20260326_scheduled_posts.sql`
The `supabase/migrations/` directory does not yet exist — create it. This file is standalone SQL; run it via the Supabase dashboard SQL editor or `supabase db push` if using the CLI.

---

## 2. Component Architecture

### New file
`src/components/views/PostingScheduleView.tsx` — self-contained, fetches its own data.

**Local state:**
- `posts: ScheduledPost[]` — fetched from Supabase on mount
- `loading: boolean`
- `currentMonth: { year: number; month: number }` — initialized to today
- `selectedDate: string | null` — ISO date string (YYYY-MM-DD)
- `drawerOpen: boolean`

**Type:**
```ts
interface ScheduledPost {
  id: string;
  clip_code: string;
  title: string;
  platform: 'yt' | 'ig' | 'tt' | 'tw';
  scheduled_date: string;
  post_time: string;
  status: string;
  content_type: string | null;
}
```

`created_at` is intentionally excluded. Use an explicit select: `select('id, clip_code, title, platform, scheduled_date, post_time, status, content_type')`.

**Data grouping:** On mount, fetch all rows from `scheduled_posts`. Group client-side into `Map<string, ScheduledPost[]>` keyed by `scheduled_date` (YYYY-MM-DD).

**TypeScript sequencing note:** `NAV_TITLES` in `page.tsx` is typed `Record<NavSection, string>`. Add `'schedule'` to the `NavSection` union in `Sidebar.tsx` first, then add the `schedule` key to `NAV_TITLES` in `page.tsx` — both changes must land together or TypeScript will error.

### Modified files
- `src/components/Icons.tsx` — add `IconCalendar` custom SVG
- `src/components/Sidebar.tsx` — add `'schedule'` to `NavSection` union, `NAV_ITEMS`, and the Analytics group items array (see Section 5 for exact order)
- `src/app/page.tsx` — add `'schedule'` to `NAV_TITLES` and the view render

---

## 3. Calendar Grid

- Month/year heading with `<` `>` arrow buttons
- 7-column grid (Sun–Sat headers)
- **All date math via `Date.UTC()`** — no `new Date(y,m,d)` to prevent DST shifts
- Each cell shows: date number + platform dots below
  - One dot per platform with a post that day (deduped)
  - Colors: yt=#FF4444, ig=#C855E8, tt=#3ECFCF, tw=#4A9EE8
- Today's cell: subtle `var(--bg-elevated)` background + small red pip next to date number
- Platform legend above the grid (YouTube · Instagram · TikTok · Twitter/X)
- Days outside current month rendered muted/dimmed

---

## 4. Slide-In Drawer

- Slides in from right using CSS `transform: translateX()` transition
- Fixed overlay on right side of viewport
- Clicking outside (the overlay backdrop) closes it; X button also closes
- **Header:** full date ("March 26, 2026") + weekday below
- **Post cards:** one per scheduled post for that day
  - Platform badge (colored dot + platform name) | post_time right-aligned
  - Post title
  - Clip code (muted, monospace)
  - Footer: content_type tag + "Scheduled" status tag
- **Empty days:** "Nothing scheduled" message + "+ Schedule a post" placeholder button
- **Days with posts:** all cards + "+ Schedule a post" button at bottom

---

## 5. Sidebar Integration

**NavSection union** gains `'schedule'`.

**NAV_ITEMS entry:**
```ts
{ id: 'schedule', label: 'Posting Schedule', icon: <IconCalendar className="w-4 h-4" /> }
```

**NAV_GROUPS** Analytics group items:
```ts
['dashboard', 'content', 'schedule', 'analytics', 'platforms', 'comparison']
```

**NAV_TITLES** in `page.tsx`:
```ts
schedule: 'Posting Schedule'
```

---

## 6. Constraints

- TypeScript, no `any` types
- Do not touch any existing view files
- Do not modify existing Supabase tables
- No lucide-react — use custom SVG icon matching existing `Icons.tsx` pattern
- No realtime subscription
- Run `npm run test:e2e` after build; fix any regressions
- Push to git when complete
