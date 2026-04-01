'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { UnifiedPost, DateRange } from '@/types';
import { formatNum } from '@/lib/utils';
import { useVideoModal } from '@/context/VideoModalContext';
import { getLatestPostsPerClip } from '@/lib/db';
import {
  BarChart, Bar, AreaChart, Area, RadialBarChart, RadialBar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell,
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

// Chart type routing
const HORIZONTAL_BAR_METRICS = new Set([
  'views', 'impressions', 'likes', 'comments', 'shares', 'plays', 'reach', 'saves',
  'profile_visits', 'follows', 'accounts_reached', 'accounts_engaged', 'unique_viewers',
  'youtube_premium_views', 'daily_engaged_views', 'total_engaged_views', 'hypes',
  'hype_points', 'duration_seconds', 'post_subscribers', 'dislikes',
]);

const RADIALBAR_METRICS = new Set([
  'impression_ctr', 'avg_view_percentage', 'stayed_to_watch_pct',
  'engagement_rate', 'avg_view_duration_seconds',
]);

const AREA_METRICS = new Set(['watch_time_hours', 'watch_time_minutes']);

// Paired metrics that collapse into a single combined card
const STACKED_PAIRS: Record<string, [string, string]> = {
  new_returning: ['new_viewers', 'returning_viewers'],
  casual_regular: ['casual_viewers', 'regular_viewers'],
};

const CANONICAL_LABELS: Record<string, string> = {
  new_returning: 'New + Returning Viewers',
  casual_regular: 'Casual + Regular Viewers',
  subscribers_net: 'Subscriber Movement',
};

function getCanonicalKey(key: string): string {
  if (key === 'new_viewers' || key === 'returning_viewers') return 'new_returning';
  if (key === 'casual_viewers' || key === 'regular_viewers') return 'casual_regular';
  if (key === 'subscribers_gained' || key === 'subscribers_lost') return 'subscribers_net';
  return key;
}

function getCardLabel(canonicalKey: string): string {
  return CANONICAL_LABELS[canonicalKey] ?? METRIC_LABELS[canonicalKey] ?? canonicalKey;
}

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

function getShortCode(code: string): string {
  const idx = code.indexOf('-');
  return idx === -1 ? code : code.slice(idx + 1);
}

function getCardTotal(canonicalKey: string, clips: UnifiedPost[]): number {
  if (canonicalKey === 'new_returning') {
    return clips.reduce((s, p) => s + getMetricValue(p, 'new_viewers') + getMetricValue(p, 'returning_viewers'), 0);
  }
  if (canonicalKey === 'casual_regular') {
    return clips.reduce((s, p) => s + getMetricValue(p, 'casual_viewers') + getMetricValue(p, 'regular_viewers'), 0);
  }
  if (canonicalKey === 'subscribers_net') {
    return clips.reduce((s, p) => s + getMetricValue(p, 'subscribers_gained') - getMetricValue(p, 'subscribers_lost'), 0);
  }
  const isAvg = AVG_METRICS.has(canonicalKey);
  const values = clips.map((p) => getMetricValue(p, canonicalKey));
  if (!values.length) return 0;
  return isAvg
    ? values.reduce((s, v) => s + v, 0) / values.length
    : values.reduce((s, v) => s + v, 0);
}

function cardHasData(canonicalKey: string, clips: UnifiedPost[]): boolean {
  if (canonicalKey === 'new_returning') {
    return clips.some((p) => getMetricValue(p, 'new_viewers') > 0 || getMetricValue(p, 'returning_viewers') > 0);
  }
  if (canonicalKey === 'casual_regular') {
    return clips.some((p) => getMetricValue(p, 'casual_viewers') > 0 || getMetricValue(p, 'regular_viewers') > 0);
  }
  if (canonicalKey === 'subscribers_net') {
    return clips.some((p) => getMetricValue(p, 'subscribers_gained') > 0 || getMetricValue(p, 'subscribers_lost') > 0);
  }
  return clips.some((p) => p.clip_code && getMetricValue(p, canonicalKey) > 0);
}

// Shared tooltip style
const TOOLTIP_STYLE: React.CSSProperties = {
  background: '#1d1d1d',
  border: '1px solid rgba(247,231,206,0.1)',
  borderRadius: 8,
  padding: '6px 10px',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
};

interface CardTooltipPayload {
  clipCode: string;
  formatted: string;
}

function CardTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: CardTooltipPayload }[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={TOOLTIP_STYLE}>
      <p style={{ color: 'rgba(247,231,206,0.45)', marginBottom: 2 }}>{d.clipCode}</p>
      <p style={{ color: 'rgba(247,231,206,0.9)', fontWeight: 600 }}>{d.formatted}</p>
    </div>
  );
}

// Dispatches to the correct chart type based on canonicalKey
function CardChart({
  canonicalKey,
  clips,
  platformColor,
}: {
  canonicalKey: string;
  clips: UnifiedPost[];
  platformColor: string;
}) {
  const withCode = clips.filter((p) => p.clip_code);

  // STACKED BAR — viewer composition pairs
  if (STACKED_PAIRS[canonicalKey]) {
    const [key1, key2] = STACKED_PAIRS[canonicalKey];
    const data = withCode.map((p) => ({
      clipCode: p.clip_code!,
      shortCode: getShortCode(p.clip_code!),
      series1: getMetricValue(p, key1),
      series2: getMetricValue(p, key2),
    }));
    const label1 = METRIC_LABELS[key1] ?? key1;
    const label2 = METRIC_LABELS[key2] ?? key2;
    return (
      <ResponsiveContainer width="100%" height={80}>
        <BarChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="shortCode"
            tick={{ fill: 'rgba(247,231,206,0.25)', fontSize: 8, fontFamily: 'JetBrains Mono' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis hide />
          <Tooltip
            cursor={{ fill: 'rgba(247,231,206,0.03)' }}
            content={(props) => {
              if (!props.active || !props.payload?.length) return null;
              const row = props.payload[0].payload as { clipCode: string; series1: number; series2: number };
              return (
                <div style={TOOLTIP_STYLE}>
                  <p style={{ color: 'rgba(247,231,206,0.45)', marginBottom: 4 }}>{row.clipCode}</p>
                  <p style={{ color: 'rgba(247,231,206,0.9)', fontWeight: 600 }}>
                    {label1}: {formatNum(row.series1)}
                  </p>
                  <p style={{ color: 'rgba(247,231,206,0.55)', fontWeight: 600 }}>
                    {label2}: {formatNum(row.series2)}
                  </p>
                </div>
              );
            }}
          />
          <Bar dataKey="series1" stackId="a" fill={platformColor} fillOpacity={1} maxBarSize={24} />
          <Bar dataKey="series2" stackId="a" fill={platformColor} fillOpacity={0.4} radius={[2, 2, 0, 0]} maxBarSize={24} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // DIVERGING BAR — subscriber movement
  if (canonicalKey === 'subscribers_net') {
    const data = withCode.map((p) => ({
      clipCode: p.clip_code!,
      shortCode: getShortCode(p.clip_code!),
      gained: getMetricValue(p, 'subscribers_gained'),
      lost: -getMetricValue(p, 'subscribers_lost'),
    }));
    const chartHeight = Math.max(80, Math.min(data.length * 22, 160));
    return (
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart layout="vertical" data={data} margin={{ top: 0, right: 4, left: 0, bottom: 0 }}>
          <XAxis type="number" domain={['auto', 'auto']} hide />
          <YAxis
            type="category"
            dataKey="shortCode"
            tick={{ fill: 'rgba(247,231,206,0.25)', fontSize: 8, fontFamily: 'JetBrains Mono' }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <ReferenceLine x={0} stroke="rgba(247,231,206,0.1)" />
          <Tooltip
            cursor={{ fill: 'rgba(247,231,206,0.03)' }}
            content={(props) => {
              if (!props.active || !props.payload?.length) return null;
              const row = props.payload[0].payload as { clipCode: string; gained: number; lost: number };
              return (
                <div style={TOOLTIP_STYLE}>
                  <p style={{ color: 'rgba(247,231,206,0.45)', marginBottom: 4 }}>{row.clipCode}</p>
                  <p style={{ color: platformColor, fontWeight: 600 }}>
                    +{formatNum(row.gained)} gained
                  </p>
                  <p style={{ color: '#cc6666', fontWeight: 600 }}>
                    -{formatNum(Math.abs(row.lost))} lost
                  </p>
                </div>
              );
            }}
          />
          <Bar dataKey="gained" fill={platformColor} fillOpacity={0.75} radius={[0, 2, 2, 0]} maxBarSize={14} />
          <Bar dataKey="lost" fill="#cc4444" fillOpacity={0.6} radius={[2, 0, 0, 2]} maxBarSize={14} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // HORIZONTAL BAR — volume metrics
  if (HORIZONTAL_BAR_METRICS.has(canonicalKey)) {
    const data = withCode.map((p) => {
      const val = getMetricValue(p, canonicalKey);
      return {
        clipCode: p.clip_code!,
        shortCode: getShortCode(p.clip_code!),
        value: val,
        formatted: formatMetricValue(canonicalKey, val),
      };
    });
    const chartHeight = Math.max(80, Math.min(data.length * 22, 160));
    return (
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart layout="vertical" data={data} margin={{ top: 0, right: 4, left: 0, bottom: 0 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="shortCode"
            tick={{ fill: 'rgba(247,231,206,0.25)', fontSize: 8, fontFamily: 'JetBrains Mono' }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip content={<CardTooltip />} cursor={{ fill: 'rgba(247,231,206,0.03)' }} />
          <Bar dataKey="value" fill={platformColor} fillOpacity={0.75} radius={[0, 2, 2, 0]} maxBarSize={14} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // RADIAL BAR — rate and quality metrics
  if (RADIALBAR_METRICS.has(canonicalKey)) {
    const data = withCode.map((p) => {
      const val = getMetricValue(p, canonicalKey);
      return {
        clipCode: p.clip_code!,
        shortCode: getShortCode(p.clip_code!),
        value: val,
        formatted: formatMetricValue(canonicalKey, val),
      };
    });
    const n = data.length;
    return (
      <ResponsiveContainer width="100%" height={100}>
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius="25%"
          outerRadius="90%"
          data={data}
          startAngle={180}
          endAngle={0}
        >
          <RadialBar dataKey="value" background={{ fill: 'rgba(247,231,206,0.03)' }}>
            {data.map((_, i) => (
              <Cell
                key={i}
                fill={platformColor}
                fillOpacity={n <= 1 ? 0.75 : 0.2 + 0.8 * ((i + 1) / n)}
              />
            ))}
          </RadialBar>
          <Tooltip content={<CardTooltip />} />
        </RadialBarChart>
      </ResponsiveContainer>
    );
  }

  // AREA CHART — watch time metrics
  if (AREA_METRICS.has(canonicalKey)) {
    const data = withCode.map((p) => {
      const val = getMetricValue(p, canonicalKey);
      return {
        clipCode: p.clip_code!,
        shortCode: getShortCode(p.clip_code!),
        value: val,
        formatted: formatMetricValue(canonicalKey, val),
      };
    });
    return (
      <ResponsiveContainer width="100%" height={80}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="shortCode"
            tick={{ fill: 'rgba(247,231,206,0.25)', fontSize: 8, fontFamily: 'JetBrains Mono' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis hide />
          <Tooltip content={<CardTooltip />} cursor={{ fill: 'rgba(247,231,206,0.03)' }} />
          <Area
            dataKey="value"
            fill={platformColor}
            fillOpacity={0.3}
            stroke={platformColor}
            strokeWidth={1.5}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return null;
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
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getLatestPostsPerClip().then(setClipData).catch(console.error);
  }, []);

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

  // Clip data filtered by active platform (for metric cards)
  const filteredClips = useMemo(
    () => clipData.filter((p) => p.platform === platform),
    [clipData, platform],
  );

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
      } else {
        aVal = getMetricValue(a, sortCol);
        bVal = getMetricValue(b, sortCol);
      }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtered, sortCol, sortDir]);

  // Collapse paired metrics into canonical keys, preserving selection order
  const cardList = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const key of selectedMetrics) {
      const canonical = getCanonicalKey(key);
      if (!seen.has(canonical)) {
        seen.add(canonical);
        result.push(canonical);
      }
    }
    return result;
  }, [selectedMetrics]);

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
          {cardList.map((canonicalKey) => {
            const total = getCardTotal(canonicalKey, filteredClips);
            const hasData = cardHasData(canonicalKey, filteredClips);
            const label = getCardLabel(canonicalKey);
            const totalDisplay =
              canonicalKey === 'subscribers_net'
                ? total >= 0
                  ? `+${formatNum(total)}`
                  : `-${formatNum(Math.abs(total))}`
                : canonicalKey === 'new_returning' || canonicalKey === 'casual_regular'
                ? formatNum(total)
                : formatMetricValue(canonicalKey, total);

            return (
              <div
                key={canonicalKey}
                className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl px-4 pt-4 pb-3 hover:border-[rgba(247,231,206,0.1)] transition-colors overflow-hidden"
                style={{
                  borderLeft: `3px solid ${platform === 'youtube' ? 'rgba(255,68,68,0.25)' : 'rgba(200,85,232,0.25)'}`,
                }}
              >
                <p className="text-[10px] tracking-[0.14em] uppercase text-[var(--text-3)] mb-1 font-semibold">
                  {label}
                </p>
                <p
                  className="text-2xl font-bold leading-none tabular-nums mb-3"
                  style={{ color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}
                >
                  {totalDisplay}
                </p>
                {hasData ? (
                  <CardChart
                    canonicalKey={canonicalKey}
                    clips={filteredClips}
                    platformColor={platformColor}
                  />
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
                      const val = getMetricValue(post, k);
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
