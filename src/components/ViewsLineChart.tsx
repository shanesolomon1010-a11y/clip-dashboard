'use client';

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { Platform, PLATFORM_COLORS, PLATFORM_LABELS, UnifiedPost } from '@/types';

interface Props {
  posts: UnifiedPost[];
  activePlatforms: Platform[];
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export default function ViewsLineChart({ posts, activePlatforms }: Props) {
  const dateMap: Record<string, Record<Platform, number>> = {};

  for (const p of posts) {
    if (!dateMap[p.date]) dateMap[p.date] = {} as Record<Platform, number>;
    dateMap[p.date][p.platform] = (dateMap[p.date][p.platform] || 0) + p.views;
  }

  const data = Object.entries(dateMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({
      date: new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      ...vals,
    }));

  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: { dataKey: string; color: string; value: number }[];
    label?: string;
  }) => {
    if (!active || !payload?.length) return null;
    return (
      <div
        className="border border-white/[0.09] rounded-xl shadow-2xl px-3 py-2.5 min-w-[140px]"
        style={{ background: '#1d1d1d', fontFamily: 'var(--font-mono)', fontSize: 11 }}
      >
        <p className="text-[var(--text-3)] mb-2 pb-2 border-b border-white/[0.06]">{label}</p>
        <div className="space-y-1.5">
          {payload.map((entry) => (
            <div key={entry.dataKey} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full inline-block shrink-0" style={{ background: entry.color }} />
                <span className="text-[var(--text-2)]">{PLATFORM_LABELS[entry.dataKey as Platform]}</span>
              </div>
              <span className="text-[var(--text-1)] font-semibold tabular-nums">{formatViews(entry.value)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl p-5">
      <div className="flex items-center justify-between mb-5">
        <h2
          className="text-[15px] text-[var(--text-1)] leading-none"
          style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}
        >
          Views Over Time
        </h2>
        <span className="text-[10px] tracking-[0.12em] text-[var(--text-3)] uppercase" style={{ fontFamily: 'var(--font-mono)' }}>
          90-day window
        </span>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            {activePlatforms.map((platform) => (
              <linearGradient key={platform} id={`grad-${platform}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={PLATFORM_COLORS[platform]} stopOpacity={0.12} />
                <stop offset="95%" stopColor={PLATFORM_COLORS[platform]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="2 6" stroke="rgba(255,255,255,0.03)" vertical={false} fill="none" />
          <XAxis
            dataKey="date"
            tick={{ fill: '#47403a', fontSize: 10, fontFamily: 'JetBrains Mono' }}
            axisLine={{ stroke: 'transparent' }}
            tickLine={false}
            interval="preserveStartEnd"
            dy={6}
          />
          <YAxis
            tickFormatter={formatViews}
            tick={{ fill: '#47403a', fontSize: 10, fontFamily: 'JetBrains Mono' }}
            axisLine={{ stroke: 'transparent' }}
            tickLine={false}
            width={40}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.05)', strokeWidth: 1 }} />
          <Legend
            iconType="circle"
            iconSize={5}
            formatter={(value) => (
              <span style={{ color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
                {PLATFORM_LABELS[value as Platform]}
              </span>
            )}
            wrapperStyle={{ paddingTop: 14 }}
          />
          {activePlatforms.map((platform) => (
            <Area
              key={platform}
              type="monotone"
              dataKey={platform}
              stroke={PLATFORM_COLORS[platform]}
              strokeWidth={1.5}
              fill={`url(#grad-${platform})`}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
