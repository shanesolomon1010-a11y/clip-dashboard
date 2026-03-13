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

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { payload: { label: string; views: number } }[] }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs shadow-xl">
        <p className="text-white font-semibold">{d.label}</p>
        <p className="text-gray-400 mt-1">
          <span className="text-white font-bold">{formatViews(d.views)}</span> total views
        </p>
      </div>
    );
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-500 mb-4">Views by Platform</h2>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart
          data={totals}
          layout="vertical"
          margin={{ top: 0, right: 24, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={formatViews}
            tick={{ fill: '#6b7280', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ fill: '#9ca3af', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={72}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#ffffff08' }} />
          <Bar dataKey="views" radius={[0, 4, 4, 0]} maxBarSize={28}>
            {totals.map((entry) => (
              <Cell key={entry.platform} fill={PLATFORM_COLORS[entry.platform]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
