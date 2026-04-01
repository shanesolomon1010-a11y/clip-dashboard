'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { UnifiedPost, DateRange } from '@/types';
import { formatNum } from '@/lib/utils';
import { useVideoModal } from '@/context/VideoModalContext';
import { getAllPostsByDate, getTotalViewsPerClip } from '@/lib/db';
import {
  LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';

type AnalyticsPlatform = 'youtube' | 'instagram';
type SortDir = 'asc' | 'desc';

const METRIC_LABELS: Record<string, string> = {
  views: 'Views',
  daily_engaged_views: 'Daily Engaged Views',
  total_engaged_views: 'Total Engaged Views',
  watch_time_hours: 'Watch Time (hrs)',
  watch_time_minutes: 'Watch Time (min)',
  avg_view_duration_seconds: 'Avg View Duration',
  avg_view_percentage: 'Avg View %',
  impressions: 'Impressions',
  impression_ctr: 'Impression CTR',
  likes: 'Likes',
  dislikes: 'Dislikes',
  shares: 'Shares',
  comments: 'Comments',
  subscribers_gained: 'Subscribers Gained',
  subscribers_lost: 'Subscribers Lost',
  unique_viewers: 'Unique Viewers',
  youtube_premium_views: 'YouTube Premium Views',
  duration_seconds: 'Duration (sec)',
  stayed_to_watch_pct: 'Stayed to Watch %',
  new_viewers: 'New Viewers',
  returning_viewers: 'Returning Viewers',
  casual_viewers: 'Casual Viewers',
  regular_viewers: 'Regular Viewers',
  hypes: 'Hypes',
  hype_points: 'Hype Points',
  post_subscribers: 'Post Subscribers',
  plays: 'Plays',
  reach: 'Reach',
  saves: 'Saves',
  profile_visits: 'Profile Visits',
  follows: 'Follows',
  accounts_reached: 'Accounts Reached',
  accounts_engaged: 'Accounts Engaged',
  engagement_rate: 'Engagement Rate',
};

const YOUTUBE_METRICS = [
  'views', 'daily_engaged_views', 'total_engaged_views', 'watch_time_hours',
  'watch_time_minutes', 'avg_view_duration_seconds', 'avg_view_percentage',
  'impressions', 'impression_ctr', 'likes', 'dislikes', 'shares', 'comments',
  'subscribers_gained', 'subscribers_lost', 'unique_viewers', 'youtube_premium_views',
  'duration_seconds', 'stayed_to_watch_pct', 'new_viewers', 'returning_viewers',
  'casual_viewers', 'regular_viewers', 'hypes', 'hype_points', 'post_subscribers',
];

const INSTAGRAM_METRICS = [
  'views', 'plays', 'likes', 'comments', 'shares', 'reach', 'saves',
  'profile_visits', 'follows', 'accounts_reached', 'accounts_engaged', 'engagement_rate',
];

const YOUTUBE_DEFAULTS = [
  'views', 'daily_engaged_views', 'impressions', 'impression_ctr', 'avg_view_duration_seconds', 'likes',
];
const INSTAGRAM_DEFAULTS = ['views', 'likes', 'comments', 'shares'];

// Metrics that are averaged across clips rather than summed
const AVG_METRICS = new Set([
  'impression_ctr', 'avg_view_percentage', 'avg_view_duration_seconds',
  'stayed_to_watch_pct', 'engagement_rate',
]);

// Metrics whose formatted value gets a % suffix
const PCT_METRICS = new Set([
  'impression_ctr', 'avg_view_percentage', 'stayed_to_watch_pct', 'engagement_rate',
]);


function getMetricValue(post: UnifiedPost, key: string): number {
  if (key === 'views') {
    return post.platform === 'instagram' ? (post.plays ?? post.views) : post.views;
  }
  if (key === 'engagement_rate') {
    return post.engagement_rate ?? post.engagementRate ?? 0;
  }
  const val = post[key as keyof UnifiedPost];
  return typeof val === 'number' ? val : 0;
}

function formatMetricValue(key: string, val: number): string {
  if (key === 'avg_view_duration_seconds') {
    const m = Math.floor(val / 60);
    const s = Math.floor(val % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
  if (key === 'watch_time_hours' || key === 'watch_time_minutes') {
    return val.toFixed(1);
  }
  if (PCT_METRICS.has(key)) {
    return `${val.toFixed(2)}%`;
  }
  return formatNum(val);
}


function getCardTotal(metric: string, rows: UnifiedPost[]): number {
  if (AVG_METRICS.has(metric)) {
    const nonZero = rows.map((p) => getMetricValue(p, metric)).filter((v) => v > 0);
    return nonZero.length ? nonZero.reduce((s, v) => s + v, 0) / nonZero.length : 0;
  }
  return rows.reduce((s, p) => s + getMetricValue(p, metric), 0);
}

function cardHasData(metric: string, rows: UnifiedPost[]): boolean {
  return rows.some((p) => getMetricValue(p, metric) > 0);
}

const TOOLTIP_STYLE: React.CSSProperties = {
  background: '#1d1d1d',
  border: '1px solid rgba(247,231,206,0.1)',
  borderRadius: 8,
  padding: '6px 10px',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
};

const LINE_COLORS = [
  '#FF4444', '#FF8C42', '#FFD166', '#06D6A0',
  '#118AB2', '#7B2FBE', '#F72585', '#4CC9F0',
];

function formatStatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function yTickFormatter(metric: string, val: number): string {
  if (metric === 'avg_view_duration_seconds') {
    const m = Math.floor(val / 60);
    const s = Math.floor(val % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
  if (metric === 'watch_time_hours' || metric === 'watch_time_minutes') {
    return val.toFixed(1);
  }
  if (PCT_METRICS.has(metric)) {
    return `${val.toFixed(1)}%`;
  }
  return formatNum(val);
}

function CardLineChart({ metric, rows }: { metric: string; rows: UnifiedPost[] }) {
  const clipCodes = Array.from(
    new Set(rows.filter((p) => p.clip_code).map((p) => p.clip_code!))
  );
  const allDates = Array.from(
    new Set(rows.filter((p) => p.stat_date).map((p) => p.stat_date!))
  ).sort();

  const chartData = allDates.map((date) => {
    const entry: Record<string, string | number> = { date, label: formatStatDate(date) };
    for (const code of clipCodes) {
      const row = rows.find((p) => p.clip_code === code && p.stat_date === date);
      if (row != null) entry[code] = getMetricValue(row, metric);
    }
    return entry;
  });

  return (
    <div>
      <ResponsiveContainer width="100%" height={100}>
        <LineChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fill: 'rgba(247,231,206,0.25)', fontSize: 8, fontFamily: 'JetBrains Mono' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            hide={false}
            width={45}
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(val: number) => yTickFormatter(metric, val)}
          />
          <Tooltip
            content={(props) => {
              if (!props.active || !props.payload?.length) return null;
              return (
                <div style={TOOLTIP_STYLE}>
                  <p style={{ color: 'rgba(247,231,206,0.45)', marginBottom: 4 }}>{props.label as string}</p>
                  {(props.payload as unknown as { name: string; value: number; color: string }[]).map((entry) => (
                    <p key={entry.name} style={{ color: entry.color, fontWeight: 600 }}>
                      {entry.name}: {formatMetricValue(metric, entry.value)}
                    </p>
                  ))}
                </div>
              );
            }}
          />
          {clipCodes.map((code, i) => (
            <Line
              key={code}
              dataKey={code}
              stroke={LINE_COLORS[i % LINE_COLORS.length]}
              strokeWidth={1.5}
              dot={{ r: 2, fill: LINE_COLORS[i % LINE_COLORS.length] }}
              activeDot={{ r: 3 }}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {clipCodes.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
          {clipCodes.map((code, i) => (
            <div key={code} className="flex items-center gap-1">
              <div
                style={{
                  width: 12,
                  height: 2,
                  borderRadius: 1,
                  background: LINE_COLORS[i % LINE_COLORS.length],
                }}
              />
              <span
                style={{
                  fontSize: 9,
                  color: 'rgba(247,231,206,0.4)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {code}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  posts: UnifiedPost[];
}

export default function AnalyticsView({ posts }: Props) {
  const { open: openModal } = useVideoModal();
  const [platform, setPlatform] = useState<AnalyticsPlatform>('youtube');
  const [dateRange, setDateRange] = useState<Exclude<DateRange, '1d'>>('30d');
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(YOUTUBE_DEFAULTS);
  const [metricDropOpen, setMetricDropOpen] = useState(false);
  const [sortCol, setSortCol] = useState<string>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [clipData, setClipData] = useState<UnifiedPost[]>([]);
  const [clipViewTotals, setClipViewTotals] = useState<Record<string, number>>({});
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getAllPostsByDate(platform).then(setClipData).catch(console.error);
    getTotalViewsPerClip(platform).then((totals) => {
      const map: Record<string, number> = {};
      for (const t of totals) map[t.clip_code] = t.total_views;
      setClipViewTotals(map);
    }).catch(() => setClipViewTotals({}));
  }, [platform]);

  useEffect(() => {
    setSelectedMetrics(platform === 'youtube' ? YOUTUBE_DEFAULTS : INSTAGRAM_DEFAULTS);
  }, [platform]);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setMetricDropOpen(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  // Clip data for metric cards (already filtered by platform via getAllPostsByDate)
  const filteredClips = clipData;

  // Posts filtered by platform + date (for the table)
  const filtered = useMemo(() => {
    let result = posts.filter((p) => p.platform === platform);
    if (dateRange !== 'all') {
      const cutoff = new Date();
      if (dateRange === '7d') cutoff.setDate(cutoff.getDate() - 7);
      else if (dateRange === '30d') cutoff.setDate(cutoff.getDate() - 30);
      else if (dateRange === '90d') cutoff.setDate(cutoff.getDate() - 90);
      result = result.filter((p) => p.date >= cutoff.toISOString().slice(0, 10));
    }
    return result;
  }, [posts, platform, dateRange]);

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
      } else if (sortCol === 'views') {
        aVal = clipViewTotals[a.clip_code ?? ''] ?? getMetricValue(a, sortCol);
        bVal = clipViewTotals[b.clip_code ?? ''] ?? getMetricValue(b, sortCol);
      } else {
        aVal = getMetricValue(a, sortCol);
        bVal = getMetricValue(b, sortCol);
      }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtered, sortCol, sortDir, clipViewTotals]);

  const cardList = selectedMetrics;

  function handleSort(col: string) {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  }

  function exportCSV() {
    const metricCols = selectedMetrics.map((k) => METRIC_LABELS[k] ?? k);
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

  function toggleMetric(key: string) {
    setSelectedMetrics((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  const platformColor = platform === 'youtube' ? '#FF4444' : '#C855E8';
  const platformMetrics = platform === 'youtube' ? YOUTUBE_METRICS : INSTAGRAM_METRICS;

  const pillBase =
    'px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer select-none';

  return (
    <div className="p-5 space-y-5">
      {/* Platform toggle */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-1 bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-full p-1">
          {(
            [
              { val: 'youtube', label: 'YouTube' },
              { val: 'instagram', label: 'Instagram' },
            ] as { val: AnalyticsPlatform; label: string }[]
          ).map(({ val, label }) => {
            const active = platform === val;
            const bg = active
              ? val === 'youtube'
                ? '#FF4444'
                : '#C855E8'
              : 'transparent';
            return (
              <button
                key={val}
                onClick={() => setPlatform(val)}
                className={pillBase}
                style={{ background: bg, color: active ? '#fff' : 'var(--text-3)' }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Metric selector */}
      <div className="relative" ref={dropRef}>
        <button
          onClick={() => setMetricDropOpen((v) => !v)}
          className="flex items-center gap-2 flex-wrap bg-[var(--bg-card)] border border-[rgba(247,231,206,0.08)] rounded-xl px-3 py-2 hover:border-[rgba(247,231,206,0.15)] transition-colors min-w-[200px] text-left"
        >
          <span className="text-[11px] text-[var(--text-3)] shrink-0">Select Metrics</span>
          {selectedMetrics.length > 0 && (
            <span className="text-[11px] text-[var(--text-3)]">
              ({selectedMetrics.length} selected)
            </span>
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
          <div className="absolute z-50 top-full mt-2 left-0 bg-[var(--bg-card)] border border-[rgba(247,231,206,0.1)] rounded-2xl shadow-2xl p-4 min-w-[260px] max-h-[400px] overflow-y-auto">
            <div className="space-y-1">
              {platformMetrics.map((key) => (
                <label
                  key={key}
                  className="flex items-center gap-2.5 cursor-pointer rounded-lg px-2 py-1.5 hover:bg-[rgba(247,231,206,0.04)] transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedMetrics.includes(key)}
                    onChange={() => toggleMetric(key)}
                    className="w-3.5 h-3.5"
                    style={{ accentColor: platformColor }}
                  />
                  <span className="text-[13px] text-[var(--text-2)]">
                    {METRIC_LABELS[key] ?? key}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Metric card grid */}
      {cardList.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cardList.map((metric) => {
            const total = getCardTotal(metric, filteredClips);
            const hasData = cardHasData(metric, filteredClips);
            const label = METRIC_LABELS[metric] ?? metric;
            const totalDisplay = formatMetricValue(metric, total);
            const totalLabel = AVG_METRICS.has(metric) ? 'Avg' : 'Total';

            return (
              <div
                key={metric}
                className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl px-4 pt-4 pb-3 hover:border-[rgba(247,231,206,0.1)] transition-colors overflow-hidden"
                style={{
                  borderLeft: `3px solid ${platform === 'youtube' ? 'rgba(255,68,68,0.25)' : 'rgba(200,85,232,0.25)'}`,
                }}
              >
                <p className="text-[10px] tracking-[0.14em] uppercase text-[var(--text-3)] mb-1 font-semibold">
                  {label}
                </p>
                <div className="flex items-baseline gap-1.5 mb-3">
                  <p
                    className="text-2xl font-bold leading-none tabular-nums"
                    style={{ color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}
                  >
                    {totalDisplay}
                  </p>
                  <span className="text-[10px] text-[var(--text-3)]">{totalLabel}</span>
                </div>
                {hasData ? (
                  <CardLineChart metric={metric} rows={filteredClips} />
                ) : (
                  <div className="h-[72px] flex items-center justify-center">
                    <span className="text-[12px] text-[var(--text-3)]">No data</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Clip details table */}
      <div className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[rgba(247,231,206,0.04)] flex items-center justify-between gap-3">
          <h3 className="text-[15px] font-semibold text-[var(--text-1)]">Clip Details</h3>
          <div className="flex items-center gap-2">
            {/* Date range for table */}
            <div className="flex gap-1 bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-full p-0.5">
              {(['7d', '30d', '90d', 'all'] as Exclude<DateRange, '1d'>[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setDateRange(r)}
                  className="px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all cursor-pointer select-none"
                  style={{
                    background: dateRange === r ? 'var(--gold)' : 'transparent',
                    color: dateRange === r ? '#000' : 'var(--text-3)',
                  }}
                >
                  {r === 'all' ? 'All' : r.toUpperCase()}
                </button>
              ))}
            </div>
            <button
              onClick={exportCSV}
              disabled={sortedPosts.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-[rgba(247,231,206,0.08)] text-[var(--text-2)] hover:text-[var(--text-1)] hover:border-[rgba(247,231,206,0.15)] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Export CSV
            </button>
          </div>
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
                      {METRIC_LABELS[k] ?? k} {sortCol === k && (sortDir === 'asc' ? '↑' : '↓')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(247,231,206,0.04)]">
                {sortedPosts.map((post) => (
                  <tr
                    key={post.id}
                    className="hover:bg-[rgba(247,231,206,0.04)] transition-colors cursor-pointer"
                    onClick={() => openModal(post, post.clip_code ?? '')}
                  >
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
                      const val = k === 'views' && post.clip_code
                        ? (clipViewTotals[post.clip_code] ?? getMetricValue(post, k))
                        : getMetricValue(post, k);
                      return (
                        <td
                          key={k}
                          className="px-5 py-3.5 text-[var(--text-2)] text-[13px] tabular-nums"
                          style={{ fontFamily: 'var(--font-mono)' }}
                        >
                          {formatMetricValue(k, val)}
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
