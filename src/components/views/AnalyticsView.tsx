'use client';

import { useMemo, useState } from 'react';
import { DateRange, Platform, PLATFORM_COLORS, PLATFORM_LABELS, UnifiedPost } from '@/types';
import ViewsLineChart from '@/components/ViewsLineChart';
import PlatformBarChart from '@/components/PlatformBarChart';
import BestTimeCard from '@/components/BestTimeCard';

const ALL_PLATFORMS: Platform[] = ['tiktok', 'instagram', 'linkedin', 'twitter', 'youtube'];

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function filterByDateRange(posts: UnifiedPost[], range: DateRange): UnifiedPost[] {
  if (range === 'all') return posts;
  const cutoff = new Date();
  if (range === '1d') {
    cutoff.setHours(cutoff.getHours() - 24);
  } else {
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
    cutoff.setDate(cutoff.getDate() - days);
  }
  return posts.filter((p) => p.date >= cutoff.toISOString().slice(0, 10));
}

interface Props { posts: UnifiedPost[] }

export default function AnalyticsView({ posts }: Props) {
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [activePlatform, setActivePlatform] = useState<Platform | 'all'>('all');

  const byDate = useMemo(() => filterByDateRange(posts, dateRange), [posts, dateRange]);
  const filtered = useMemo(() =>
    activePlatform === 'all' ? byDate : byDate.filter((p) => p.platform === activePlatform),
    [byDate, activePlatform]
  );
  const activePlatforms = useMemo<Platform[]>(() =>
    activePlatform === 'all'
      ? ALL_PLATFORMS.filter((pl) => byDate.some((p) => p.platform === pl))
      : [activePlatform],
    [byDate, activePlatform]
  );

  const totalViews         = filtered.reduce((s, p) => s + p.views, 0);
  const totalLikes         = filtered.reduce((s, p) => s + p.likes, 0);
  const totalComments      = filtered.reduce((s, p) => s + p.comments, 0);
  const totalShares        = filtered.reduce((s, p) => s + p.shares, 0);
  const totalInteractions  = filtered.reduce((s, p) => s + p.likes + p.comments + p.shares + p.saves, 0);

  const stats = [
    { label: 'Views',        value: formatNum(totalViews),         accent: '#d4922a' },
    { label: 'Likes',        value: formatNum(totalLikes),         accent: '#e1306c' },
    { label: 'Comments',     value: formatNum(totalComments),      accent: '#f59e0b' },
    { label: 'Shares',       value: formatNum(totalShares),        accent: '#10b981' },
    { label: 'Interactions', value: formatNum(totalInteractions),  accent: '#d4922a' },
  ];

  return (
    <div className="p-5 space-y-5">
      {/* Controls bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Date range pills */}
        <div className="flex items-center gap-1 bg-white/[0.03] border border-white/[0.06] rounded-xl p-1">
          {(['1d', '7d', '30d', '90d', 'all'] as DateRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setDateRange(r)}
              className={`px-3 py-1.5 text-xs transition-all ${
                dateRange === r
                  ? 'bg-[var(--gold)] text-[var(--bg-base)] font-semibold shadow-sm rounded-lg'
                  : 'text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-white/[0.04] rounded-lg'
              }`}
            >
              {r === 'all' ? 'All time' : r.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Platform filter */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setActivePlatform('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              activePlatform === 'all'
                ? 'bg-[var(--text-1)] text-[var(--bg-base)] border-[var(--text-1)]'
                : 'text-[var(--text-2)] border-white/[0.08] hover:text-[var(--text-1)] hover:border-white/[0.15]'
            }`}
          >
            All
          </button>
          {ALL_PLATFORMS.map((pl) => {
            const isActive = activePlatform === pl;
            return (
              <button
                key={pl}
                onClick={() => setActivePlatform(isActive ? 'all' : pl)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all"
                style={
                  isActive
                    ? {
                        background: `${PLATFORM_COLORS[pl]}20`,
                        borderColor: `${PLATFORM_COLORS[pl]}50`,
                        color: PLATFORM_COLORS[pl],
                      }
                    : { color: 'var(--text-2)', borderColor: 'rgba(255,255,255,0.08)' }
                }
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: PLATFORM_COLORS[pl] }} />
                {PLATFORM_LABELS[pl]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {stats.map(({ label, value, accent }) => (
          <div key={label} className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl px-4 py-4 hover:border-white/[0.09] transition-colors">
            <p className="text-[10px] tracking-[0.16em] uppercase text-[var(--text-3)] mb-2 font-semibold">{label}</p>
            <p className="text-2xl font-bold leading-none tabular-nums" style={{ color: accent, fontFamily: 'var(--font-mono)' }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <ViewsLineChart posts={byDate} activePlatforms={activePlatforms} />
        </div>
        <PlatformBarChart posts={byDate} activePlatforms={activePlatforms} />
      </div>

      {/* Best time to post */}
      <BestTimeCard posts={filtered} />

      {/* Engagement breakdown table */}
      <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.04] flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-[var(--text-1)]">Engagement by Platform</h3>
          <span className="text-[11px] text-[var(--text-2)]">{dateRange === 'all' ? 'All time' : dateRange.toUpperCase()} window</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-white/[0.04]">
              {['Platform', 'Posts', 'Total Views', 'Total Likes', 'Comments', 'Shares', 'Interactions / Views'].map((h) => (
                <th key={h} className="px-5 py-3 text-[10px] font-medium text-[var(--text-3)] uppercase tracking-[0.12em]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {ALL_PLATFORMS.map((pl) => {
              const pp = byDate.filter((p) => p.platform === pl);
              if (!pp.length) return null;
              const plViews = pp.reduce((s, p) => s + p.views, 0);
              const plInteractions = pp.reduce((s, p) => s + p.likes + p.comments + p.shares + p.saves, 0);
              return (
                <tr key={pl} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3.5">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PLATFORM_COLORS[pl] }} />
                      <span className="text-[var(--text-1)] font-medium text-[13px]">{PLATFORM_LABELS[pl]}</span>
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-[var(--text-2)] tabular-nums text-[13px]" style={{ fontFamily: 'var(--font-mono)' }}>{pp.length}</td>
                  <td className="px-5 py-3.5 text-[var(--text-1)] font-semibold tabular-nums text-[13px]" style={{ fontFamily: 'var(--font-mono)' }}>{formatNum(plViews)}</td>
                  <td className="px-5 py-3.5 text-[var(--text-2)] tabular-nums text-[13px]" style={{ fontFamily: 'var(--font-mono)' }}>{formatNum(pp.reduce((s, p) => s + p.likes, 0))}</td>
                  <td className="px-5 py-3.5 text-[var(--text-2)] tabular-nums text-[13px]" style={{ fontFamily: 'var(--font-mono)' }}>{formatNum(pp.reduce((s, p) => s + p.comments, 0))}</td>
                  <td className="px-5 py-3.5 text-[var(--text-2)] tabular-nums text-[13px]" style={{ fontFamily: 'var(--font-mono)' }}>{formatNum(pp.reduce((s, p) => s + p.shares, 0))}</td>
                  <td className="px-5 py-3.5">
                    <span className="text-[var(--text-2)] text-[11px] tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>
                      {formatNum(plInteractions)} / {formatNum(plViews)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
