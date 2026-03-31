'use client';

import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Platform, UnifiedPost } from '@/types';

interface Props {
  posts: UnifiedPost[];
  activePlatforms?: Platform[];
  rangeLabel?: string;
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

const COLOR_YT = '#FF4444';
const COLOR_IG = '#C855E8';
const COLOR_MIXED = '#E34C96';

export default function ViewsLineChart({ posts, rangeLabel }: Props) {
  const clipMap: Record<string, { ytViews: number; igViews: number }> = {};

  for (const p of posts) {
    const key = p.clip_code || p.title;
    if (!clipMap[key]) clipMap[key] = { ytViews: 0, igViews: 0 };
    if (p.platform === 'youtube') clipMap[key].ytViews += p.views;
    else clipMap[key].igViews += p.views;
  }

  const data = Object.entries(clipMap)
    .map(([clip, { ytViews, igViews }]) => {
      const views = ytViews + igViews;
      const color =
        ytViews > 0 && igViews > 0 ? COLOR_MIXED :
        ytViews > 0 ? COLOR_YT : COLOR_IG;
      return { clip, views, color };
    })
    .sort((a, b) => b.views - a.views);

  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: { value: number }[];
    label?: string;
  }) => {
    if (!active || !payload?.length) return null;
    return (
      <div
        className="border border-[rgba(247,231,206,0.09)] rounded-xl shadow-2xl px-3 py-2.5 min-w-[160px]"
        style={{ background: '#1d1d1d', fontFamily: 'var(--font-mono)', fontSize: 11 }}
      >
        <p className="text-[var(--text-3)] mb-2 pb-2 border-b border-[rgba(247,231,206,0.06)] truncate max-w-[200px]">{label}</p>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[var(--text-2)]">Views</span>
          <span className="text-[var(--text-1)] font-semibold tabular-nums">{formatViews(payload[0].value)}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl p-5">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-[15px] font-semibold text-[var(--text-1)] leading-none">
          Views by Clip
        </h2>
        {rangeLabel && (
          <span className="text-[10px] tracking-[0.12em] text-[var(--text-3)] uppercase" style={{ fontFamily: 'var(--font-mono)' }}>
            {rangeLabel}
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 60 }}>
          <CartesianGrid strokeDasharray="2 6" stroke="rgba(247,231,206,0.03)" vertical={false} />
          <XAxis
            dataKey="clip"
            tick={{ fill: '#47403a', fontSize: 9, fontFamily: 'JetBrains Mono' }}
            axisLine={{ stroke: 'transparent' }}
            tickLine={false}
            angle={-45}
            textAnchor="end"
            interval={0}
            dy={6}
          />
          <YAxis
            tickFormatter={formatViews}
            tick={{ fill: '#47403a', fontSize: 10, fontFamily: 'JetBrains Mono' }}
            axisLine={{ stroke: 'transparent' }}
            tickLine={false}
            width={40}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(247,231,206,0.03)' }} />
          <Bar dataKey="views" radius={[3, 3, 0, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
