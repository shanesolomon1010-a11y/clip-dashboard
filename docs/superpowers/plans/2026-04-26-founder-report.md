# Founder Report Tab Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Founder Report" tab with YouTube channel-level metrics (published counts, subscribers gained, watch time) and restructure the sidebar into Analytics/Workspace groups.

**Architecture:** New API route calls YouTube Data API + YouTube Analytics API server-side using existing `getAccessToken()` from `src/lib/youtube.ts`. FounderReportView fetches from that route on mount and on window toggle, displaying 5 metric cards with a loading skeleton and error banner.

**Tech Stack:** Next.js 14 App Router (API route + RSC), React (client component), YouTube Data API v3, YouTube Analytics API v2, Tailwind CSS.

---

## File Map

| Action | File | What changes |
|--------|------|--------------|
| Modify | `src/components/Icons.tsx` | Add `IconFounderReport` SVG |
| Modify | `src/components/Sidebar.tsx` | Add `founder-report` to NavSection, NAV_ITEMS, restructure NAV_GROUPS, remove commented social-copy line |
| Modify | `src/app/page.tsx` | Add `founder-report` to VALID_NAV_SECTIONS, import + render FounderReportView |
| Create | `src/app/api/founder-report/route.ts` | GET handler: fetch YouTube uploads + analytics data |
| Create | `src/components/views/FounderReportView.tsx` | View with window toggle, 5 metric cards, skeleton, error banner |

---

## Task 1: Add IconFounderReport to Icons.tsx

**Files:**
- Modify: `src/components/Icons.tsx` (append after existing exports)

- [ ] **Step 1: Append the new icon**

Add this after the last icon in `src/components/Icons.tsx`:

```tsx
export function IconFounderReport({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="12" height="12" rx="2" />
      <path d="M5 10l2-3 2 2 2-4" />
    </svg>
  );
}
```

---

## Task 2: Restructure Sidebar

**Files:**
- Modify: `src/components/Sidebar.tsx`

The existing Sidebar has one `NAV_GROUPS` entry called "Analytics" with all items lumped together. The social-copy commented line in `NAV_ITEMS` (line 16) must be deleted. Two groups replace the single group.

- [ ] **Step 1: Update the import line**

Change the Icons import to add `IconFounderReport` and remove `IconSocialCopy` (since social-copy is being fully removed from sidebar — the underlying file stays):

```tsx
import { IconDashboard, IconContent, IconAnalytics, IconPlatforms, IconSettings, IconUpload, IconSparkles, IconScissors, IconComparison, IconScriptAnalyzer, IconTranscriber, IconCalendar, IconLibrary, IconFounderReport } from './Icons';
```

- [ ] **Step 2: Update NavSection type** — add `'founder-report'`:

```tsx
export type NavSection = 'dashboard' | 'content' | 'schedule' | 'analytics' | 'platforms' | 'comparison' | 'captions' | 'insights' | 'scriptAnalyzer' | 'transcriber' | 'editor' | 'settings' | 'library' | 'social-copy' | 'founder-report';
```

- [ ] **Step 3: Replace NAV_ITEMS array** — add founder-report entry, delete the commented social-copy line entirely:

```tsx
const NAV_ITEMS: { id: NavSection; label: string; icon: React.ReactNode; badge?: string }[] = [
  { id: 'dashboard',       label: 'Dashboard',         icon: <IconDashboard       className="w-4 h-4" /> },
  { id: 'content',         label: 'Content',            icon: <IconContent         className="w-4 h-4" /> },
  { id: 'schedule',        label: 'Posting Schedule',   icon: <IconCalendar        className="w-4 h-4" /> },
  { id: 'analytics',       label: 'Analytics',          icon: <IconAnalytics       className="w-4 h-4" /> },
  { id: 'founder-report',  label: 'Founder Report',     icon: <IconFounderReport   className="w-4 h-4" /> },
  { id: 'platforms',       label: 'Platforms',          icon: <IconPlatforms       className="w-4 h-4" /> },
  { id: 'comparison',      label: 'Comparison',         icon: <IconComparison      className="w-4 h-4" /> },
  { id: 'captions',        label: 'Captions',           icon: <IconSparkles        className="w-4 h-4" />, badge: 'AI' },
  { id: 'insights',        label: 'Insights',           icon: <IconSparkles        className="w-4 h-4" />, badge: 'AI' },
  { id: 'transcriber',     label: 'Transcriber',        icon: <IconTranscriber     className="w-4 h-4" />, badge: 'AI' },
  { id: 'scriptAnalyzer',  label: 'Script Analyzer',    icon: <IconScriptAnalyzer  className="w-4 h-4" />, badge: 'AI' },
  { id: 'editor',          label: 'Editor',             icon: <IconScissors        className="w-4 h-4" />, badge: 'AI' },
  { id: 'library',         label: 'Library',            icon: <IconLibrary         className="w-4 h-4" /> },
  { id: 'settings',        label: 'Settings',           icon: <IconSettings        className="w-4 h-4" /> },
];
```

- [ ] **Step 4: Replace NAV_GROUPS** — two groups, exact ordering as spec:

```tsx
const NAV_GROUPS = [
  { label: 'Analytics', items: ['dashboard', 'analytics', 'founder-report'] },
  { label: 'Workspace', items: ['schedule', 'insights', 'library', 'settings'] },
];
```

---

## Task 3: Wire FounderReportView in page.tsx

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add to VALID_NAV_SECTIONS**

```tsx
const VALID_NAV_SECTIONS = new Set<NavSection>([
  'dashboard', 'content', 'schedule', 'analytics', 'platforms',
  'comparison', 'captions', 'scriptAnalyzer', 'transcriber', 'insights',
  'editor', 'settings', 'library', 'social-copy', 'founder-report',
]);
```

- [ ] **Step 2: Add import** (after existing view imports):

```tsx
import FounderReportView from '@/components/views/FounderReportView';
```

- [ ] **Step 3: Add render condition** (after the `insights` render, before `social-copy`):

```tsx
{activeNav === 'founder-report' && <FounderReportView />}
```

---

## Task 4: Create the API route

**Files:**
- Create: `src/app/api/founder-report/route.ts`

The route must:
1. Get an access token via `getAccessToken()` from `src/lib/youtube.ts`
2. Fetch the channel's uploads playlist ID
3. Page through playlistItems to find videos published within the window
4. Batch-call videos.list for duration; classify ≤ 60s → Shorts, > 60s → long-form
5. Call YouTube Analytics API for subscribersGained (whole channel, no filter)
6. Call YouTube Analytics API for estimatedMinutesWatched filtered by `creatorContentType==VIDEO_ON_DEMAND` (long-form)
7. Call YouTube Analytics API for estimatedMinutesWatched filtered by `creatorContentType==SHORTS`
8. Handle 403 from Analytics API: return `{ error: "..." }` with status 200 (NOT 4xx), so the UI can display it cleanly

Date helpers: `toYMD(d)` formats a Date as `YYYY-MM-DD`.

```typescript
import { NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/youtube';

interface PlaylistItemsResponse {
  nextPageToken?: string;
  items?: {
    snippet: {
      publishedAt: string;
      resourceId: { videoId: string };
    };
  }[];
}

interface VideosListResponse {
  items?: {
    id: string;
    contentDetails: { duration: string };
  }[];
}

interface AnalyticsReportResponse {
  rows?: (string | number)[][];
  error?: { message: string; code?: number };
}

function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseDurationSeconds(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (Number(m[1] ?? 0) * 3600) + (Number(m[2] ?? 0) * 60) + Number(m[3] ?? 0);
}

async function getUploadsPlaylistId(accessToken: string): Promise<string> {
  const url = new URL('https://www.googleapis.com/youtube/v3/channels');
  url.searchParams.set('part', 'contentDetails');
  url.searchParams.set('mine', 'true');
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json() as {
    items?: { contentDetails: { relatedPlaylists: { uploads: string } } }[];
    error?: { message: string };
  };
  if (!res.ok || !data.items?.[0]) {
    throw new Error(`channels.list failed: ${data.error?.message ?? res.status}`);
  }
  return data.items[0].contentDetails.relatedPlaylists.uploads;
}

async function fetchRecentVideoIds(
  playlistId: string,
  windowStart: Date,
  accessToken: string,
): Promise<string[]> {
  const videoIds: string[] = [];
  let pageToken: string | undefined;

  outer: do {
    const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    url.searchParams.set('playlistId', playlistId);
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('maxResults', '50');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json() as PlaylistItemsResponse;

    for (const item of data.items ?? []) {
      const published = new Date(item.snippet.publishedAt);
      if (published < windowStart) break outer;
      videoIds.push(item.snippet.resourceId.videoId);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return videoIds;
}

async function classifyVideos(
  videoIds: string[],
  accessToken: string,
): Promise<{ longForms: number; shorts: number }> {
  if (videoIds.length === 0) return { longForms: 0, shorts: 0 };

  // videos.list accepts up to 50 ids per call
  const chunks: string[][] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    chunks.push(videoIds.slice(i, i + 50));
  }

  let longForms = 0;
  let shorts = 0;

  for (const chunk of chunks) {
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('id', chunk.join(','));
    url.searchParams.set('part', 'contentDetails');
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json() as VideosListResponse;
    for (const item of data.items ?? []) {
      const sec = parseDurationSeconds(item.contentDetails.duration);
      if (sec <= 60) shorts++;
      else longForms++;
    }
  }

  return { longForms, shorts };
}

async function fetchAnalyticsMetric(
  metric: string,
  startDate: string,
  endDate: string,
  accessToken: string,
  filter?: string,
): Promise<number | { scopeError: true }> {
  const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
  url.searchParams.set('ids', 'channel==MINE');
  url.searchParams.set('startDate', startDate);
  url.searchParams.set('endDate', endDate);
  url.searchParams.set('metrics', metric);
  if (filter) url.searchParams.set('filters', filter);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 403) return { scopeError: true };

  const data = await res.json() as AnalyticsReportResponse;
  if (!res.ok) {
    throw new Error(`YouTube Analytics API error: ${data.error?.message ?? res.status}`);
  }

  const value = data.rows?.[0]?.[0];
  return value !== undefined ? Number(value) : 0;
}

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const windowDays = searchParams.get('window') === '30' ? 30 : 7;

  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - windowDays);

  const startDate = toYMD(windowStart);
  const endDate = toYMD(now);

  try {
    const accessToken = await getAccessToken();

    const uploadsPlaylistId = await getUploadsPlaylistId(accessToken);
    const videoIds = await fetchRecentVideoIds(uploadsPlaylistId, windowStart, accessToken);
    const { longForms: longFormsPublished, shorts: shortsPublished } = await classifyVideos(videoIds, accessToken);

    const subscribersResult = await fetchAnalyticsMetric(
      'subscribersGained', startDate, endDate, accessToken,
    );
    if (typeof subscribersResult === 'object' && subscribersResult.scopeError) {
      return NextResponse.json({
        error: 'YouTube Analytics scope not authorized — channel owner needs to re-authorize OAuth with yt-analytics.readonly scope',
      });
    }

    const longFormWatchResult = await fetchAnalyticsMetric(
      'estimatedMinutesWatched', startDate, endDate, accessToken, 'creatorContentType==VIDEO_ON_DEMAND',
    );
    if (typeof longFormWatchResult === 'object' && longFormWatchResult.scopeError) {
      return NextResponse.json({
        error: 'YouTube Analytics scope not authorized — channel owner needs to re-authorize OAuth with yt-analytics.readonly scope',
      });
    }

    const shortsWatchResult = await fetchAnalyticsMetric(
      'estimatedMinutesWatched', startDate, endDate, accessToken, 'creatorContentType==SHORTS',
    );
    if (typeof shortsWatchResult === 'object' && shortsWatchResult.scopeError) {
      return NextResponse.json({
        error: 'YouTube Analytics scope not authorized — channel owner needs to re-authorize OAuth with yt-analytics.readonly scope',
      });
    }

    return NextResponse.json({
      longFormsPublished,
      shortsPublished,
      newSubscribers: subscribersResult,
      longFormWatchTimeHours: Math.round((longFormWatchResult as number) / 60 * 10) / 10,
      shortsWatchTimeHours: Math.round((shortsWatchResult as number) / 60 * 10) / 10,
      windowDays,
      generatedAt: now.toISOString(),
    });
  } catch (err) {
    console.error('[founder-report]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
```

---

## Task 5: Create FounderReportView

**Files:**
- Create: `src/components/views/FounderReportView.tsx`

The view fetches from `/api/founder-report?window=7|30` on mount and whenever the selected window changes.

Toggle styling matches AnalyticsView: gold background + dark text for active, muted background + `var(--text-3)` for inactive.

Card styling matches Dashboard summary cards: `bg-[var(--bg-card)] border border-white/[0.05] rounded-2xl`.

```tsx
'use client';

import { useEffect, useState } from 'react';

interface FounderReportData {
  longFormsPublished: number;
  shortsPublished: number;
  newSubscribers: number;
  longFormWatchTimeHours: number;
  shortsWatchTimeHours: number;
  windowDays: number;
  generatedAt: string;
}

interface FounderReportResponse extends Partial<FounderReportData> {
  error?: string;
}

function SkeletonCard() {
  return (
    <div className="bg-[var(--bg-card)] border border-white/[0.05] rounded-2xl p-6 animate-pulse">
      <div className="h-9 w-24 rounded-lg bg-white/[0.06] mb-3" />
      <div className="h-3.5 w-36 rounded bg-white/[0.04]" />
    </div>
  );
}

interface MetricCardProps {
  value: number;
  label: string;
  suffix?: string;
}

function MetricCard({ value, label, suffix = '' }: MetricCardProps) {
  const formatted = value % 1 === 0
    ? value.toLocaleString()
    : value.toFixed(1);

  return (
    <div className="bg-[var(--bg-card)] border border-white/[0.05] rounded-2xl p-6">
      <p className="text-[36px] font-bold text-[var(--text-1)] leading-none tabular-nums">
        {formatted}{suffix}
      </p>
      <p className="text-[13px] text-[var(--text-3)] mt-2">{label}</p>
    </div>
  );
}

export default function FounderReportView() {
  const [window, setWindow] = useState<7 | 30>(7);
  const [data, setData] = useState<FounderReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setData(null);

    fetch(`/api/founder-report?window=${window}`)
      .then((r) => r.json() as Promise<FounderReportResponse>)
      .then((json) => {
        if (json.error) {
          setError(json.error);
        } else {
          setData(json as FounderReportData);
          setLastUpdated(new Date());
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      })
      .finally(() => setLoading(false));
  }, [window]);

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[22px] font-bold text-[var(--text-1)] leading-tight">
          Founder Report
        </h1>
        <p className="text-[13px] text-[var(--text-3)] mt-1">
          Channel-level performance for stakeholder reporting
        </p>
      </div>

      {/* Window toggle */}
      <div className="flex gap-1 mb-8">
        {([7, 30] as const).map((w) => (
          <button
            key={w}
            onClick={() => setWindow(w)}
            className="px-4 py-1.5 rounded-lg text-[13px] font-medium border transition-all"
            style={{
              background: window === w ? 'var(--gold)' : 'rgba(247,231,206,0.04)',
              color: window === w ? '#000' : 'var(--text-3)',
              borderColor: window === w ? 'transparent' : 'rgba(247,231,206,0.08)',
            }}
          >
            {w} Days
          </button>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-[13px] text-red-400">
          {error}
        </div>
      )}

      {/* Metric grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : data ? (
          <>
            <MetricCard value={data.longFormsPublished} label="YouTube Long Forms Published" />
            <MetricCard value={data.shortsPublished}    label="YouTube Shorts Published" />
            <MetricCard value={data.newSubscribers}     label="New Subscribers" />
            <MetricCard value={data.longFormWatchTimeHours} label="Long-form Watch Time" suffix=" hrs" />
            <MetricCard value={data.shortsWatchTimeHours}   label="Shorts Watch Time" suffix=" hrs" />
          </>
        ) : null}
      </div>

      {/* Footer */}
      {lastUpdated && !loading && (
        <p className="mt-6 text-[11px] text-[var(--text-3)]">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
```

---

## Task 6: Type-check and build

- [ ] **Step 1: Run type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors. If errors appear, fix them before continuing.

- [ ] **Step 2: Run full build**

```bash
npm run build
```

Expected: Build completes with no errors or warnings (treat warnings as errors if they relate to new code).

---

## Task 7: Commit and push

- [ ] **Step 1: Stage files**

```bash
git add src/components/Icons.tsx \
        src/components/Sidebar.tsx \
        src/app/page.tsx \
        src/app/api/founder-report/route.ts \
        src/components/views/FounderReportView.tsx
```

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: add Founder Report tab and reorganize sidebar into Analytics/Workspace groups

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Push**

```bash
git push
```
