'use client';

import { useMemo } from 'react';
import { Platform, PLATFORM_COLORS, PLATFORM_LABELS, UnifiedPost } from '@/types';
import ViewsLineChart from '@/components/ViewsLineChart';
import PlatformBarChart from '@/components/PlatformBarChart';
import BestTimeCard from '@/components/BestTimeCard';
import { formatNum } from '@/lib/utils';
import { useFilter } from '@/context/FilterContext';

const ALL_PLATFORMS: Platform[] = ['tiktok', 'instagram', 'linkedin', 'twitter', 'youtube'];

function filterByDateRange(posts: UnifiedPost[], range: string): UnifiedPost[] {
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

function exportToCSV(posts: UnifiedPost[]): void {
  const headers = ['date', 'platform', 'title', 'views', 'likes', 'comments', 'shares', 'saves', 'content_type'];
  const rows = posts.map((p) => [
    p.date,
    p.platform,
    `"${p.title.replace(/"/g, '""')}"`,
    p.views,
    p.likes,
    p.comments,
    p.shares,
    p.saves,
    p.content_type ?? '',
  ]);
  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `clip-studio-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

interface Props { posts: UnifiedPost[] }

export default function AnalyticsView({ posts }: Props) {
  const { dateRange, platform } = useFilter();

  const byDate = useMemo(() => filterByDateRange(posts, dateRange), [posts, dateRange]);
  const filtered = useMemo(() =>
    platform === 'all' ? byDate : byDate.filter((p) => p.platform === platform),
    [byDate, platform]
  );
  const chartPlatforms = useMemo<Platform[]>(() =>
    platform === 'all'
      ? ALL_PLATFORMS.filter((pl) => byDate.some((p) => p.platform === pl))
      : [platform],
    [byDate, platform]
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
          <ViewsLineChart posts={byDate} activePlatforms={chartPlatforms} />
        </div>
        <PlatformBarChart posts={byDate} activePlatforms={chartPlatforms} />
      </div>

      {/* Best time to post */}
      <BestTimeCard posts={filtered} />

      {/* Engagement breakdown table */}
      <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.04] flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-[var(--text-1)]">Engagement by Platform</h3>
          <button
            data-testid="csv-export-btn"
            onClick={() => exportToCSV(filtered)}
            disabled={filtered.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-white/[0.08] text-[var(--text-2)] hover:text-[var(--text-1)] hover:border-white/[0.15] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>
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
