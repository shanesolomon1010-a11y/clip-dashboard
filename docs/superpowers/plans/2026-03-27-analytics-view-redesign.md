# Analytics View Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fully redesign AnalyticsView with a dynamic multi-metric selector, platform/time-axis controls, multi-line chart with per-metric Y-axes, and a sortable clip table.

**Architecture:** Full rewrite of `AnalyticsView.tsx` with all filter state local to the component. Add `getPosts()` to `db.ts` with a shared row-mapper extracted from `fetchAllPosts`. No new child component files needed.

**Tech Stack:** React hooks, TypeScript, Recharts (LineChart), Tailwind CSS, Supabase via db.ts

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/db.ts` | Modify | Extract row-mapper helper; add `getPosts()` |
| `src/components/views/AnalyticsView.tsx` | Full rewrite | All 5 sections + metric config constants |

---

## Chunk 1: db.ts — add getPosts()

### Task 1: Extract row mapper and add getPosts()

**Files:**
- Modify: `src/lib/db.ts` (lines 103–155)

**Context:** `fetchAllPosts` has an inline row-mapping block. Extract it to `mapPostRow(row)` so `getPosts` can reuse it without duplication.

- [ ] **Step 1: Read the current db.ts**

  Confirm the row-mapping block in `fetchAllPosts` (lines 111–153). You will extract this into a standalone function called `mapPostRow`.

- [ ] **Step 2: Add mapPostRow helper and getPosts function**

  Insert the following block immediately before `fetchAllPosts` (around line 103):

  ```typescript
  function mapPostRow(row: Record<string, unknown>): UnifiedPost {
    const views = Number(row.views ?? 0);
    const likes = Number(row.likes ?? 0);
    const comments = Number(row.comments ?? 0);
    const shares = Number(row.shares ?? 0);
    const saves = Number(row.saves ?? 0);
    return {
      id: row.id as string,
      clip_code: row.clip_code as string | undefined,
      platform: row.platform as Platform,
      date: (row.posted_at as string ?? '').slice(0, 10),
      title: row.title as string,
      views,
      likes,
      comments,
      shares,
      saves,
      engagementRate: calcEngagementRate(views, likes, comments, shares, saves),
      content_type: row.content_type as string | undefined,
      url: row.url as string | undefined,
      thumbnail_url: row.thumbnail_url as string | undefined,
      watch_time_minutes: row.watch_time_minutes != null ? Number(row.watch_time_minutes) : undefined,
      avg_view_duration_seconds: row.avg_view_duration_seconds != null ? Number(row.avg_view_duration_seconds) : undefined,
      avg_view_percentage: row.avg_view_percentage != null ? Number(row.avg_view_percentage) : undefined,
      impressions: row.impressions != null ? Number(row.impressions) : undefined,
      impression_ctr: row.impression_ctr != null ? Number(row.impression_ctr) : undefined,
      dislikes: row.dislikes != null ? Number(row.dislikes) : undefined,
      subscribers_gained: row.subscribers_gained != null ? Number(row.subscribers_gained) : undefined,
      subscribers_lost: row.subscribers_lost != null ? Number(row.subscribers_lost) : undefined,
      card_clicks: row.card_clicks != null ? Number(row.card_clicks) : undefined,
      card_ctr: row.card_ctr != null ? Number(row.card_ctr) : undefined,
      end_screen_clicks: row.end_screen_clicks != null ? Number(row.end_screen_clicks) : undefined,
      end_screen_ctr: row.end_screen_ctr != null ? Number(row.end_screen_ctr) : undefined,
      plays: row.plays != null ? Number(row.plays) : undefined,
      reach: row.reach != null ? Number(row.reach) : undefined,
      profile_visits: row.profile_visits != null ? Number(row.profile_visits) : undefined,
      follows: row.follows != null ? Number(row.follows) : undefined,
      accounts_reached: row.accounts_reached != null ? Number(row.accounts_reached) : undefined,
      accounts_engaged: row.accounts_engaged != null ? Number(row.accounts_engaged) : undefined,
      engagement_rate: row.engagement_rate != null ? Number(row.engagement_rate) : undefined,
    };
  }

  export async function getPosts(
    platform?: 'youtube' | 'instagram',
    startDate?: string,
    endDate?: string
  ): Promise<UnifiedPost[]> {
    let query = supabase.from('posts').select('*').order('posted_at', { ascending: false });
    if (platform) query = query.eq('platform', platform);
    if (startDate) query = query.gte('posted_at', startDate);
    if (endDate) query = query.lte('posted_at', endDate);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((row) => mapPostRow(row as Record<string, unknown>));
  }
  ```

- [ ] **Step 3: Simplify fetchAllPosts to use mapPostRow**

  Replace the inline mapping block in `fetchAllPosts`:

  ```typescript
  // Before (lines ~111-153):
  return (data ?? []).map((row) => {
    const views = Number(row.views ?? 0);
    // ... long block ...
  });

  // After:
  return (data ?? []).map((row) => mapPostRow(row as Record<string, unknown>));
  ```

- [ ] **Step 4: Verify TypeScript compiles**

  Run: `cd /Users/shane/clip-dashboard && npx tsc --noEmit`
  Expected: no errors in db.ts

---

## Chunk 2: AnalyticsView — metric config constants and state

### Task 2: Write the new AnalyticsView shell with types and constants

**Files:**
- Rewrite: `src/components/views/AnalyticsView.tsx`

This task writes the top of the file: imports, type definitions, metric config, and helper functions. No JSX yet.

- [ ] **Step 1: Write the file header**

  ```typescript
  'use client';

  import { useMemo, useState, useRef, useEffect } from 'react';
  import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend,
  } from 'recharts';
  import { Platform, PLATFORM_COLORS, PLATFORM_LABELS, UnifiedPost, DateRange } from '@/types';
  import { formatNum } from '@/lib/utils';
  ```

- [ ] **Step 2: Add MetricKey type and MetricDef interface**

  ```typescript
  type MetricKey =
    | 'views' | 'impressions' | 'reach'
    | 'likes' | 'comments' | 'shares' | 'saves' | 'engagement_rate'
    | 'watch_time_minutes' | 'avg_view_duration_seconds' | 'avg_view_percentage'
    | 'impression_ctr' | 'card_ctr' | 'end_screen_ctr'
    | 'subscribers_gained' | 'subscribers_lost'
    | 'profile_visits' | 'follows' | 'accounts_reached' | 'accounts_engaged';

  type AnalyticsPlatform = 'youtube' | 'instagram' | 'both';
  type TimeAxis = 'post_date' | 'days_since';
  type SortDir = 'asc' | 'desc';

  interface MetricDef {
    key: MetricKey;
    label: string;
    group: string;
    platforms: Platform[];
    aggregation: 'sum' | 'avg';
  }
  ```

- [ ] **Step 3: Add METRIC_DEFS constant**

  ```typescript
  const METRIC_DEFS: MetricDef[] = [
    { key: 'views',                    label: 'Views / Plays',           group: 'Reach',       platforms: ['youtube', 'instagram'], aggregation: 'sum' },
    { key: 'impressions',              label: 'Impressions',              group: 'Reach',       platforms: ['youtube', 'instagram'], aggregation: 'sum' },
    { key: 'reach',                    label: 'Reach',                    group: 'Reach',       platforms: ['instagram'],            aggregation: 'sum' },
    { key: 'likes',                    label: 'Likes',                    group: 'Engagement',  platforms: ['youtube', 'instagram'], aggregation: 'sum' },
    { key: 'comments',                 label: 'Comments',                 group: 'Engagement',  platforms: ['youtube', 'instagram'], aggregation: 'sum' },
    { key: 'shares',                   label: 'Shares',                   group: 'Engagement',  platforms: ['youtube', 'instagram'], aggregation: 'sum' },
    { key: 'saves',                    label: 'Saves',                    group: 'Engagement',  platforms: ['instagram'],            aggregation: 'sum' },
    { key: 'engagement_rate',          label: 'Engagement Rate %',        group: 'Engagement',  platforms: ['instagram'],            aggregation: 'avg' },
    { key: 'watch_time_minutes',       label: 'Watch Time (min)',         group: 'Retention',   platforms: ['youtube'],              aggregation: 'sum' },
    { key: 'avg_view_duration_seconds',label: 'Avg View Duration (sec)',  group: 'Retention',   platforms: ['youtube'],              aggregation: 'avg' },
    { key: 'avg_view_percentage',      label: 'Avg View %',               group: 'Retention',   platforms: ['youtube'],              aggregation: 'avg' },
    { key: 'impression_ctr',           label: 'Impression CTR %',         group: 'Discovery',   platforms: ['youtube'],              aggregation: 'avg' },
    { key: 'card_ctr',                 label: 'Card CTR %',               group: 'Discovery',   platforms: ['youtube'],              aggregation: 'avg' },
    { key: 'end_screen_ctr',           label: 'End Screen CTR %',         group: 'Discovery',   platforms: ['youtube'],              aggregation: 'avg' },
    { key: 'subscribers_gained',       label: 'Subscribers Gained',       group: 'Growth',      platforms: ['youtube'],              aggregation: 'sum' },
    { key: 'subscribers_lost',         label: 'Subscribers Lost',         group: 'Growth',      platforms: ['youtube'],              aggregation: 'sum' },
    { key: 'profile_visits',           label: 'Profile Visits',           group: 'Conversion',  platforms: ['instagram'],            aggregation: 'sum' },
    { key: 'follows',                  label: 'Follows',                  group: 'Conversion',  platforms: ['instagram'],            aggregation: 'sum' },
    { key: 'accounts_reached',         label: 'Accounts Reached',         group: 'Conversion',  platforms: ['instagram'],            aggregation: 'sum' },
    { key: 'accounts_engaged',         label: 'Accounts Engaged',         group: 'Conversion',  platforms: ['instagram'],            aggregation: 'sum' },
  ];

  const LINE_COLORS = [
    '#F7C948', '#38BDF8', '#A78BFA', '#34D399', '#FB923C',
    '#F472B6', '#60A5FA', '#4ADE80', '#E879F9', '#2DD4BF',
  ];

  const DATE_OPTIONS: { label: string; value: DateRange }[] = [
    { label: '7D', value: '7d' },
    { label: '30D', value: '30d' },
    { label: '90D', value: '90d' },
    { label: 'All', value: 'all' },
  ];
  ```

- [ ] **Step 4: Add helper functions**

  ```typescript
  // Returns the numeric value of a metric for a post.
  // 'views' maps to plays for Instagram (YouTube uses views, Instagram uses plays).
  function getMetricValue(post: UnifiedPost, metric: MetricKey): number {
    if (metric === 'views') {
      return post.platform === 'instagram' ? (post.plays ?? post.views) : post.views;
    }
    const val = post[metric as keyof UnifiedPost];
    return typeof val === 'number' ? val : 0;
  }

  function exportToCSV(posts: UnifiedPost[], metrics: MetricKey[]): void {
    const defs = metrics.map((k) => METRIC_DEFS.find((m) => m.key === k)!);
    const headers = ['date', 'platform', 'title', ...defs.map((d) => d.label)];
    const rows = posts.map((p) => [
      p.date,
      p.platform,
      `"${p.title.replace(/"/g, '""')}"`,
      ...metrics.map((k) => getMetricValue(p, k)),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  ```

---

## Chunk 3: AnalyticsView — component body (state + derived data)

### Task 3: Component state, filtered posts, and derived data

This task writes the component function signature, all useState/useMemo hooks, and the line/yAxis config.

- [ ] **Step 1: Write component signature and state**

  ```typescript
  interface Props { posts: UnifiedPost[] }

  export default function AnalyticsView({ posts }: Props) {
    const [analyticsPlat, setAnalyticsPlat] = useState<AnalyticsPlatform>('both');
    const [timeAxis, setTimeAxis] = useState<TimeAxis>('post_date');
    const [dateRange, setDateRange] = useState<DateRange>('30d');
    const [selectedMetrics, setSelectedMetrics] = useState<MetricKey[]>(['views', 'likes', 'comments']);
    const [metricDropOpen, setMetricDropOpen] = useState(false);
    const [sortCol, setSortCol] = useState<'date' | 'title' | MetricKey>('date');
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    const dropRef = useRef<HTMLDivElement>(null);

    // Close metric dropdown on outside click
    useEffect(() => {
      function onClickOutside(e: MouseEvent) {
        if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
          setMetricDropOpen(false);
        }
      }
      document.addEventListener('mousedown', onClickOutside);
      return () => document.removeEventListener('mousedown', onClickOutside);
    }, []);
  ```

- [ ] **Step 2: Filtered posts**

  ```typescript
    const filtered = useMemo(() => {
      let result = posts;
      if (analyticsPlat !== 'both') result = result.filter((p) => p.platform === analyticsPlat);
      if (dateRange !== 'all') {
        const cutoff = new Date();
        if (dateRange === '7d') cutoff.setDate(cutoff.getDate() - 7);
        else if (dateRange === '30d') cutoff.setDate(cutoff.getDate() - 30);
        else if (dateRange === '90d') cutoff.setDate(cutoff.getDate() - 90);
        result = result.filter((p) => p.date >= cutoff.toISOString().slice(0, 10));
      }
      return result;
    }, [posts, analyticsPlat, dateRange]);
  ```

- [ ] **Step 3: Visible metrics (platform-filtered), stat cards, line config**

  ```typescript
    const visibleMetrics = useMemo(() =>
      METRIC_DEFS.filter((m) =>
        analyticsPlat === 'both' || m.platforms.includes(analyticsPlat as Platform)
      ),
      [analyticsPlat]
    );

    // If platform changes and a selected metric is no longer relevant, prune it
    const activeMetrics = useMemo(() =>
      selectedMetrics.filter((k) => visibleMetrics.some((m) => m.key === k)),
      [selectedMetrics, visibleMetrics]
    );

    const statCards = useMemo(() => {
      return activeMetrics.map((metricKey) => {
        const def = METRIC_DEFS.find((m) => m.key === metricKey)!;
        let ytSum = 0, igSum = 0, ytCount = 0, igCount = 0;
        for (const post of filtered) {
          const val = getMetricValue(post, metricKey);
          if (post.platform === 'youtube') { ytSum += val; ytCount++; }
          else { igSum += val; igCount++; }
        }
        const total = ytSum + igSum;
        const count = ytCount + igCount;
        const displayVal = def.aggregation === 'sum' ? total : (count > 0 ? total / count : 0);
        return { def, displayVal, ytSum, igSum, isAvg: def.aggregation === 'avg' };
      });
    }, [filtered, activeMetrics]);

    // Build chart data points keyed by x value
    const chartData = useMemo(() => {
      const map = new Map<string | number, Record<string, number>>();
      const today = new Date();
      for (const post of filtered) {
        let xKey: string | number;
        if (timeAxis === 'post_date') {
          xKey = post.date;
        } else {
          const posted = new Date(post.date + 'T00:00:00');
          xKey = Math.floor((today.getTime() - posted.getTime()) / 86_400_000);
        }
        if (!map.has(xKey)) map.set(xKey, {});
        const entry = map.get(xKey)!;
        for (const metric of activeMetrics) {
          const lineKey = analyticsPlat === 'both'
            ? `${metric}-${post.platform}`
            : metric;
          entry[lineKey] = (entry[lineKey] ?? 0) + getMetricValue(post, metric);
        }
      }
      const sorted = Array.from(map.entries()).sort(([a], [b]) =>
        typeof a === 'number' ? (a as number) - (b as number) : String(a).localeCompare(String(b))
      );
      return sorted.map(([xVal, vals]) => ({ xVal, ...vals }));
    }, [filtered, activeMetrics, timeAxis, analyticsPlat]);

    // Line definitions: one per metric (or per metric-platform if both)
    const lines = useMemo(() => {
      const result: { dataKey: string; label: string; color: string; yAxisId: string }[] = [];
      let colorIdx = 0;
      for (const metricKey of activeMetrics) {
        const def = METRIC_DEFS.find((m) => m.key === metricKey)!;
        if (analyticsPlat === 'both') {
          for (const pl of def.platforms) {
            result.push({
              dataKey: `${metricKey}-${pl}`,
              label: `${def.label} (${PLATFORM_LABELS[pl]})`,
              color: LINE_COLORS[colorIdx % LINE_COLORS.length],
              yAxisId: metricKey,
            });
            colorIdx++;
          }
        } else {
          result.push({
            dataKey: metricKey,
            label: def.label,
            color: LINE_COLORS[colorIdx % LINE_COLORS.length],
            yAxisId: metricKey,
          });
          colorIdx++;
        }
      }
      return result;
    }, [activeMetrics, analyticsPlat]);

    // Sorted posts for clip table
    const sortedPosts = useMemo(() => {
      return [...filtered].sort((a, b) => {
        let aVal: number | string;
        let bVal: number | string;
        if (sortCol === 'date') { aVal = a.date; bVal = b.date; }
        else if (sortCol === 'title') { aVal = a.title; bVal = b.title; }
        else { aVal = getMetricValue(a, sortCol); bVal = getMetricValue(b, sortCol); }
        if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }, [filtered, sortCol, sortDir]);

    function handleSortCol(col: 'date' | 'title' | MetricKey) {
      if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      else { setSortCol(col); setSortDir('desc'); }
    }

    function toggleMetric(key: MetricKey) {
      setSelectedMetrics((prev) =>
        prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
      );
    }
  ```

---

## Chunk 4: AnalyticsView — JSX (Sections 1–3)

### Task 4: Render control bar, metric selector, and stat cards

- [ ] **Step 1: Return JSX — outer wrapper + Section 1 (Control Bar)**

  ```tsx
    // Group visible metrics by group name for the dropdown
    const metricGroups = useMemo(() => {
      const groups = new Map<string, MetricDef[]>();
      for (const m of visibleMetrics) {
        if (!groups.has(m.group)) groups.set(m.group, []);
        groups.get(m.group)!.push(m);
      }
      return groups;
    }, [visibleMetrics]);

    return (
      <div className="p-5 space-y-5">

        {/* SECTION 1: Control Bar */}
        <div className="flex flex-wrap items-center gap-3">

          {/* Platform toggle */}
          <div className="flex items-center bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-xl p-0.5 gap-0.5">
            {([
              { val: 'youtube'   as AnalyticsPlatform, label: 'YouTube',   color: '#FF4444' },
              { val: 'instagram' as AnalyticsPlatform, label: 'Instagram', color: '#C855E8' },
              { val: 'both'      as AnalyticsPlatform, label: 'Both',      color: undefined },
            ] as { val: AnalyticsPlatform; label: string; color?: string }[]).map(({ val, label, color }) => (
              <button
                key={val}
                onClick={() => setAnalyticsPlat(val)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                  analyticsPlat === val
                    ? 'bg-[rgba(247,231,206,0.08)] text-[var(--text-1)]'
                    : 'text-[var(--text-3)] hover:text-[var(--text-2)]'
                }`}
                style={analyticsPlat === val && color ? { color } : undefined}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Time axis toggle */}
          <div className="flex items-center bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-xl p-0.5 gap-0.5">
            {([
              { val: 'post_date'  as TimeAxis, label: 'By Post Date' },
              { val: 'days_since' as TimeAxis, label: 'Days Since Posted' },
            ] as { val: TimeAxis; label: string }[]).map(({ val, label }) => (
              <button
                key={val}
                onClick={() => setTimeAxis(val)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                  timeAxis === val
                    ? 'bg-[rgba(247,231,206,0.08)] text-[var(--text-1)]'
                    : 'text-[var(--text-3)] hover:text-[var(--text-2)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Date range picker */}
          <div className="flex items-center bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-xl p-0.5 gap-0.5">
            {DATE_OPTIONS.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setDateRange(value)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                  dateRange === value
                    ? 'bg-[var(--gold)] text-[var(--bg-base)]'
                    : 'text-[var(--text-3)] hover:text-[var(--text-2)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
  ```

- [ ] **Step 2: Section 2 — Metric Selector dropdown**

  ```tsx
        {/* SECTION 2: Metric Selector */}
        <div className="relative" ref={dropRef}>
          <button
            onClick={() => setMetricDropOpen((o) => !o)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--bg-card)] border border-[rgba(247,231,206,0.08)] rounded-xl text-[13px] text-[var(--text-2)] hover:border-[rgba(247,231,206,0.15)] transition-all"
          >
            <span className="text-[var(--text-3)] text-[11px] font-semibold tracking-[0.1em] uppercase">Metrics</span>
            <span className="flex items-center gap-1 flex-wrap">
              {activeMetrics.map((k) => {
                const def = METRIC_DEFS.find((m) => m.key === k)!;
                return (
                  <span key={k} className="px-1.5 py-0.5 bg-[rgba(247,231,206,0.06)] rounded text-[10px] text-[var(--text-1)] font-medium">
                    {def.label}
                  </span>
                );
              })}
            </span>
            <svg className="w-4 h-4 ml-auto shrink-0 text-[var(--text-3)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {metricDropOpen && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-[#1a1a1a] border border-[rgba(247,231,206,0.1)] rounded-2xl shadow-2xl p-3 min-w-[340px] max-h-[420px] overflow-y-auto">
              {Array.from(metricGroups.entries()).map(([groupName, metrics]) => (
                <div key={groupName} className="mb-3 last:mb-0">
                  <p className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[var(--text-3)] mb-1.5 px-1">{groupName}</p>
                  <div className="grid grid-cols-2 gap-1">
                    {metrics.map((m) => {
                      const checked = activeMetrics.includes(m.key);
                      return (
                        <button
                          key={m.key}
                          onClick={() => toggleMetric(m.key)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] text-left transition-all ${
                            checked
                              ? 'bg-[rgba(247,231,206,0.08)] text-[var(--text-1)]'
                              : 'text-[var(--text-3)] hover:bg-[rgba(247,231,206,0.04)] hover:text-[var(--text-2)]'
                          }`}
                        >
                          <span className={`w-3.5 h-3.5 rounded shrink-0 border flex items-center justify-center ${
                            checked ? 'bg-[var(--gold)] border-[var(--gold)]' : 'border-[rgba(247,231,206,0.2)]'
                          }`}>
                            {checked && (
                              <svg className="w-2.5 h-2.5 text-[var(--bg-base)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </span>
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
  ```

- [ ] **Step 3: Section 3 — Stat Cards row**

  ```tsx
        {/* SECTION 3: Stat Cards */}
        {activeMetrics.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {statCards.map(({ def, displayVal, ytSum, igSum, isAvg }) => (
              <div
                key={def.key}
                className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl px-4 py-4 hover:border-[rgba(247,231,206,0.09)] transition-colors"
              >
                <p className="text-[10px] tracking-[0.14em] uppercase text-[var(--text-3)] mb-1.5 font-semibold leading-none">{def.label}</p>
                <p className="text-xl font-bold tabular-nums text-[var(--gold)] leading-none mb-2" style={{ fontFamily: 'var(--font-mono)' }}>
                  {isAvg ? displayVal.toFixed(2) : formatNum(displayVal)}
                </p>
                {analyticsPlat === 'both' && (
                  <div className="flex flex-col gap-0.5 mt-1">
                    <span className="text-[10px] tabular-nums" style={{ color: PLATFORM_COLORS.youtube, fontFamily: 'var(--font-mono)' }}>
                      YT {isAvg ? ytSum.toFixed(1) : formatNum(ytSum)}
                    </span>
                    <span className="text-[10px] tabular-nums" style={{ color: PLATFORM_COLORS.instagram, fontFamily: 'var(--font-mono)' }}>
                      IG {isAvg ? igSum.toFixed(1) : formatNum(igSum)}
                    </span>
                  </div>
                )}
                <p className="text-[9px] text-[var(--text-3)] mt-1">{isAvg ? 'avg' : 'total'}</p>
              </div>
            ))}
          </div>
        )}
  ```

---

## Chunk 5: AnalyticsView — JSX (Sections 4–5)

### Task 5: Main chart and clip table

- [ ] **Step 1: Section 4 — Multi-metric LineChart**

  Key Recharts pattern: each metric gets its own `<YAxis yAxisId={metricKey}>`. The first two are shown (left + right), the rest have `hide={true}`. Each `<Line>` references its metric's `yAxisId`.

  ```tsx
        {/* SECTION 4: Main Chart */}
        <div className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-[15px] font-semibold text-[var(--text-1)] leading-none">Performance Over Time</h2>
          </div>
          {chartData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-[var(--text-3)] text-sm">No data for selected filters</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 6" stroke="rgba(247,231,206,0.03)" vertical={false} />
                <XAxis
                  dataKey="xVal"
                  tickFormatter={(v) =>
                    timeAxis === 'post_date'
                      ? new Date(String(v) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      : `${v}d`
                  }
                  tick={{ fill: '#47403a', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                  axisLine={{ stroke: 'transparent' }}
                  tickLine={false}
                  interval="preserveStartEnd"
                  dy={6}
                />
                {activeMetrics.map((metricKey, idx) => (
                  <YAxis
                    key={metricKey}
                    yAxisId={metricKey}
                    orientation={idx % 2 === 0 ? 'left' : 'right'}
                    hide={idx > 1}
                    tickFormatter={(v) => formatNum(v)}
                    tick={{ fill: '#47403a', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                    axisLine={{ stroke: 'transparent' }}
                    tickLine={false}
                    width={40}
                  />
                ))}
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const xLabel = timeAxis === 'post_date'
                      ? new Date(String(label) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : `${label} days ago`;
                    return (
                      <div className="border border-[rgba(247,231,206,0.09)] rounded-xl shadow-2xl px-3 py-2.5 min-w-[160px]"
                        style={{ background: '#1d1d1d', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                        <p className="text-[var(--text-3)] mb-2 pb-1.5 border-b border-[rgba(247,231,206,0.06)]">{xLabel}</p>
                        <div className="space-y-1">
                          {payload.map((entry) => (
                            <div key={entry.dataKey as string} className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: entry.color }} />
                                <span className="text-[var(--text-2)] truncate max-w-[120px]">
                                  {lines.find((l) => l.dataKey === entry.dataKey)?.label ?? String(entry.dataKey)}
                                </span>
                              </div>
                              <span className="text-[var(--text-1)] font-semibold tabular-nums">
                                {formatNum(entry.value as number)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }}
                  cursor={{ stroke: 'rgba(247,231,206,0.05)', strokeWidth: 1 }}
                />
                {lines.map((line) => (
                  <Line
                    key={line.dataKey}
                    type="monotone"
                    dataKey={line.dataKey}
                    yAxisId={line.yAxisId}
                    stroke={line.color}
                    strokeWidth={2}
                    dot={{ r: 2.5, fill: line.color, strokeWidth: 0 }}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                    connectNulls
                  />
                ))}
                <Legend
                  iconType="circle"
                  iconSize={5}
                  formatter={(value) => {
                    const found = lines.find((l) => l.dataKey === value);
                    return (
                      <span style={{ color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
                        {found?.label ?? value}
                      </span>
                    );
                  }}
                  wrapperStyle={{ paddingTop: 14 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
  ```

- [ ] **Step 2: Section 5 — Clip Table with sort + CSV export**

  ```tsx
        {/* SECTION 5: Clip Table */}
        <div className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[rgba(247,231,206,0.04)] flex items-center justify-between">
            <h3 className="text-[15px] font-semibold text-[var(--text-1)]">All Posts</h3>
            <button
              data-testid="csv-export-btn"
              onClick={() => exportToCSV(filtered, activeMetrics)}
              disabled={filtered.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-[rgba(247,231,206,0.08)] text-[var(--text-2)] hover:text-[var(--text-1)] hover:border-[rgba(247,231,206,0.15)] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export CSV
            </button>
          </div>
          {sortedPosts.length === 0 ? (
            <div className="px-5 py-10 text-center text-[var(--text-3)] text-sm">No posts match the current filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-[rgba(247,231,206,0.04)]">
                    {(['title', 'date'] as const).map((col) => (
                      <th
                        key={col}
                        onClick={() => handleSortCol(col)}
                        className="px-5 py-3 text-[10px] font-medium text-[var(--text-3)] uppercase tracking-[0.12em] cursor-pointer hover:text-[var(--text-2)] select-none whitespace-nowrap"
                      >
                        {col === 'title' ? 'Clip Title' : 'Post Date'}
                        {sortCol === col && <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                      </th>
                    ))}
                    <th className="px-5 py-3 text-[10px] font-medium text-[var(--text-3)] uppercase tracking-[0.12em] whitespace-nowrap">
                      Platform
                    </th>
                    {activeMetrics.map((metricKey) => {
                      const def = METRIC_DEFS.find((m) => m.key === metricKey)!;
                      return (
                        <th
                          key={metricKey}
                          onClick={() => handleSortCol(metricKey)}
                          className="px-5 py-3 text-[10px] font-medium text-[var(--text-3)] uppercase tracking-[0.12em] cursor-pointer hover:text-[var(--text-2)] select-none whitespace-nowrap"
                        >
                          {def.label}
                          {sortCol === metricKey && <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(247,231,206,0.04)]">
                  {sortedPosts.map((post) => (
                    <tr key={post.id} className="hover:bg-[rgba(247,231,206,0.02)] transition-colors">
                      <td className="px-5 py-3.5 text-[var(--text-1)] text-[13px] max-w-[260px] truncate">{post.title}</td>
                      <td className="px-5 py-3.5 text-[var(--text-2)] text-[13px] tabular-nums whitespace-nowrap" style={{ fontFamily: 'var(--font-mono)' }}>
                        {new Date(post.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: PLATFORM_COLORS[post.platform] }} />
                          <span className="text-[11px] font-medium" style={{ color: PLATFORM_COLORS[post.platform] }}>
                            {PLATFORM_LABELS[post.platform]}
                          </span>
                        </span>
                      </td>
                      {activeMetrics.map((metricKey) => {
                        const def = METRIC_DEFS.find((m) => m.key === metricKey)!;
                        const val = getMetricValue(post, metricKey);
                        return (
                          <td key={metricKey} className="px-5 py-3.5 text-[var(--text-2)] text-[13px] tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>
                            {def.aggregation === 'avg' ? val.toFixed(2) : formatNum(val)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }
  ```

---

## Chunk 6: Build verification and git push

### Task 6: Verify build and commit

- [ ] **Step 1: Run TypeScript check**

  ```bash
  cd /Users/shane/clip-dashboard && npx tsc --noEmit
  ```
  Expected: no errors

- [ ] **Step 2: Run full build**

  ```bash
  cd /Users/shane/clip-dashboard && npm run build
  ```
  Expected: ✓ Compiled successfully

- [ ] **Step 3: Fix any TypeScript errors found**

  Common issues to watch for:
  - `entry[lineKey]` may need explicit typing: `const entry = map.get(xKey)! as Record<string, number>;`
  - `payload` in Tooltip callback needs type annotation: `payload?: Array<{ dataKey: string; color: string; value: number }>`
  - `metricGroups` computed inside `useMemo` — ensure it's computed before `return`

- [ ] **Step 4: Commit and push**

  ```bash
  cd /Users/shane/clip-dashboard
  git add src/lib/db.ts src/components/views/AnalyticsView.tsx
  git commit -m "feat: redesign analytics view with dynamic metric selector and expanded schema"
  git push
  ```
