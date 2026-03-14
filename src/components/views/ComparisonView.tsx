'use client';

import { useMemo, useState } from 'react';
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts';
import { Platform, PLATFORM_COLORS, PLATFORM_LABELS, UnifiedPost } from '@/types';

const ALL_PLATFORMS: Platform[] = ['tiktok', 'instagram', 'linkedin', 'twitter', 'youtube'];

type SortKey = 'platform' | 'views' | 'likes' | 'comments' | 'shares' | 'avgEngRate' | 'postCount' | 'avgViews';

interface PlatformStats {
  platform: Platform;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  avgEngRate: number;
  postCount: number;
  avgViews: number;
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'platform',    label: 'Platform' },
  { key: 'views',       label: 'Total Views' },
  { key: 'likes',       label: 'Total Likes' },
  { key: 'comments',    label: 'Comments' },
  { key: 'shares',      label: 'Shares' },
  { key: 'avgEngRate',  label: 'Avg Eng Rate' },
  { key: 'postCount',   label: 'Posts' },
  { key: 'avgViews',    label: 'Avg Views' },
];

interface RadarTooltipPayload {
  name: string;
  value: number;
  color: string;
}

interface RadarTooltipProps {
  active?: boolean;
  payload?: RadarTooltipPayload[];
  label?: string;
}

function RadarTooltip({ active, payload, label }: RadarTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="border border-white/[0.09] rounded-xl shadow-2xl px-3 py-2.5 min-w-[140px]"
      style={{ background: '#1d1d1d', fontSize: 11, fontFamily: 'var(--font-mono)' }}
    >
      <p className="text-[var(--text-3)] mb-2 pb-1 border-b border-white/[0.06]">{label}</p>
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: entry.color }} />
              <span className="text-[var(--text-2)]">{PLATFORM_LABELS[entry.name as Platform] ?? entry.name}</span>
            </div>
            <span className="text-[var(--text-1)] font-semibold">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface Props {
  posts: UnifiedPost[];
}

export default function ComparisonView({ posts }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('views');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  const platformStats = useMemo<PlatformStats[]>(() => {
    return ALL_PLATFORMS.map((pl) => {
      const pp = posts.filter((p) => p.platform === pl);
      const views = pp.reduce((s, p) => s + p.views, 0);
      const likes = pp.reduce((s, p) => s + p.likes, 0);
      const comments = pp.reduce((s, p) => s + p.comments, 0);
      const shares = pp.reduce((s, p) => s + p.shares, 0);
      const totalInter = pp.reduce((s, p) => s + p.likes + p.comments + p.shares + p.saves, 0);
      return {
        platform: pl,
        views,
        likes,
        comments,
        shares,
        avgEngRate: views > 0 ? (totalInter / views) * 100 : 0,
        postCount: pp.length,
        avgViews: pp.length > 0 ? Math.round(views / pp.length) : 0,
      };
    });
  }, [posts]);

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(key); setSortDir('desc'); }
  }

  const sorted = useMemo(() => {
    return [...platformStats].sort((a, b) => {
      const mult = sortDir === 'desc' ? -1 : 1;
      if (sortKey === 'platform') return mult * a.platform.localeCompare(b.platform);
      const av = a[sortKey as Exclude<SortKey, 'platform'>] as number;
      const bv = b[sortKey as Exclude<SortKey, 'platform'>] as number;
      return mult * (av - bv);
    });
  }, [platformStats, sortKey, sortDir]);

  const maxValues = useMemo(() => ({
    views:      Math.max(...platformStats.map((p) => p.views)),
    likes:      Math.max(...platformStats.map((p) => p.likes)),
    comments:   Math.max(...platformStats.map((p) => p.comments)),
    shares:     Math.max(...platformStats.map((p) => p.shares)),
    avgEngRate: Math.max(...platformStats.map((p) => p.avgEngRate)),
    postCount:  Math.max(...platformStats.map((p) => p.postCount)),
    avgViews:   Math.max(...platformStats.map((p) => p.avgViews)),
  }), [platformStats]);

  const radarMetrics: { key: keyof Omit<PlatformStats, 'platform'>; label: string }[] = [
    { key: 'views',      label: 'Views' },
    { key: 'likes',      label: 'Likes' },
    { key: 'comments',   label: 'Comments' },
    { key: 'shares',     label: 'Shares' },
    { key: 'avgEngRate', label: 'Eng. Rate' },
  ];

  const radarData = radarMetrics.map(({ key, label }) => {
    const max = Math.max(...platformStats.map((p) => p[key] as number), 0.001);
    const entry: Record<string, number | string> = { metric: label };
    for (const p of platformStats) {
      entry[p.platform] = Math.round(((p[key] as number) / max) * 100);
    }
    return entry;
  });

  const activePlatforms = ALL_PLATFORMS.filter((pl) => platformStats.find((p) => p.platform === pl)?.postCount ?? 0 > 0);

  function isTop(key: keyof typeof maxValues, val: number): boolean {
    return val > 0 && val === maxValues[key];
  }

  return (
    <div className="p-5 space-y-5">
      <div>
        <h2 className="text-base font-bold text-[var(--text-1)] mb-1 tracking-tight">Platform Comparison</h2>
        <p className="text-sm text-[var(--text-2)]">Side-by-side performance across all platforms.</p>
      </div>

      {/* Radar chart */}
      <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl p-5">
        <h3 className="text-[15px] font-semibold text-[var(--text-1)] mb-1">Performance Radar</h3>
        <p className="text-[11px] text-[var(--text-3)] mb-5">Normalized 0–100. Each axis shows relative strength across platforms.</p>
        <ResponsiveContainer width="100%" height={300}>
          <RadarChart data={radarData} margin={{ top: 10, right: 40, bottom: 10, left: 40 }}>
            <PolarGrid stroke="rgba(255,255,255,0.06)" />
            <PolarAngleAxis
              dataKey="metric"
              tick={{ fill: '#7a7068', fontSize: 11, fontFamily: 'DM Sans, sans-serif' }}
            />
            <Tooltip content={<RadarTooltip />} />
            {activePlatforms.map((pl) => (
              <Radar
                key={pl}
                dataKey={pl}
                name={pl}
                stroke={PLATFORM_COLORS[pl]}
                fill={PLATFORM_COLORS[pl]}
                fillOpacity={0.07}
                strokeWidth={1.5}
              />
            ))}
            <Legend
              formatter={(value) => (
                <span style={{ color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
                  {PLATFORM_LABELS[value as Platform] ?? value}
                </span>
              )}
              iconType="circle"
              iconSize={6}
              wrapperStyle={{ paddingTop: 12 }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Sortable table */}
      <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.04]">
                {COLUMNS.map(({ key, label }) => (
                  <th
                    key={key}
                    onClick={() => handleSort(key)}
                    className="px-5 py-3 text-left cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-[0.16em] hover:text-[var(--text-2)] transition-colors">
                        {label}
                      </span>
                      {sortKey === key && (
                        <span className="text-[var(--gold)] text-[10px]">{sortDir === 'desc' ? '↓' : '↑'}</span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {sorted.map((row) => {
                const color = PLATFORM_COLORS[row.platform];
                return (
                  <tr key={row.platform} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3.5">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                        <span className="text-[var(--text-1)] font-medium text-[13px]">
                          {PLATFORM_LABELS[row.platform]}
                        </span>
                      </span>
                    </td>
                    {(['views', 'likes', 'comments', 'shares'] as const).map((k) => (
                      <td key={k} className="px-5 py-3.5">
                        <span
                          className="tabular-nums text-[13px]"
                          style={{
                            fontFamily: 'var(--font-mono)',
                            color: isTop(k, row[k]) ? '#10b981' : 'var(--text-2)',
                            fontWeight: isTop(k, row[k]) ? 700 : 400,
                          }}
                        >
                          {formatNum(row[k])}
                        </span>
                      </td>
                    ))}
                    <td className="px-5 py-3.5">
                      <span
                        className="tabular-nums text-[13px]"
                        style={{
                          fontFamily: 'var(--font-mono)',
                          color: isTop('avgEngRate', row.avgEngRate) ? '#10b981' : 'var(--text-2)',
                          fontWeight: isTop('avgEngRate', row.avgEngRate) ? 700 : 400,
                        }}
                      >
                        {row.avgEngRate.toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className="tabular-nums text-[13px]"
                        style={{
                          fontFamily: 'var(--font-mono)',
                          color: isTop('postCount', row.postCount) ? '#10b981' : 'var(--text-2)',
                          fontWeight: isTop('postCount', row.postCount) ? 700 : 400,
                        }}
                      >
                        {row.postCount}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className="tabular-nums text-[13px]"
                        style={{
                          fontFamily: 'var(--font-mono)',
                          color: isTop('avgViews', row.avgViews) ? '#10b981' : 'var(--text-2)',
                          fontWeight: isTop('avgViews', row.avgViews) ? 700 : 400,
                        }}
                      >
                        {formatNum(row.avgViews)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
