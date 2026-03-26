# Posting Schedule Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-page Posting Schedule calendar view with a slide-in drawer to the Clip Dashboard, backed by a new `scheduled_posts` Supabase table.

**Architecture:** Self-contained `PostingScheduleView` component that fetches from Supabase on mount and owns all local state (month, selected date, drawer open/closed). Calendar grid uses `Date.UTC()` for all date math. The drawer is always in the DOM and animated via CSS `translateX`. Nav wiring touches `Sidebar.tsx` and `page.tsx` only.

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS, Supabase JS v2, Playwright (e2e)

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/20260326_scheduled_posts.sql` | Table DDL + 16 seed rows |
| Modify | `src/components/Icons.tsx` | Add `IconCalendar` SVG |
| Modify | `src/components/Sidebar.tsx` | Add `'schedule'` to union, NAV_ITEMS, NAV_GROUPS |
| Modify | `src/app/page.tsx` | Add `'schedule'` to NAV_TITLES + view render + import |
| Create | `src/components/views/PostingScheduleView.tsx` | Full calendar + drawer |

---

## Chunk 1: Database + Wiring (Icons, Sidebar, page.tsx)

### Task 1: Create Supabase migration

**Files:**
- Create: `supabase/migrations/20260326_scheduled_posts.sql`

- [ ] **Step 1: Create the migrations directory and SQL file**

```bash
mkdir -p /Users/shane/clip-dashboard/supabase/migrations
```

Create `supabase/migrations/20260326_scheduled_posts.sql` with this exact content:

```sql
-- Create scheduled_posts table
CREATE TABLE IF NOT EXISTS scheduled_posts (
  id             uuid primary key default gen_random_uuid(),
  clip_code      text not null,
  title          text not null,
  platform       text not null,
  scheduled_date date not null,
  post_time      text default '11:00 AM CT',
  status         text default 'scheduled',
  content_type   text,
  created_at     timestamptz default now()
);

-- Seed data: 16 rows (one per platform per clip)
INSERT INTO scheduled_posts (clip_code, title, platform, scheduled_date) VALUES
  ('MBM015-CLIP-001', 'Your customer data is your only real moat',  'yt', '2026-03-26'),
  ('MBM015-CLIP-001', 'Your customer data is your only real moat',  'ig', '2026-03-26'),
  ('MBM015-CLIP-003', 'Audience to angle to format',                'yt', '2026-03-27'),
  ('MBM015-CLIP-003', 'Audience to angle to format',                'ig', '2026-03-27'),
  ('MBM015-CLIP-005', 'Why volume-based creative testing fails',     'yt', '2026-03-28'),
  ('MBM015-CLIP-005', 'Why volume-based creative testing fails',     'ig', '2026-03-28'),
  ('MBM015-CLIP-007', 'Facebook as a market research tool',         'yt', '2026-03-30'),
  ('MBM015-CLIP-007', 'Facebook as a market research tool',         'ig', '2026-03-30'),
  ('MBM015-CLIP-009', 'The insight extraction framework',           'yt', '2026-04-01'),
  ('MBM015-CLIP-009', 'The insight extraction framework',           'ig', '2026-04-01'),
  ('MBM015-CLIP-012', 'Mining customer reviews the right way',      'yt', '2026-04-03'),
  ('MBM015-CLIP-012', 'Mining customer reviews the right way',      'ig', '2026-04-03'),
  ('MBM015-CLIP-013', '1 insight can change your whole year',       'ig', '2026-04-06'),
  ('MBM015-CLIP-002', 'What your competitor''s reviews reveal',     'yt', '2026-04-08'),
  ('MBM015-CLIP-004', 'Stop testing creative, test insights',       'yt', '2026-04-10'),
  ('MBM015-CLIP-004', 'Stop testing creative, test insights',       'ig', '2026-04-10');
```

- [ ] **Step 2: Run the migration**

Run this SQL in the Supabase dashboard SQL editor (or via `supabase db push` if using the CLI). Verify the table appears in the Table Editor with 16 rows.

- [ ] **Step 3: Commit migration file**

```bash
cd /Users/shane/clip-dashboard
git add supabase/migrations/20260326_scheduled_posts.sql
git commit -m "feat: add scheduled_posts migration with seed data"
```

---

### Task 2: Add IconCalendar to Icons.tsx

**Files:**
- Modify: `src/components/Icons.tsx`

- [ ] **Step 1: Append IconCalendar export to Icons.tsx**

Add this at the end of `src/components/Icons.tsx`:

```tsx
export function IconCalendar({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/shane/clip-dashboard
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors related to Icons.tsx

- [ ] **Step 3: Commit**

```bash
git add src/components/Icons.tsx
git commit -m "feat: add IconCalendar SVG to Icons"
```

---

### Task 3: Wire Sidebar.tsx

**Files:**
- Modify: `src/components/Sidebar.tsx` (lines 3, 5, 7–19, 21–24)

- [ ] **Step 1: Update the import line (line 3)**

Change:
```tsx
import { IconDashboard, IconContent, IconAnalytics, IconPlatforms, IconSettings, IconUpload, IconSparkles, IconScissors, IconComparison, IconScriptAnalyzer, IconTranscriber } from './Icons';
```

To (add `IconCalendar`):
```tsx
import { IconDashboard, IconContent, IconAnalytics, IconPlatforms, IconSettings, IconUpload, IconSparkles, IconScissors, IconComparison, IconScriptAnalyzer, IconTranscriber, IconCalendar } from './Icons';
```

- [ ] **Step 2: Add 'schedule' to the NavSection union (line 5)**

Change:
```tsx
export type NavSection = 'dashboard' | 'content' | 'analytics' | 'platforms' | 'comparison' | 'captions' | 'insights' | 'scriptAnalyzer' | 'transcriber' | 'editor' | 'settings';
```

To:
```tsx
export type NavSection = 'dashboard' | 'content' | 'schedule' | 'analytics' | 'platforms' | 'comparison' | 'captions' | 'insights' | 'scriptAnalyzer' | 'transcriber' | 'editor' | 'settings';
```

- [ ] **Step 3: Add the NAV_ITEMS entry for 'schedule' (after line 9, between 'content' and 'analytics')**

Change:
```tsx
  { id: 'content',     label: 'Content',     icon: <IconContent    className="w-4 h-4" /> },
  { id: 'analytics',   label: 'Analytics',   icon: <IconAnalytics  className="w-4 h-4" /> },
```

To:
```tsx
  { id: 'content',     label: 'Content',          icon: <IconContent   className="w-4 h-4" /> },
  { id: 'schedule',    label: 'Posting Schedule',  icon: <IconCalendar  className="w-4 h-4" /> },
  { id: 'analytics',   label: 'Analytics',         icon: <IconAnalytics className="w-4 h-4" /> },
```

- [ ] **Step 4: Add 'schedule' to NAV_GROUPS Analytics array (line 22)**

Change:
```tsx
  { label: 'Analytics', items: ['dashboard', 'content', 'analytics', 'platforms', 'comparison'] },
```

To:
```tsx
  { label: 'Analytics', items: ['dashboard', 'content', 'schedule', 'analytics', 'platforms', 'comparison'] },
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /Users/shane/clip-dashboard
npx tsc --noEmit 2>&1 | head -20
```

Expected: error about `NAV_TITLES` missing `schedule` key in page.tsx — this is expected and will be fixed in Task 4.

- [ ] **Step 6: Commit Sidebar changes**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat: add Posting Schedule nav item to sidebar"
```

---

### Task 4: Wire page.tsx

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add the PostingScheduleView import (after the last view import, before context imports)**

Add after `import TranscriberView from '@/components/views/TranscriberView';`:
```tsx
import PostingScheduleView from '@/components/views/PostingScheduleView';
```

- [ ] **Step 2: Add 'schedule' to NAV_TITLES**

Change:
```tsx
const NAV_TITLES: Record<NavSection, string> = {
  dashboard:      'Dashboard',
  content:        'Content',
  analytics:      'Analytics',
```

To:
```tsx
const NAV_TITLES: Record<NavSection, string> = {
  dashboard:      'Dashboard',
  content:        'Content',
  schedule:       'Posting Schedule',
  analytics:      'Analytics',
```

- [ ] **Step 3: Add the view render (after the `content` conditional, before `analytics`)**

Change:
```tsx
            {activeNav === 'content'    && <ContentView posts={posts} onUpload={handleUpload} onPostUpdate={handlePostUpdate} />}
            {activeNav === 'analytics'  && <AnalyticsView posts={posts} />}
```

To:
```tsx
            {activeNav === 'content'    && <ContentView posts={posts} onUpload={handleUpload} onPostUpdate={handlePostUpdate} />}
            {activeNav === 'schedule'   && <PostingScheduleView />}
            {activeNav === 'analytics'  && <AnalyticsView posts={posts} />}
```

- [ ] **Step 4: Verify TypeScript compiles with no errors**

```bash
cd /Users/shane/clip-dashboard
npx tsc --noEmit 2>&1 | head -20
```

Expected: One error about `PostingScheduleView` not found (file doesn't exist yet) — all other errors should be gone.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: wire PostingScheduleView into app shell"
```

---

## Chunk 2: PostingScheduleView Component

### Task 5: Create PostingScheduleView.tsx

**Files:**
- Create: `src/components/views/PostingScheduleView.tsx`

This is the entire component in one step. All date math uses `Date.UTC()`. The drawer is always in the DOM and controlled by CSS transitions.

- [ ] **Step 1: Create the file with this exact content**

Create `src/components/views/PostingScheduleView.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────────

type Platform = 'yt' | 'ig' | 'tt' | 'tw';

interface ScheduledPost {
  id: string;
  clip_code: string;
  title: string;
  platform: Platform;
  scheduled_date: string;  // 'YYYY-MM-DD'
  post_time: string;
  status: string;
  content_type: string | null;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PLATFORM_COLORS: Record<Platform, string> = {
  yt: '#FF4444',
  ig: '#C855E8',
  tt: '#3ECFCF',
  tw: '#4A9EE8',
};

const PLATFORM_LABELS: Record<Platform, string> = {
  yt: 'YouTube',
  ig: 'Instagram',
  tt: 'TikTok',
  tw: 'Twitter/X',
};

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_LONG  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES   = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ── Date helpers ───────────────────────────────────────────────────────────────

/** Returns 'YYYY-MM-DD' for the given UTC year/month/day. Prevents DST shifts. */
function toDateStr(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

/** Returns today's date as 'YYYY-MM-DD' in local time (not UTC). */
function getTodayStr(): string {
  const t = new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, '0');
  const d = String(t.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parses a 'YYYY-MM-DD' string and returns display strings. */
function formatDisplayDate(dateStr: string): { full: string; weekday: string } {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const utc = new Date(Date.UTC(y, mo - 1, d));
  return {
    full:    `${MONTH_NAMES[utc.getUTCMonth()]} ${utc.getUTCDate()}, ${utc.getUTCFullYear()}`,
    weekday: WEEKDAY_LONG[utc.getUTCDay()],
  };
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function PostingScheduleView() {
  const [posts, setPosts]           = useState<ScheduledPost[]>([]);
  const [loading, setLoading]       = useState(true);
  const [year, setYear]             = useState(() => new Date().getFullYear());
  const [month, setMonth]           = useState(() => new Date().getMonth());  // 0-indexed
  const [selectedDate, setSelected] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const todayStr = getTodayStr();

  // Fetch on mount — no realtime subscription needed
  useEffect(() => {
    supabase
      .from('scheduled_posts')
      .select('id, clip_code, title, platform, scheduled_date, post_time, status, content_type')
      .then(({ data, error }) => {
        if (!error && data) setPosts(data as ScheduledPost[]);
        setLoading(false);
      });
  }, []);

  // Group posts by date string
  const postsByDate = new Map<string, ScheduledPost[]>();
  for (const post of posts) {
    const existing = postsByDate.get(post.scheduled_date) ?? [];
    existing.push(post);
    postsByDate.set(post.scheduled_date, existing);
  }

  // ── Calendar grid math (all via Date.UTC) ──────────────────────────────────
  const firstDayOfWeek = new Date(Date.UTC(year, month, 1)).getUTCDay();   // 0=Sun
  const daysInMonth    = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  // Fill leading blank cells, then day numbers, then trailing blanks to complete row
  const cells: (number | null)[] = [
    ...Array<null>(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  // ── Navigation ─────────────────────────────────────────────────────────────
  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  function openDrawer(day: number) {
    setSelected(toDateStr(year, month, day));
    setDrawerOpen(true);
  }
  function closeDrawer() {
    setDrawerOpen(false);
  }

  const selectedPosts  = selectedDate ? (postsByDate.get(selectedDate) ?? []) : [];
  const displayDate    = selectedDate ? formatDisplayDate(selectedDate) : null;

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--text-2)] text-sm">
        Loading schedule…
      </div>
    );
  }

  return (
    <div className="p-5">

      {/* Platform legend */}
      <div className="flex flex-wrap gap-5 mb-5">
        {(Object.entries(PLATFORM_LABELS) as [Platform, string][]).map(([key, label]) => (
          <span key={key} className="flex items-center gap-1.5 text-xs text-[var(--text-2)]">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: PLATFORM_COLORS[key] }}
            />
            {label}
          </span>
        ))}
      </div>

      {/* Month navigation */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={prevMonth}
          className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--bg-hover)] transition-colors text-lg leading-none"
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className="text-base font-medium text-[var(--text-1)] min-w-[156px] text-center">
          {MONTH_NAMES[month]} {year}
        </span>
        <button
          onClick={nextMonth}
          className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--bg-hover)] transition-colors text-lg leading-none"
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      {/* Calendar grid */}
      <div className="rounded-lg border border-[var(--border)] overflow-hidden">

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--bg-elevated)]">
          {WEEKDAY_SHORT.map(d => (
            <div
              key={d}
              className="py-2 text-center text-[9px] font-semibold tracking-[0.2em] uppercase text-[var(--text-3)]"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Cells */}
        <div className="grid grid-cols-7">
          {cells.map((day, idx) => {
            // Blank cell (before first day or trailing filler)
            if (day === null) {
              return (
                <div
                  key={`blank-${idx}`}
                  className="min-h-[80px] border-b border-r border-[var(--border)] bg-[var(--bg-base)] opacity-40"
                />
              );
            }

            const dateStr  = toDateStr(year, month, day);
            const dayPosts = postsByDate.get(dateStr) ?? [];
            const isToday  = dateStr === todayStr;
            // Deduplicate platforms — one dot per platform
            const platforms = [...new Set(dayPosts.map(p => p.platform))];

            return (
              <div
                key={dateStr}
                onClick={() => openDrawer(day)}
                className={[
                  'min-h-[80px] border-b border-r border-[var(--border)] p-2 cursor-pointer transition-colors select-none',
                  isToday
                    ? 'bg-[var(--bg-elevated)]'
                    : 'bg-[var(--bg-base)] hover:bg-[var(--bg-hover)]',
                ].join(' ')}
              >
                {/* Date number + today pip */}
                <div className="flex items-center gap-1 mb-1.5">
                  {isToday && (
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                  )}
                  <span
                    className={[
                      'text-xs font-medium',
                      isToday ? 'text-[var(--text-1)]' : 'text-[var(--text-2)]',
                    ].join(' ')}
                  >
                    {day}
                  </span>
                </div>

                {/* Platform dots */}
                <div className="flex flex-wrap gap-1">
                  {platforms.map(p => (
                    <span
                      key={p}
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: PLATFORM_COLORS[p] }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Slide-in drawer (always in DOM, animated via translateX) ────────── */}
      <div
        className={[
          'fixed inset-0 z-40 transition-opacity duration-200',
          drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        ].join(' ')}
      >
        {/* Backdrop — click outside to close */}
        <div
          className="absolute inset-0 bg-black/40"
          onClick={closeDrawer}
        />

        {/* Drawer panel */}
        <div
          className={[
            'absolute right-0 top-0 h-full w-80 flex flex-col',
            'bg-[var(--bg-elevated)] border-l border-[var(--border)]',
            'transition-transform duration-200 z-50',
            drawerOpen ? 'translate-x-0' : 'translate-x-full',
          ].join(' ')}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drawer header */}
          <div className="flex items-start justify-between p-4 border-b border-[var(--border)] flex-shrink-0">
            <div>
              <p className="text-sm font-semibold text-[var(--text-1)]">
                {displayDate?.full ?? ''}
              </p>
              <p className="text-xs text-[var(--text-2)] mt-0.5">
                {displayDate?.weekday ?? ''}
              </p>
            </div>
            <button
              onClick={closeDrawer}
              className="text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors mt-0.5 text-sm"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Drawer body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">

            {/* Empty state */}
            {selectedPosts.length === 0 && (
              <p className="text-sm text-[var(--text-2)] text-center py-6">
                Nothing scheduled
              </p>
            )}

            {/* Post cards */}
            {selectedPosts.map(post => (
              <div
                key={post.id}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3 space-y-2"
              >
                {/* Platform badge + time */}
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-1)]">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: PLATFORM_COLORS[post.platform] }}
                    />
                    {PLATFORM_LABELS[post.platform]}
                  </span>
                  <span className="text-xs text-[var(--text-2)]">{post.post_time}</span>
                </div>

                {/* Title */}
                <p className="text-sm font-medium text-[var(--text-1)] leading-snug">
                  {post.title}
                </p>

                {/* Clip code */}
                <p className="text-xs text-[var(--text-2)] font-mono">
                  {post.clip_code}
                </p>

                {/* Tags: content_type + status */}
                <div className="flex flex-wrap gap-1.5">
                  {post.content_type && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-hover)] text-[var(--text-2)] border border-[var(--border)]">
                      {post.content_type}
                    </span>
                  )}
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--gold-dim)] text-[var(--gold)] border border-[var(--gold-border)]">
                    {post.status}
                  </span>
                </div>
              </div>
            ))}

            {/* Schedule a post CTA */}
            <button className="w-full py-2.5 text-xs text-[var(--text-2)] border border-dashed border-[var(--border)] rounded-lg hover:border-[var(--border-md)] hover:text-[var(--text-1)] transition-colors">
              + Schedule a post
            </button>

          </div>
        </div>
      </div>

    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles with no errors**

```bash
cd /Users/shane/clip-dashboard
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/shane/clip-dashboard
git add src/components/views/PostingScheduleView.tsx
git commit -m "feat: add PostingScheduleView — calendar grid with slide-in drawer"
```

---

## Chunk 3: Verification + Push

### Task 6: Build verification

**Files:** none (verification only)

- [ ] **Step 1: Run the Next.js build**

```bash
cd /Users/shane/clip-dashboard
npm run build 2>&1 | tail -30
```

Expected: `✓ Compiled successfully` with no TypeScript errors. Fix any reported errors before proceeding.

- [ ] **Step 2: Start the dev server and smoke-test manually**

```bash
cd /Users/shane/clip-dashboard
npm run dev
```

Open `http://localhost:3000`. Verify:
- "Posting Schedule" appears in the sidebar between Content and Analytics
- Clicking it shows the calendar grid
- Today's cell has a red pip and subtle background
- Clicking a day with posts opens the drawer from the right
- Drawer shows correct post cards
- Clicking outside or X closes the drawer
- Clicking a day with no posts shows "Nothing scheduled" in the drawer

Keep the dev server running — it is needed for the e2e tests in Task 7.

---

### Task 7: Run e2e tests

**Files:** none

The dev server from Task 6 must still be running. The Playwright config has no `webServer` block, so Playwright connects to the already-running dev server on port 3000.

- [ ] **Step 1: Run the full Playwright suite**

```bash
cd /Users/shane/clip-dashboard
npm run test:e2e 2>&1 | tail -40
```

Expected: all 13 existing tests pass. The new Posting Schedule page has no Playwright tests — that's fine. Fix any regressions in existing tests before proceeding.

---

### Task 8: Push to git

- [ ] **Step 1: Verify clean state**

```bash
cd /Users/shane/clip-dashboard
git status
git log --oneline -5
```

Expected: working tree clean, 5 feature commits visible.

- [ ] **Step 2: Push**

```bash
cd /Users/shane/clip-dashboard
git push origin main
```

Expected: `main -> main` pushed successfully.

---

## Done

The Posting Schedule page is live. Key verification points:
1. `scheduled_posts` table exists in Supabase with 16 seed rows
2. Calendar renders correctly for March 2026 (4 dates: 26th, 27th, 28th, 30th); navigate to April for remaining seed rows
3. Platform dots appear on the correct dates
4. Drawer slides in from right on cell click
5. All 13 existing e2e tests pass
