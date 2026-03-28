'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { UnifiedPost, DateRange } from '@/types';
import { formatNum } from '@/lib/utils';

type AnalyticsPlatform = 'youtube' | 'instagram' | 'both';
type TimeAxis = 'post_date' | 'days_since';

type MetricKey =
  | 'views'
  | 'impressions'
  | 'reach'
  | 'likes'
  | 'comments'
  | 'shares'
  | 'saves'
  | 'engagement_rate'
  | 'watch_time_minutes'
  | 'avg_view_duration_seconds'
  | 'avg_view_percentage'
  | 'impression_ctr'
  | 'card_ctr'
  | 'end_screen_ctr'
  | 'subscribers_gained'
  | 'subscribers_lost'
  | 'profile_visits'
  | 'follows'
  | 'accounts_reached'
  | 'accounts_engaged';

type AggType = 'sum' | 'avg';

const METRIC_AGG: Record<MetricKey, AggType> = {
  views: 'sum',
  impressions: 'sum',
  reach: 'sum',
  likes: 'sum',
  comments: 'sum',
  shares: 'sum',
  saves: 'sum',
  engagement_rate: 'avg',
  watch_time_minutes: 'sum',
  avg_view_duration_seconds: 'avg',
  avg_view_percentage: 'avg',
  impression_ctr: 'avg',
  card_ctr: 'avg',
  end_screen_ctr: 'avg',
  subscribers_gained: 'sum',
  subscribers_lost: 'sum',
  profile_visits: 'sum',
  follows: 'sum',
  accounts_reached: 'sum',
  accounts_engaged: 'sum',
};

interface MetricDef {
  key: MetricKey;
  label: string;
  platform: 'both' | 'youtube' | 'instagram';
}

interface MetricGroup {
  label: string;
  metrics: MetricDef[];
}

const METRIC_GROUPS: MetricGroup[] = [
  {
    label: 'Reach',
    metrics: [
      { key: 'views', label: 'Views / Plays', platform: 'both' },
      { key: 'impressions', label: 'Impressions', platform: 'both' },
      { key: 'reach', label: 'Reach', platform: 'instagram' },
    ],
  },
  {
    label: 'Engagement',
    metrics: [
      { key: 'likes', label: 'Likes', platform: 'both' },
      { key: 'comments', label: 'Comments', platform: 'both' },
      { key: 'shares', label: 'Shares', platform: 'both' },
      { key: 'saves', label: 'Saves', platform: 'instagram' },
      { key: 'engagement_rate', label: 'Engagement Rate %', platform: 'instagram' },
    ],
  },
  {
    label: 'Retention',
    metrics: [
      { key: 'watch_time_minutes', label: 'Watch Time (min)', platform: 'youtube' },
      { key: 'avg_view_duration_seconds', label: 'Avg View Duration (sec)', platform: 'youtube' },
      { key: 'avg_view_percentage', label: 'Avg View %', platform: 'youtube' },
    ],
  },
  {
    label: 'Discovery',
    metrics: [
      { key: 'impression_ctr', label: 'Impression CTR %', platform: 'youtube' },
      { key: 'card_ctr', label: 'Card CTR %', platform: 'youtube' },
      { key: 'end_screen_ctr', label: 'End Screen CTR %', platform: 'youtube' },
    ],
  },
  {
    label: 'Growth',
    metrics: [
      { key: 'subscribers_gained', label: 'Subscribers Gained', platform: 'youtube' },
      { key: 'subscribers_lost', label: 'Subscribers Lost', platform: 'youtube' },
    ],
  },
  {
    label: 'Conversion',
    metrics: [
      { key: 'profile_visits', label: 'Profile Visits', platform: 'instagram' },
      { key: 'follows', label: 'Follows', platform: 'instagram' },
      { key: 'accounts_reached', label: 'Accounts Reached', platform: 'instagram' },
      { key: 'accounts_engaged', label: 'Accounts Engaged', platform: 'instagram' },
    ],
  },
];

const METRIC_LABEL: Record<MetricKey, string> = Object.fromEntries(
  METRIC_GROUPS.flatMap((g) => g.metrics.map((m) => [m.key, m.label]))
) as Record<MetricKey, string>;

const LINE_COLORS = [
  '#F7C948',
  '#38BDF8',
  '#A78BFA',
  '#34D399',
  '#FB923C',
  '#F472B6',
  '#60A5FA',
  '#4ADE80',
  '#E879F9',
  '#2DD4BF',
];

function getMetricValue(post: UnifiedPost, key: MetricKey): number {
  if (key === 'views') {
    return post.platform === 'instagram' ? (post.plays ?? post.views) : post.views;
  }
  if (key === 'engagement_rate') {
    return post.engagement_rate ?? post.engagementRate ?? 0;
  }
  const val = post[key as keyof UnifiedPost];
  return typeof val === 'number' ? val : 0;
}

function isMetricApplicable(key: MetricKey, platform: AnalyticsPlatform): boolean {
  const group = METRIC_GROUPS.flatMap((g) => g.metrics).find((m) => m.key === key);
  if (!group) return false;
  if (group.platform === 'both') return true;
  if (platform === 'both') return true;
  return group.platform === platform;
}

type SortCol = 'date' | 'title' | MetricKey;

interface Props {
  posts: UnifiedPost[];
}

interface TooltipPayloadEntry {
  dataKey: string;
  name?: string;
  color: string;
  value: number;
}

interface CustomTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: TooltipPayloadEntry[];
  timeAxis: TimeAxis;
}

function CustomTooltip({ active, label, payload, timeAxis }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.12)] rounded-xl px-3 py-2.5 shadow-xl">
      <p className="text-[11px] text-[var(--text-3)] mb-1.5 font-medium">
        {timeAxis === 'days_since' ? `Day ${label}` : String(label)}
      </p>
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.dataKey} className="flex items-center gap-2 text-[12px]">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: entry.color }} />
            <span className="text-[var(--text-2)]">{entry.name ?? String(entry.dataKey)}:</span>
            <span className="text-[var(--text-1)] font-semibold tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>
              {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AnalyticsView({ posts }: Props) {
  const [analyticsPlat, setAnalyticsPlat] = useState<AnalyticsPlatform>('both');
  const [timeAxis, setTimeAxis] = useState<TimeAxis>('post_date');
  const [dateRange, setDateRange] = useState<Exclude<DateRange, '1d'>>('30d');
  const [selectedMetrics, setSelectedMetrics] = useState<MetricKey[]>(['views', 'likes', 'comments']);
  const [metricDropOpen, setMetricDropOpen] = useState(false);
  const [sortCol, setSortCol] = useState<SortCol>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setMetricDropOpen(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  useEffect(() => {
    setSelectedMetrics((prev) =>
      prev.filter((m) => isMetricApplicable(m, analyticsPlat))
    );
  }, [analyticsPlat]);

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

  const statCards = useMemo(() => {
    return selectedMetrics.map((key) => {
      const agg = METRIC_AGG[key];
      const ytPosts = filtered.filter((p) => p.platform === 'youtube');
      const igPosts = filtered.filter((p) => p.platform === 'instagram');

      const computeValue = (arr: UnifiedPost[]): number => {
        if (!arr.length) return 0;
        if (agg === 'sum') return arr.reduce((s, p) => s + getMetricValue(p, key), 0);
        return arr.reduce((s, p) => s + getMetricValue(p, key), 0) / arr.length;
      };

      const total = computeValue(filtered);
      const ytVal = computeValue(ytPosts);
      const igVal = computeValue(igPosts);

      const formatValue = (v: number) =>
        agg === 'sum' ? formatNum(v) : v.toFixed(2);

      return { key, label: METRIC_LABEL[key], total, ytVal, igVal, formatValue, agg };
    });
  }, [selectedMetrics, filtered]);

  const chartData = useMemo(() => {
    const today = new Date();
    const map = new Map<string | number, Record<string, number> & { _counts: Record<string, number> }>();

    for (const post of filtered) {
      let xVal: string | number;
      if (timeAxis === 'post_date') {
        xVal = post.date;
      } else {
        const posted = new Date(post.date);
        xVal = Math.floor((today.getTime() - posted.getTime()) / 86_400_000);
      }

      if (!map.has(xVal)) {
        map.set(xVal, { _counts: {} } as Record<string, number> & { _counts: Record<string, number> });
      }
      const entry = map.get(xVal)!;

      for (const metric of selectedMetrics) {
        const val = getMetricValue(post, metric);
        const fieldKey = analyticsPlat === 'both' ? `${metric}-${post.platform}` : metric;

        if (METRIC_AGG[metric] === 'sum') {
          entry[fieldKey] = (entry[fieldKey] ?? 0) + val;
        } else {
          entry[fieldKey] = (entry[fieldKey] ?? 0) + val;
          entry._counts[fieldKey] = (entry._counts[fieldKey] ?? 0) + 1;
        }
      }
    }

    const entries = Array.from(map.entries())
      .sort((a, b) => {
        const av = a[0];
        const bv = b[0];
        if (typeof av === 'number' && typeof bv === 'number') return av - bv;
        return String(av).localeCompare(String(bv));
      })
      .map(([xVal, data]) => {
        const point: Record<string, string | number> = { xVal };
        for (const metric of selectedMetrics) {
          if (analyticsPlat === 'both') {
            for (const pl of ['youtube', 'instagram'] as const) {
              const fieldKey = `${metric}-${pl}`;
              const count = data._counts[fieldKey] ?? 1;
              const raw = data[fieldKey] ?? 0;
              point[fieldKey] = METRIC_AGG[metric] === 'avg' && count > 0 ? raw / count : raw;
            }
          } else {
            const count = data._counts[metric] ?? 1;
            const raw = data[metric] ?? 0;
            point[metric] = METRIC_AGG[metric] === 'avg' && count > 0 ? raw / count : raw;
          }
        }
        return point;
      });

    return entries;
  }, [filtered, selectedMetrics, timeAxis, analyticsPlat]);

  const chartLines = useMemo(() => {
    const lines: Array<{ dataKey: string; label: string; color: string; yAxisId: string }> = [];
    let colorIndex = 0;
    for (const metric of selectedMetrics) {
      if (analyticsPlat === 'both') {
        lines.push({
          dataKey: `${metric}-youtube`,
          label: `${METRIC_LABEL[metric]} (YouTube)`,
          color: LINE_COLORS[colorIndex % LINE_COLORS.length],
          yAxisId: metric,
        });
        colorIndex++;
        lines.push({
          dataKey: `${metric}-instagram`,
          label: `${METRIC_LABEL[metric]} (Instagram)`,
          color: LINE_COLORS[colorIndex % LINE_COLORS.length],
          yAxisId: metric,
        });
        colorIndex++;
      } else {
        lines.push({
          dataKey: metric,
          label: METRIC_LABEL[metric],
          color: LINE_COLORS[colorIndex % LINE_COLORS.length],
          yAxisId: metric,
        });
        colorIndex++;
      }
    }
    return lines;
  }, [selectedMetrics, analyticsPlat]);

  const sortedPosts = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;
      if (sortCol === 'date') {
        aVal = a.date;
        bVal = b.date;
      } else if (sortCol === 'title') {
        aVal = a.title;
        bVal = b.title;
      } else {
        aVal = getMetricValue(a, sortCol as MetricKey);
        bVal = getMetricValue(b, sortCol as MetricKey);
      }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtered, sortCol, sortDir]);

  function handleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  }

  function exportCSV() {
    const metricCols = selectedMetrics.map((k) => METRIC_LABEL[k]);
    const headers = ['Title', 'Post Date', 'Platform', ...metricCols];
    const rows = sortedPosts.map((p) => [
      `"${p.title.replace(/"/g, '""')}"`,
      p.date,
      p.platform,
      ...selectedMetrics.map((k) => getMetricValue(p, k)),
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

  const visibleGroups = useMemo(() => {
    return METRIC_GROUPS
      .map((g) => {
        const visibleMetrics = g.metrics.filter((m) => isMetricApplicable(m.key, analyticsPlat));
        return { ...g, metrics: visibleMetrics };
      })
      .filter((g) => g.metrics.length > 0);
  }, [analyticsPlat]);

  function toggleMetric(key: MetricKey) {
    setSelectedMetrics((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  const pillBase =
    'px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer select-none';

  return (
    <div className="p-5 space-y-5">
      {/* SECTION 1: Control Bar */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Platform toggle */}
        <div className="flex gap-1 bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-full p-1">
          {(
            [
              { val: 'youtube', label: 'YouTube' },
              { val: 'instagram', label: 'Instagram' },
              { val: 'both', label: 'Both' },
            ] as { val: AnalyticsPlatform; label: string }[]
          ).map(({ val, label }) => {
            const active = analyticsPlat === val;
            const bg =
              active && val === 'youtube'
                ? '#FF4444'
                : active && val === 'instagram'
                ? '#C855E8'
                : active
                ? 'rgba(247,201,72,0.15)'
                : 'transparent';
            const color =
              active && (val === 'youtube' || val === 'instagram')
                ? '#fff'
                : active
                ? 'var(--text-1)'
                : 'var(--text-3)';
            return (
              <button
                key={val}
                onClick={() => setAnalyticsPlat(val)}
                className={pillBase}
                style={{ background: bg, color }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Time axis toggle */}
        <div className="flex gap-1 bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-full p-1">
          {(
            [
              { val: 'post_date', label: 'By Post Date' },
              { val: 'days_since', label: 'Days Since Posted' },
            ] as { val: TimeAxis; label: string }[]
          ).map(({ val, label }) => (
            <button
              key={val}
              onClick={() => setTimeAxis(val)}
              className={pillBase}
              style={{
                background: timeAxis === val ? 'rgba(247,201,72,0.15)' : 'transparent',
                color: timeAxis === val ? 'var(--text-1)' : 'var(--text-3)',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Date range */}
        <div className="flex gap-1 bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-full p-1">
          {(['7d', '30d', '90d', 'all'] as Exclude<DateRange, '1d'>[]).map((r) => (
            <button
              key={r}
              onClick={() => setDateRange(r)}
              className={pillBase}
              style={{
                background: dateRange === r ? 'var(--gold)' : 'transparent',
                color: dateRange === r ? '#000' : 'var(--text-3)',
              }}
            >
              {r === 'all' ? 'All' : r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* SECTION 2: Metric Selector */}
      <div className="relative" ref={dropRef}>
        <button
          onClick={() => setMetricDropOpen((v) => !v)}
          className="flex items-center gap-2 flex-wrap bg-[var(--bg-card)] border border-[rgba(247,231,206,0.08)] rounded-xl px-3 py-2 hover:border-[rgba(247,231,206,0.15)] transition-colors min-w-[200px] text-left"
        >
          <span className="text-[11px] text-[var(--text-3)] shrink-0">Metrics:</span>
          {selectedMetrics.length === 0 ? (
            <span className="text-[12px] text-[var(--text-3)]">Select metrics…</span>
          ) : (
            selectedMetrics.map((k) => (
              <span
                key={k}
                className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[rgba(247,201,72,0.12)] text-[var(--gold)] border border-[rgba(247,201,72,0.2)]"
              >
                {METRIC_LABEL[k]}
              </span>
            ))
          )}
          <svg
            className="w-3.5 h-3.5 ml-auto shrink-0 text-[var(--text-3)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {metricDropOpen && (
          <div className="absolute z-50 top-full mt-2 left-0 bg-[var(--bg-card)] border border-[rgba(247,231,206,0.1)] rounded-2xl shadow-2xl p-4 min-w-[320px] max-h-[480px] overflow-y-auto">
            <div className="space-y-4">
              {visibleGroups.map((group, gi) => (
                <div key={`${group.label}-${gi}`}>
                  <p className="text-[10px] tracking-[0.14em] uppercase font-semibold text-[var(--text-3)] mb-2">
                    {group.label}
                  </p>
                  <div className="space-y-1">
                    {group.metrics.map((m) => (
                      <label
                        key={m.key}
                        className="flex items-center gap-2.5 cursor-pointer rounded-lg px-2 py-1.5 hover:bg-[rgba(247,231,206,0.04)] transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedMetrics.includes(m.key)}
                          onChange={() => toggleMetric(m.key)}
                          className="accent-[var(--gold)] w-3.5 h-3.5"
                        />
                        <span className="text-[13px] text-[var(--text-2)]">{m.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* SECTION 3: Stat Cards */}
      {statCards.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {statCards.map(({ key, label, total, ytVal, igVal, formatValue }) => (
            <div
              key={key}
              className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl px-4 py-4 hover:border-[rgba(247,231,206,0.1)] transition-colors"
            >
              <p className="text-[10px] tracking-[0.14em] uppercase text-[var(--text-3)] mb-2 font-semibold">
                {label}
              </p>
              <p
                className="text-2xl font-bold leading-none tabular-nums"
                style={{ color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}
              >
                {formatValue(total)}
              </p>
              {analyticsPlat === 'both' && (
                <div className="mt-2 flex flex-col gap-0.5">
                  <span className="text-[11px] text-[var(--text-3)] tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>
                    <span style={{ color: '#FF4444' }}>YT</span> {formatValue(ytVal)}
                  </span>
                  <span className="text-[11px] text-[var(--text-3)] tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>
                    <span style={{ color: '#C855E8' }}>IG</span> {formatValue(igVal)}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* SECTION 4: Main Chart */}
      <div className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl p-5">
        <h3 className="text-[13px] font-semibold text-[var(--text-2)] mb-4">Performance Over Time</h3>
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-[var(--text-3)] text-sm">
            No data for the current filters.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(247,231,206,0.05)" />
              <XAxis
                dataKey="xVal"
                tick={{ fill: 'var(--text-3)', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: 'rgba(247,231,206,0.08)' }}
              />
              {selectedMetrics.map((metric, idx) => (
                <YAxis
                  key={metric}
                  yAxisId={metric}
                  orientation={idx % 2 === 0 ? 'left' : 'right'}
                  hide={idx >= 2}
                  tick={{ fill: 'var(--text-3)', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={45}
                />
              ))}
              <Tooltip
                content={
                  <CustomTooltip
                    timeAxis={timeAxis}
                  />
                }
              />
              {chartLines.map((line) => (
                <Line
                  key={line.dataKey}
                  type="monotone"
                  dataKey={line.dataKey}
                  yAxisId={line.yAxisId}
                  stroke={line.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                  name={line.label}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* SECTION 5: Clip Table */}
      <div className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[rgba(247,231,206,0.04)] flex items-center justify-between gap-3">
          <h3 className="text-[15px] font-semibold text-[var(--text-1)]">Clip Details</h3>
          <button
            onClick={exportCSV}
            disabled={sortedPosts.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-[rgba(247,231,206,0.08)] text-[var(--text-2)] hover:text-[var(--text-1)] hover:border-[rgba(247,231,206,0.15)] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>
        </div>

        {sortedPosts.length === 0 ? (
          <div className="px-5 py-10 text-center text-[var(--text-3)] text-sm">
            No posts match the current filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(247,231,206,0.04)]">
                  <th
                    className="px-5 py-3 text-left text-[10px] font-medium text-[var(--text-3)] uppercase tracking-[0.12em] cursor-pointer hover:text-[var(--text-2)] transition-colors"
                    onClick={() => handleSort('title')}
                  >
                    Clip Code {sortCol === 'title' && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    className="px-5 py-3 text-left text-[10px] font-medium text-[var(--text-3)] uppercase tracking-[0.12em] cursor-pointer hover:text-[var(--text-2)] transition-colors whitespace-nowrap"
                    onClick={() => handleSort('date')}
                  >
                    Post Date {sortCol === 'date' && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-5 py-3 text-left text-[10px] font-medium text-[var(--text-3)] uppercase tracking-[0.12em] whitespace-nowrap">
                    Platform
                  </th>
                  {selectedMetrics.map((k) => (
                    <th
                      key={k}
                      className="px-5 py-3 text-left text-[10px] font-medium text-[var(--text-3)] uppercase tracking-[0.12em] cursor-pointer hover:text-[var(--text-2)] transition-colors whitespace-nowrap"
                      onClick={() => handleSort(k)}
                    >
                      {METRIC_LABEL[k]} {sortCol === k && (sortDir === 'asc' ? '↑' : '↓')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(247,231,206,0.04)]">
                {sortedPosts.map((post) => (
                  <tr key={post.id} className="hover:bg-[rgba(247,231,206,0.02)] transition-colors">
                    <td className="px-5 py-3.5 text-[var(--text-1)] text-[13px] max-w-[260px] truncate">
                      {post.clip_code}
                    </td>
                    <td
                      className="px-5 py-3.5 text-[var(--text-2)] text-[13px] tabular-nums whitespace-nowrap"
                      style={{ fontFamily: 'var(--font-mono)' }}
                    >
                      {post.date}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                        style={{
                          background:
                            post.platform === 'youtube'
                              ? 'rgba(255,68,68,0.15)'
                              : 'rgba(200,85,232,0.15)',
                          color: post.platform === 'youtube' ? '#FF4444' : '#C855E8',
                        }}
                      >
                        {post.platform === 'youtube' ? 'YouTube' : 'Instagram'}
                      </span>
                    </td>
                    {selectedMetrics.map((k) => {
                      const val = getMetricValue(post, k);
                      const display =
                        METRIC_AGG[k] === 'sum' ? formatNum(val) : val.toFixed(2);
                      return (
                        <td
                          key={k}
                          className="px-5 py-3.5 text-[var(--text-2)] text-[13px] tabular-nums"
                          style={{ fontFamily: 'var(--font-mono)' }}
                        >
                          {display}
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
