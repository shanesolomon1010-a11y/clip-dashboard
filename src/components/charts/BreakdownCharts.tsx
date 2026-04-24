'use client';

import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { getBreakdownTotals, BreakdownAggregate } from '@/lib/breakdowns-db';
import { formatNum } from '@/lib/utils';

export interface BreakdownChartProps {
  dateFrom?: string;
  dateTo?: string;
}

// ── Shared style constants ────────────────────────────────────────────────────

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

const TICK_STYLE = { fill: 'rgba(247,231,206,0.3)', fontSize: 10, fontFamily: 'JetBrains Mono' };
const AXIS_STYLE = { stroke: 'rgba(247,231,206,0.06)' };

// ── Label maps ────────────────────────────────────────────────────────────────

const TRAFFIC_SOURCE_LABELS: Record<string, string> = {
  SHORTS:               'Shorts Feed',
  YT_SEARCH:            'YouTube Search',
  EXT_URL:              'External',
  SUBSCRIBER:           'Subscriber Feed',
  NO_LINK_OTHER:        'Other',
  RECOMMENDED:          'Recommended',
  CHANNEL:              'Channel Page',
  BROWSE_FEATURES:      'Browse',
  NOTIFICATION:         'Notifications',
  DIRECT_OR_UNKNOWN:    'Direct',
  YT_OTHER_PAGE:        'YouTube (Other)',
  PROMOTED:             'Promoted',
  RELATED_VIDEO:        'Related Video',
  HASHTAGS:             'Hashtags',
};

const PLAYBACK_LOCATION_LABELS: Record<string, string> = {
  WATCH:     'Watch Page',
  EMBEDDED:  'Embedded',
  MOBILE:    'Mobile App',
  CHANNEL:   'Channel Page',
  SHORTS:    'Shorts',
  BROWSE:    'Browse',
  UNKNOWN:   'Unknown',
  YT_OTHER:  'YouTube (Other)',
};

const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States', GB: 'United Kingdom', CA: 'Canada',    AU: 'Australia',
  DE: 'Germany',       FR: 'France',         IN: 'India',     JP: 'Japan',
  BR: 'Brazil',        MX: 'Mexico',         NL: 'Netherlands', NZ: 'New Zealand',
  ZA: 'South Africa',  IE: 'Ireland',        SG: 'Singapore', PH: 'Philippines',
  NG: 'Nigeria',       KE: 'Kenya',          PK: 'Pakistan',  ID: 'Indonesia',
};

// ── Shared card wrapper ───────────────────────────────────────────────────────

function BreakdownCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl px-4 pt-4 pb-3"
      style={{ borderLeft: '3px solid rgba(255,68,68,0.25)' }}
    >
      <p className="text-[10px] tracking-[0.14em] uppercase text-[var(--text-3)] mb-1 font-semibold">
        {title}
      </p>
      {subtitle && (
        <p className="text-[10px] text-[var(--text-3)] mb-3">{subtitle}</p>
      )}
      {children}
    </div>
  );
}

function LoadingCard({ title }: { title: string }) {
  return (
    <BreakdownCard title={title}>
      <div className="h-[200px] flex items-center justify-center">
        <span className="text-[12px] text-[var(--text-3)]">Loading…</span>
      </div>
    </BreakdownCard>
  );
}

function EmptyCard({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <BreakdownCard title={title} subtitle={subtitle}>
      <div className="h-[200px] flex items-center justify-center">
        <span className="text-[12px] text-[var(--text-3)]">No data available</span>
      </div>
    </BreakdownCard>
  );
}

// ── Horizontal bar chart helper ───────────────────────────────────────────────

function HorizBarChart({
  data,
  yWidth = 130,
}: {
  data: { name: string; views: number; watchTime: number }[];
  yWidth?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 26)}>
      <BarChart
        layout="vertical"
        data={data}
        margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
      >
        <XAxis
          type="number"
          tick={TICK_STYLE}
          axisLine={AXIS_STYLE}
          tickLine={false}
          tickFormatter={formatNum}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={yWidth}
          tick={TICK_STYLE}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          content={(props) => {
            if (!props.active || !props.payload?.length) return null;
            const row = props.payload[0].payload as { name: string; views: number; watchTime: number };
            return (
              <div style={TOOLTIP_STYLE}>
                <p style={{ color: 'rgba(247,231,206,0.5)', marginBottom: 4 }}>{row.name}</p>
                <p style={{ color: LINE_COLORS[0], fontWeight: 600 }}>{formatNum(row.views)} views</p>
                <p style={{ color: 'rgba(247,231,206,0.45)' }}>{formatNum(Math.round(row.watchTime))} min watched</p>
              </div>
            );
          }}
        />
        <Bar dataKey="views" fill={LINE_COLORS[0]} radius={[0, 3, 3, 0]} maxBarSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Donut chart helper ────────────────────────────────────────────────────────

function DonutChart({
  items,
  colors,
  centerText,
  centerSub,
}: {
  items: { name: string; value: number }[];
  colors: string[];
  centerText: string;
  centerSub: string;
}) {
  const total = items.reduce((s, d) => s + d.value, 0);
  return (
    <div style={{ position: 'relative', height: 200 }}>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={items}
            cx="42%"
            cy="50%"
            innerRadius={58}
            outerRadius={82}
            dataKey="value"
            startAngle={90}
            endAngle={-270}
            strokeWidth={0}
          >
            {items.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <Tooltip
            content={(props) => {
              if (!props.active || !props.payload?.length) return null;
              const entry = (props.payload as unknown as { name: string; value: number; payload: { name: string; value: number } }[])[0];
              const pct = total > 0 ? ((entry.value / total) * 100).toFixed(1) : '0';
              return (
                <div style={TOOLTIP_STYLE}>
                  <p style={{ color: 'rgba(247,231,206,0.5)', marginBottom: 4 }}>{entry.payload.name}</p>
                  <p style={{ color: 'var(--gold)', fontWeight: 600 }}>{formatNum(entry.value)} views</p>
                  <p style={{ color: 'rgba(247,231,206,0.45)' }}>{pct}% of total</p>
                </div>
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Center label */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '42%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          pointerEvents: 'none',
          lineHeight: 1.3,
        }}
      >
        <div style={{ color: 'var(--gold)', fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
          {centerText}
        </div>
        <div style={{ color: 'rgba(247,231,206,0.4)', fontSize: 9, fontFamily: 'var(--font-mono)' }}>
          {centerSub}
        </div>
      </div>

      {/* Legend */}
      <div
        style={{
          position: 'absolute',
          right: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          minWidth: 120,
        }}
      >
        {items.map((item, i) => {
          const pct = total > 0 ? ((item.value / total) * 100).toFixed(0) : '0';
          return (
            <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: colors[i % colors.length], flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, color: 'rgba(247,231,206,0.45)', fontFamily: 'var(--font-mono)' }}>
                  {item.name}
                </div>
                <div style={{ fontSize: 10, color: 'rgba(247,231,206,0.7)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                  {formatNum(item.value)} · {pct}%
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 1. TrafficSourcesChart ────────────────────────────────────────────────────

export function TrafficSourcesChart({ dateFrom, dateTo }: BreakdownChartProps) {
  const [data, setData] = useState<BreakdownAggregate[] | null>(null);

  useEffect(() => {
    setData(null);
    getBreakdownTotals('insightTrafficSourceType', 'youtube', dateFrom, dateTo)
      .then(rows => setData(rows.slice(0, 10)))
      .catch(() => setData([]));
  }, [dateFrom, dateTo]);

  if (data === null) return <LoadingCard title="Traffic Sources" />;
  if (data.length === 0) return <EmptyCard title="Traffic Sources" />;

  const chartData = data.map(row => ({
    name: TRAFFIC_SOURCE_LABELS[row.dimension_value] ?? row.dimension_value,
    views: row.total_views,
    watchTime: row.total_watch_time_minutes,
  }));

  return (
    <BreakdownCard title="Traffic Sources">
      <HorizBarChart data={chartData} yWidth={140} />
    </BreakdownCard>
  );
}

// ── 2. DeviceDistributionChart ────────────────────────────────────────────────

const DEVICE_COLORS = [LINE_COLORS[0], LINE_COLORS[1], LINE_COLORS[2], '#888888'];
const DEVICE_LABELS: Record<string, string> = {
  MOBILE: 'Mobile', DESKTOP: 'Desktop', TABLET: 'Tablet', TV: 'TV', GAME_CONSOLE: 'Console',
};

export function DeviceDistributionChart({ dateFrom, dateTo }: BreakdownChartProps) {
  const [data, setData] = useState<BreakdownAggregate[] | null>(null);

  useEffect(() => {
    setData(null);
    getBreakdownTotals('deviceType', 'youtube', dateFrom, dateTo)
      .then(setData)
      .catch(() => setData([]));
  }, [dateFrom, dateTo]);

  if (data === null) return <LoadingCard title="Device Distribution" />;
  if (data.length === 0) return <EmptyCard title="Device Distribution" />;

  const items = data.map(row => ({
    name: DEVICE_LABELS[row.dimension_value] ?? row.dimension_value,
    value: row.total_views,
  }));
  const total = items.reduce((s, d) => s + d.value, 0);

  return (
    <BreakdownCard title="Device Distribution">
      <DonutChart
        items={items}
        colors={DEVICE_COLORS}
        centerText={formatNum(total)}
        centerSub="total views"
      />
    </BreakdownCard>
  );
}

// ── 3. SubscriberStatusChart ──────────────────────────────────────────────────

const SUB_COLORS = [LINE_COLORS[4], LINE_COLORS[0]];

export function SubscriberStatusChart({ dateFrom, dateTo }: BreakdownChartProps) {
  const [data, setData] = useState<BreakdownAggregate[] | null>(null);

  useEffect(() => {
    setData(null);
    getBreakdownTotals('subscribedStatus', 'youtube', dateFrom, dateTo)
      .then(setData)
      .catch(() => setData([]));
  }, [dateFrom, dateTo]);

  if (data === null) return <LoadingCard title="Subscriber Status" />;
  if (data.length === 0) return <EmptyCard title="Subscriber Status" />;

  const subRow   = data.find(r => r.dimension_value === 'SUBSCRIBED');
  const unsubRow = data.find(r => r.dimension_value === 'UNSUBSCRIBED');
  const total    = data.reduce((s, r) => s + r.total_views, 0);
  const unsubPct = total > 0 ? Math.round(((unsubRow?.total_views ?? 0) / total) * 100) : 0;

  const items = [
    { name: 'Subscribed',     value: subRow?.total_views ?? 0 },
    { name: 'Unsubscribed',   value: unsubRow?.total_views ?? 0 },
  ];

  return (
    <BreakdownCard title="Subscriber Status">
      <DonutChart
        items={items}
        colors={SUB_COLORS}
        centerText={`${unsubPct}%`}
        centerSub="new viewers"
      />
    </BreakdownCard>
  );
}

// ── 4. CountriesChart ─────────────────────────────────────────────────────────

export function CountriesChart(_props: BreakdownChartProps) {
  const [data, setData] = useState<BreakdownAggregate[] | null>(null);

  useEffect(() => {
    setData(null);
    getBreakdownTotals('country', 'youtube', undefined, undefined, true)
      .then(rows => setData(rows.slice(0, 10)))
      .catch(() => setData([]));
  }, []);

  if (data === null) return <LoadingCard title="Top Countries" />;
  if (data.length === 0) return <EmptyCard title="Top Countries" subtitle="Last 30 days" />;

  const chartData = data.map(row => ({
    name: COUNTRY_NAMES[row.dimension_value] ?? row.dimension_value,
    views: row.total_views,
    watchTime: row.total_watch_time_minutes,
  }));

  return (
    <BreakdownCard title="Top Countries" subtitle="Last 30 days">
      <HorizBarChart data={chartData} yWidth={120} />
    </BreakdownCard>
  );
}

// ── 5. PlaybackLocationChart ──────────────────────────────────────────────────

export function PlaybackLocationChart(_props: BreakdownChartProps) {
  const [data, setData] = useState<BreakdownAggregate[] | null>(null);

  useEffect(() => {
    setData(null);
    getBreakdownTotals('insightPlaybackLocationType', 'youtube', undefined, undefined, true)
      .then(setData)
      .catch(() => setData([]));
  }, []);

  if (data === null) return <LoadingCard title="Playback Location" />;
  if (data.length === 0) return <EmptyCard title="Playback Location" subtitle="Last 30 days" />;

  const chartData = data.map(row => ({
    name: PLAYBACK_LOCATION_LABELS[row.dimension_value] ?? row.dimension_value,
    views: row.total_views,
    watchTime: row.total_watch_time_minutes,
  }));

  return (
    <BreakdownCard title="Playback Location" subtitle="Last 30 days">
      <HorizBarChart data={chartData} yWidth={110} />
    </BreakdownCard>
  );
}
