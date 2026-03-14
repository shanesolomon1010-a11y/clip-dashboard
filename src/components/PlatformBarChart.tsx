'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
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

export default function PlatformBarChart({ posts, activePlatforms }: Props) {
  const totals = activePlatforms.map((platform) => ({
    platform,
    label: PLATFORM_LABELS[platform],
    views: posts.filter((p) => p.platform === platform).reduce((s, p) => s + p.views, 0),
  })).sort((a, b) => b.views - a.views);

  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: { payload: { label: string; views: number; platform: Platform } }[];
  }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div
        className="border border-white/[0.09] rounded-xl shadow-2xl px-3 py-2.5"
        style={{ background: '#1d1d1d', fontFamily: 'var(--font-mono)', fontSize: 11 }}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: PLATFORM_COLORS[d.platform] }} />
          <p className="text-[var(--text-1)] font-semibold">{d.label}</p>
        </div>
        <p className="text-[var(--text-2)]">
          <span className="text-[var(--text-1)] font-bold tabular-nums">{formatViews(d.views)}</span> views
        </p>
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
          Views by Platform
        </h2>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart
          data={totals}
          layout="vertical"
          margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="2 6" stroke="rgba(255,255,255,0.03)" vertical={false} horizontal={true} />
          <XAxis
            type="number"
            tickFormatter={formatViews}
            tick={{ fill: '#47403a', fontSize: 10, fontFamily: 'JetBrains Mono' }}
            axisLine={{ stroke: 'transparent' }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ fill: '#47403a', fontSize: 10, fontFamily: 'JetBrains Mono' }}
            axisLine={{ stroke: 'transparent' }}
            tickLine={false}
            width={76}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
          <Bar dataKey="views" radius={[0, 3, 3, 0]} maxBarSize={20}>
            {totals.map((entry) => (
              <Cell key={entry.platform} fill={PLATFORM_COLORS[entry.platform]} fillOpacity={0.75} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
