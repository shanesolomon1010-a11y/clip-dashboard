# Clip Dashboard Feature Completion — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire three orphaned components into the UI, add CSV export, add content type tagging with inline editing, and build the AI Caption Generator page.

**Architecture:** Sequential four-chunk approach — navigation/wiring first (fast wins, unblocks all views), then CSV export (self-contained), then content type tagging (requires DB migration), then Caption Generator (new page). All changes are in `src/` only; no new dependencies needed.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Supabase (`@supabase/supabase-js`), Recharts, Anthropic API (direct `fetch`, no SDK)

**No test suite exists.** Verification at each step = `npx tsc --noEmit` (fast type check) + `npm run build` (ESLint + types) + browser smoke test.

**Spec:** `docs/superpowers/specs/2026-03-14-clip-dashboard-features-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/Sidebar.tsx` | Modify | Add `comparison` + `captions` to NavSection union, NAV_ITEMS, NAV_GROUPS |
| `src/app/page.tsx` | Modify | Import new views, add nav cases + NAV_TITLES entries, add `onPostUpdate` handler |
| `src/components/views/DashboardView.tsx` | Modify | Import + render `GoalsSection` |
| `src/components/views/AnalyticsView.tsx` | Modify | Import + render `BestTimeCard`; add CSV Export button + logic |
| `src/components/views/ContentView.tsx` | Modify | Add `onPostUpdate` prop; thread to `TopPostsTable` |
| `src/components/TopPostsTable.tsx` | Modify | Add content_type badge column + inline dropdown + `onContentTypeChange` prop |
| `src/components/views/CaptionView.tsx` | Create | Full Caption Generator page |

---

## Chunk 1: Navigation Wiring

Wire all three orphaned components and update navigation so all views are reachable.

---

### Task 1: Update Sidebar.tsx — add Comparison and Captions nav entries

**Files:**
- Modify: `src/components/Sidebar.tsx:1-20`

- [ ] **Step 1: Replace the Sidebar imports and NavSection union**

Open `src/components/Sidebar.tsx`. Replace lines 1–20 with:

```tsx
'use client';

import { IconDashboard, IconContent, IconAnalytics, IconPlatforms, IconSettings, IconUpload, IconSparkles, IconScissors, IconComparison } from './Icons';

export type NavSection = 'dashboard' | 'content' | 'analytics' | 'platforms' | 'comparison' | 'captions' | 'insights' | 'editor' | 'settings';

const NAV_ITEMS: { id: NavSection; label: string; icon: React.ReactNode; badge?: string }[] = [
  { id: 'dashboard',   label: 'Dashboard',   icon: <IconDashboard  className="w-4 h-4" /> },
  { id: 'content',     label: 'Content',     icon: <IconContent    className="w-4 h-4" /> },
  { id: 'analytics',   label: 'Analytics',   icon: <IconAnalytics  className="w-4 h-4" /> },
  { id: 'platforms',   label: 'Platforms',   icon: <IconPlatforms  className="w-4 h-4" /> },
  { id: 'comparison',  label: 'Comparison',  icon: <IconComparison className="w-4 h-4" /> },
  { id: 'captions',    label: 'Captions',    icon: <IconSparkles   className="w-4 h-4" />, badge: 'AI' },
  { id: 'insights',    label: 'AI Insights', icon: <IconSparkles   className="w-4 h-4" />, badge: 'AI' },
  { id: 'editor',      label: 'Editor',      icon: <IconScissors   className="w-4 h-4" />, badge: 'AI' },
  { id: 'settings',    label: 'Settings',    icon: <IconSettings   className="w-4 h-4" /> },
];

const NAV_GROUPS = [
  { label: 'Analytics', items: ['dashboard', 'content', 'analytics', 'platforms', 'comparison'] },
  { label: 'Tools',     items: ['captions', 'insights', 'editor', 'settings'] },
];
```

- [ ] **Step 2: Type-check**

```bash
cd ~/clip-dashboard && npx tsc --noEmit
```

Expected: zero errors. If `NavSection` is used in `page.tsx` without the new values, you'll see errors there — that's expected and fixed in Task 2.

---

### Task 2: Update page.tsx — import new views, add nav cases and NAV_TITLES

**Files:**
- Modify: `src/app/page.tsx:1-98`

- [ ] **Step 1: Add imports for the two new views**

After line 15 (`import SettingsView from '@/components/views/SettingsView';`), add:

```tsx
import ComparisonView from '@/components/views/ComparisonView';
import CaptionView from '@/components/views/CaptionView';
```

> `CaptionView` doesn't exist yet — TypeScript will error until Task 10 creates it. That's expected. Build will fail until Chunk 4 completes. If this is blocking, skip the `CaptionView` import and add it in Task 11 instead.

- [ ] **Step 2: Update NAV_TITLES**

Replace the `NAV_TITLES` block (lines 17–25) with:

```tsx
const NAV_TITLES: Record<NavSection, string> = {
  dashboard:   'Dashboard',
  content:     'Content',
  analytics:   'Analytics',
  platforms:   'Platforms',
  comparison:  'Comparison',
  captions:    'Caption Generator',
  insights:    'AI Insights',
  editor:      'Editor',
  settings:    'Settings',
};
```

- [ ] **Step 3: Add nav cases to the render block**

In the `<main>` block (around line 86), add the two new cases alongside the existing ones:

```tsx
{activeNav === 'comparison' && <ComparisonView posts={posts} />}
{activeNav === 'captions'   && <CaptionView />}
```

Full updated `<main>` block:

```tsx
<main className="flex-1 overflow-y-auto">
  {activeNav === 'dashboard'  && <DashboardView posts={posts} />}
  {activeNav === 'content'    && <ContentView posts={posts} onUpload={handleUpload} onPostUpdate={handlePostUpdate} />}
  {activeNav === 'analytics'  && <AnalyticsView posts={posts} />}
  {activeNav === 'platforms'  && <PlatformsView posts={posts} />}
  {activeNav === 'comparison' && <ComparisonView posts={posts} />}
  {activeNav === 'captions'   && <CaptionView />}
  {activeNav === 'insights'   && <AIInsightsView posts={posts} />}
  {activeNav === 'editor'     && <EditorView />}
  {activeNav === 'settings'   && <SettingsView onClearData={handleClearData} />}
</main>
```

> Note: `onPostUpdate` on `ContentView` and `handlePostUpdate` don't exist yet — add them in Task 9. TypeScript will complain until then.

- [ ] **Step 4: Add handlePostUpdate handler**

After `handleUpload` (around line 66), add:

```tsx
const handlePostUpdate = (postId: string, contentType: string | undefined) => {
  setPosts((prev) =>
    prev.map((p) => p.id === postId ? { ...p, content_type: contentType } : p)
  );
};
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected errors at this point: missing `CaptionView` module (until Task 10), and `onPostUpdate` prop on `ContentView` (until Task 9). All other errors should be zero.

---

### Task 3: Wire GoalsSection into DashboardView

**Files:**
- Modify: `src/components/views/DashboardView.tsx`

- [ ] **Step 1: Add GoalsSection import**

After the existing imports (line 7), add:

```tsx
import GoalsSection from '@/components/GoalsSection';
```

- [ ] **Step 2: Render GoalsSection between metric cards and chart**

Find the comment `{/* Views line chart */}` (line 181). Insert `<GoalsSection>` immediately before it:

```tsx
        </div>

        {/* Goals */}
        <GoalsSection posts={filteredPosts} />

        {/* Views line chart */}
        <ViewsLineChart posts={filteredPosts} activePlatforms={activePlatforms} rangeLabel={selectedRange.label} />
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero new errors from this change.

---

### Task 4: Wire BestTimeCard into AnalyticsView

**Files:**
- Modify: `src/components/views/AnalyticsView.tsx`

- [ ] **Step 1: Add BestTimeCard import**

After the existing imports (line 6), add:

```tsx
import BestTimeCard from '@/components/BestTimeCard';
```

- [ ] **Step 2: Render BestTimeCard below the charts grid**

Find `{/* Engagement breakdown table */}` (line 136). Insert `<BestTimeCard>` immediately before it:

```tsx
      {/* Best time to post */}
      <BestTimeCard posts={filtered} />

      {/* Engagement breakdown table */}
```

- [ ] **Step 3: Type-check and build**

```bash
npx tsc --noEmit && npm run build
```

Expected: build passes (ignoring CaptionView and onPostUpdate errors from Tasks 2 and 9 — those are in-progress stubs).

> **If you deferred CaptionView import in Task 2 Step 1:** build should pass cleanly at this point. Verify in browser: open Analytics page, scroll down past charts — BestTimeCard heatmap should appear. Open Dashboard — GoalsSection should appear below metric cards.

- [ ] **Step 4: Commit**

```bash
git add src/components/Sidebar.tsx src/app/page.tsx src/components/views/DashboardView.tsx src/components/views/AnalyticsView.tsx
git commit -m "feat: wire GoalsSection, BestTimeCard, ComparisonView, and Captions nav"
```

---

## Chunk 2: CSV Export

Add an Export CSV button to the Analytics page that downloads the currently filtered posts.

---

### Task 5: Add CSV export to AnalyticsView

**Files:**
- Modify: `src/components/views/AnalyticsView.tsx`

- [ ] **Step 1: Add the export utility function**

After the `filterByDateRange` function (around line 26), add:

```tsx
function exportToCSV(posts: UnifiedPost[]): void {
  const headers = ['date', 'platform', 'title', 'views', 'likes', 'comments', 'shares', 'saves', 'content_type'];
  const rows = posts.map((p) => [
    p.date,
    p.platform,
    // Wrap title in quotes and escape inner quotes
    `"${p.title.replace(/"/g, '""')}"`,
    p.views,
    p.likes,
    p.comments,
    p.shares,
    p.saves,
    p.content_type ?? '',
  ]);
  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `clip-studio-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Add the Export CSV button to the controls bar**

Find the closing `</div>` of the controls bar (line 116 — the one that closes the outer `<div className="flex items-center gap-3 flex-wrap">`). Insert the export button just before it, using `ml-auto` to push it to the far right:

```tsx
        {/* Export */}
        <button
          onClick={() => exportToCSV(filtered)}
          disabled={filtered.length === 0}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-white/[0.08] text-[var(--text-2)] hover:text-[var(--text-1)] hover:border-white/[0.15] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export CSV
        </button>
```

- [ ] **Step 3: Type-check and build**

```bash
npx tsc --noEmit && npm run build
```

Expected: clean (unless CaptionView stub still pending — that error is expected until Chunk 4).

- [ ] **Step 4: Browser smoke test**

Start dev server: `npm run dev`. Go to Analytics. Select a date range. Click Export CSV. Verify a `.csv` file downloads with the correct columns and data. Verify button is disabled when no posts match the filter.

- [ ] **Step 5: Commit**

```bash
git add src/components/views/AnalyticsView.tsx
git commit -m "feat: add CSV export to Analytics page"
```

---

## Chunk 3: Content Type Tagging

Add a color-coded content type badge to every row in TopPostsTable with inline editing via a dropdown.

> **Prerequisite:** Run this SQL in your Supabase dashboard before proceeding:
> ```sql
> ALTER TABLE posts ADD COLUMN content_type text;
> ```
> The TypeScript type (`content_type?: string` on `UnifiedPost`) already exists — this just adds the column to the DB.

---

### Task 6: Update TopPostsTable with content type badge + inline dropdown

**Files:**
- Modify: `src/components/TopPostsTable.tsx`

- [ ] **Step 1: Add imports and constants**

Replace the top of `TopPostsTable.tsx` (lines 1–7) with:

```tsx
'use client';

import { useState } from 'react';
import { CONTENT_TYPES, PLATFORM_COLORS, PLATFORM_LABELS, UnifiedPost } from '@/types';
import { updatePostContentType } from '@/lib/db';

const CONTENT_TYPE_COLORS: Record<string, string> = {
  'Hook Video':   '#d4922a',
  'Tutorial':     '#3b82f6',
  'UGC Style':    '#a855f7',
  'Talking Head': '#22c55e',
  'B-Roll':       '#f97316',
  'Podcast Clip': '#ec4899',
  'Text Post':    '#14b8a6',
  'Other':        '#6b7280',
};

interface Props {
  posts: UnifiedPost[];
  onContentTypeChange?: (postId: string, contentType: string | undefined) => void;
}
```

- [ ] **Step 2: Update the component signature and add dropdown state**

Replace line 15 (`export default function TopPostsTable({ posts }: Props) {`) with:

```tsx
export default function TopPostsTable({ posts, onContentTypeChange }: Props) {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const handleTypeSelect = async (post: UnifiedPost, type: string) => {
    setOpenDropdown(null);
    setSaving(post.id);
    const previousType = post.content_type; // capture before optimistic update
    onContentTypeChange?.(post.id, type);
    try {
      await updatePostContentType(post.platform, post.title, post.date, type);
    } catch {
      // Revert to previous value (may be undefined — restores '—' badge state)
      onContentTypeChange?.(post.id, previousType);
    } finally {
      setSaving(null);
    }
  };
```

- [ ] **Step 3: Add the content_type column header**

In the `<thead>` row, after the `Eng. Rate` `<th>` (line 35), add:

```tsx
              <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-[0.16em]">Type</th>
```

Also update the `colSpan` in the empty state row from `6` to `7`:

```tsx
<td colSpan={7} className="px-5 py-10 text-center text-[var(--text-2)] text-sm">No posts yet</td>
```

- [ ] **Step 4: Add the content_type badge cell to each row**

After the engagement rate `<td>` (closing at line 78), add a new `<td>` as the last cell in each row:

```tsx
                <td className="px-5 py-3.5 relative">
                  <button
                    onClick={() => setOpenDropdown(openDropdown === post.id ? null : post.id)}
                    disabled={saving === post.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border transition-all disabled:opacity-50"
                    style={
                      post.content_type
                        ? {
                            background: `${CONTENT_TYPE_COLORS[post.content_type] ?? '#6b7280'}18`,
                            borderColor: `${CONTENT_TYPE_COLORS[post.content_type] ?? '#6b7280'}40`,
                            color: CONTENT_TYPE_COLORS[post.content_type] ?? '#6b7280',
                          }
                        : { borderColor: 'rgba(255,255,255,0.06)', color: 'var(--text-3)' }
                    }
                  >
                    {post.content_type ?? '—'}
                  </button>
                  {openDropdown === post.id && (
                    <div className="absolute right-0 top-full mt-1 z-50 bg-[var(--bg-elevated)] border border-white/[0.08] rounded-xl shadow-xl overflow-hidden py-1 w-36">
                      {CONTENT_TYPES.map((type) => (
                        <button
                          key={type}
                          onClick={() => handleTypeSelect(post, type)}
                          className="w-full text-left px-3.5 py-2 text-[11px] text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-white/[0.04] transition-colors"
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  )}
                </td>
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero new errors from this file.

---

### Task 7: Thread onPostUpdate through ContentView and page.tsx

**Files:**
- Modify: `src/components/views/ContentView.tsx`
- Modify: `src/app/page.tsx` (handler already added in Task 2 Step 4)

- [ ] **Step 1: Update ContentView Props interface**

Replace the `Props` interface in `ContentView.tsx` (lines 7–10):

```tsx
interface Props {
  posts: UnifiedPost[];
  onUpload: (posts: UnifiedPost[]) => void;
  onPostUpdate: (postId: string, contentType: string | undefined) => void;
}
```

- [ ] **Step 2: Update ContentView function signature and TopPostsTable call**

Replace line 18 (`export default function ContentView({ posts, onUpload }: Props) {`):

```tsx
export default function ContentView({ posts, onUpload, onPostUpdate }: Props) {
```

Replace line 71 (`<TopPostsTable posts={posts} />`):

```tsx
      <TopPostsTable posts={posts} onContentTypeChange={onPostUpdate} />
```

- [ ] **Step 3: Type-check and build**

```bash
npx tsc --noEmit && npm run build
```

Expected: clean (still excluding CaptionView if deferred to Chunk 4).

- [ ] **Step 4: Browser smoke test**

`npm run dev`. Go to Content page. Click any `—` or existing badge in the Type column. Dropdown should appear with 8 types. Select one — badge updates immediately (optimistic). Reload page — if Supabase migration ran, the type persists. If Supabase hasn't been migrated yet, the column update will fail silently (row reverts to `—`).

- [ ] **Step 5: Commit**

```bash
git add src/components/TopPostsTable.tsx src/components/views/ContentView.tsx src/app/page.tsx
git commit -m "feat: content type badges with inline editing in TopPostsTable"
```

---

## Chunk 4: AI Caption Generator

Build the Caption Generator page from scratch.

> **Prerequisite:** If `captions` table doesn't exist in Supabase, run:
> ```sql
> CREATE TABLE IF NOT EXISTS captions (
>   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
>   created_at timestamptz DEFAULT now(),
>   clip_description text,
>   platform text,
>   tone text,
>   caption_text text
> );
> ```

---

### Task 8: Create CaptionView.tsx

**Files:**
- Create: `src/components/views/CaptionView.tsx`

- [ ] **Step 1: Create the file with the full component**

Create `src/components/views/CaptionView.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { CaptionRow, fetchCaptions, saveCaption } from '@/lib/db';

const PLATFORMS = ['TikTok', 'Instagram', 'LinkedIn', 'X', 'YouTube'] as const;
type CaptionPlatform = typeof PLATFORMS[number];

const TONES = ['Engaging', 'Professional', 'Casual', 'Viral'] as const;
type CaptionTone = typeof TONES[number];

const PLATFORM_CHAR_LIMITS: Record<CaptionPlatform, number> = {
  TikTok:    2200,
  Instagram: 2200,
  LinkedIn:  3000,
  X:         280,
  YouTube:   5000,
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function CaptionView() {
  const [description, setDescription] = useState('');
  const [platform, setPlatform] = useState<CaptionPlatform>('TikTok');
  const [tone, setTone] = useState<CaptionTone>('Engaging');
  const [generating, setGenerating] = useState(false);
  const [caption, setCaption] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [history, setHistory] = useState<CaptionRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    const key =
      typeof window !== 'undefined'
        ? (localStorage.getItem('clip_studio_anthropic_key') ?? '')
        : '';
    setApiKey(key);
    fetchCaptions()
      .then(setHistory)
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, []);

  const generate = async () => {
    if (!description.trim() || !apiKey || generating) return;
    setGenerating(true);
    setError('');
    setSaveError('');
    setCaption('');
    try {
      const system = `You are a social media caption writer. Write a single caption for a ${platform} post. Tone: ${tone}. The clip: ${description}. Requirements: Platform-native voice, relevant hashtags, within ${PLATFORM_CHAR_LIMITS[platform]} characters. Output only the caption text with hashtags — no explanation, no quotes.`;
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 512,
          system,
          messages: [{ role: 'user', content: description }],
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `API error ${res.status}`);
      }
      const json = await res.json();
      const text: string = (json.content as Array<{ type: string; text: string }>)?.[0]?.text ?? '';
      setCaption(text);
      try {
        await saveCaption({ clip_description: description, platform, tone, caption_text: text });
        const updated = await fetchCaptions();
        setHistory(updated);
      } catch {
        setSaveError('Caption generated but could not be saved to history.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(caption);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const noKey = !apiKey;

  return (
    <div className="p-5 max-w-3xl space-y-5">
      {/* Generator card */}
      <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl p-5 space-y-4">
        <h2 className="text-[15px] font-semibold text-[var(--text-1)]">Caption Generator</h2>

        {noKey && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[12px] text-amber-400">
            No API key found. Enter your Anthropic key in <strong>AI Insights</strong> first — it&apos;s shared across all AI features.
          </div>
        )}

        {/* Description */}
        <div>
          <label className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-[0.16em] mb-2 block">
            Clip Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your clip — what happens, the vibe, key moments"
            rows={3}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-3 text-sm text-[var(--text-1)] placeholder-[var(--text-3)] focus:outline-none focus:border-[var(--gold-border)] resize-none transition-colors"
          />
        </div>

        {/* Platform */}
        <div>
          <label className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-[0.16em] mb-2 block">
            Platform
          </label>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => (
              <button
                key={p}
                onClick={() => setPlatform(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  platform === p
                    ? 'bg-[var(--gold-dim)] border-[var(--gold-border)] text-[var(--gold)]'
                    : 'border-white/[0.08] text-[var(--text-2)] hover:text-[var(--text-1)] hover:border-white/[0.15]'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Tone */}
        <div>
          <label className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-[0.16em] mb-2 block">
            Tone
          </label>
          <div className="flex flex-wrap gap-2">
            {TONES.map((t) => (
              <button
                key={t}
                onClick={() => setTone(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  tone === t
                    ? 'bg-[var(--gold-dim)] border-[var(--gold-border)] text-[var(--gold)]'
                    : 'border-white/[0.08] text-[var(--text-2)] hover:text-[var(--text-1)] hover:border-white/[0.15]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Generate button */}
        <button
          onClick={generate}
          disabled={generating || !description.trim() || noKey}
          className="px-4 py-2 rounded-xl text-sm font-semibold bg-[var(--gold)] text-[var(--bg-base)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {generating ? 'Generating…' : 'Generate Caption'}
        </button>

        {error && (
          <p className="text-[12px] text-red-400">{error}</p>
        )}

        {/* Output */}
        {caption && (
          <div className="space-y-2">
            <div className="relative">
              <pre className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-3 text-sm text-[var(--text-1)] whitespace-pre-wrap font-sans leading-relaxed pr-16">
                {caption}
              </pre>
              <button
                onClick={copy}
                className="absolute top-2 right-2 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white/[0.08] text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            {saveError && (
              <p className="text-[11px] text-red-400">{saveError}</p>
            )}
          </div>
        )}
      </div>

      {/* History */}
      <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.05]">
          <h3 className="text-[15px] font-semibold text-[var(--text-1)]">History</h3>
          <p className="text-[11px] text-[var(--text-3)] mt-0.5">Last 10 captions</p>
        </div>
        {historyLoading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-5 h-5 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : history.length === 0 ? (
          <div className="px-5 py-10 text-center text-[var(--text-2)] text-sm">
            No captions generated yet
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {history.map((c) => (
              <div key={c.id} className="px-5 py-4 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-[var(--gold-dim)] text-[var(--gold)] border border-[var(--gold-border)]">
                    {c.platform}
                  </span>
                  <span className="text-[10px] text-[var(--text-3)] border border-white/[0.06] px-2 py-0.5 rounded-md">
                    {c.tone}
                  </span>
                  <span className="text-[10px] text-[var(--text-3)] ml-auto">
                    {timeAgo(c.created_at)}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-3)] truncate">{c.clip_description}</p>
                <p className="text-[13px] text-[var(--text-1)] leading-snug whitespace-pre-wrap">
                  {c.caption_text}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

---

### Task 9: Wire CaptionView into page.tsx (if deferred from Task 2)

**Files:**
- Modify: `src/app/page.tsx` (only if you deferred the CaptionView import in Task 2)

- [ ] **Step 1: Add CaptionView import if not already present**

After line 15 (`import SettingsView from '@/components/views/SettingsView';`), ensure this line exists:

```tsx
import CaptionView from '@/components/views/CaptionView';
```

- [ ] **Step 2: Full build and smoke test**

```bash
npm run build
```

Expected: clean build with zero errors and zero ESLint violations.

Then `npm run dev`:
1. **Captions nav item** appears in sidebar under Tools, before AI Insights, with AI badge
2. **Comparison nav item** appears in sidebar under Analytics
3. **Dashboard** — GoalsSection visible below metric cards
4. **Analytics** — BestTimeCard heatmap visible below charts; Export CSV button visible in controls bar
5. **Content** — Type column visible in TopPostsTable; clicking badge shows dropdown
6. **Caption Generator** — form renders, no-key warning if Anthropic key not set; generate works when key present

- [ ] **Step 3: Commit**

```bash
git add src/components/views/CaptionView.tsx src/app/page.tsx
git commit -m "feat: add AI Caption Generator page with Supabase history"
```

---

## Final Checklist

- [ ] `npm run build` passes clean (zero ESLint errors, zero TypeScript errors)
- [ ] Supabase Migration 1 run: `ALTER TABLE posts ADD COLUMN content_type text`
- [ ] Supabase Migration 2 run (if needed): `CREATE TABLE IF NOT EXISTS captions (...)`
- [ ] All 6 features verified in browser:
  - [ ] Goals section on Dashboard
  - [ ] Best Time to Post heatmap on Analytics
  - [ ] Comparison page accessible from sidebar
  - [ ] Export CSV button on Analytics downloads correct file
  - [ ] Content type badges in Content page with inline editing
  - [ ] Caption Generator page generates + saves captions
