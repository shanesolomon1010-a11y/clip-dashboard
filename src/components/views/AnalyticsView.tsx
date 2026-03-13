'use client';

import { useMemo, useState } from 'react';
import { DateRange, Platform, PLATFORM_COLORS, PLATFORM_LABELS, UnifiedPost } from '@/types';
import ViewsLineChart from '@/components/ViewsLineChart';
import PlatformBarChart from '@/components/PlatformBarChart';

const ALL_PLATFORMS: Platform[] = ['tiktok', 'instagram', 'linkedin', 'twitter', 'youtube'];

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function filterByDateRange(posts: UnifiedPost[], range: DateRange): UnifiedPost[] {
  if (range === 'all') return posts;
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
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

  const totalViews    = filtered.reduce((s, p) => s + p.views, 0);
  const totalLikes    = filtered.reduce((s, p) => s + p.likes, 0);
  const totalComments = filtered.reduce((s, p) => s + p.comments, 0);
  const totalShares   = filtered.reduce((s, p) => s + p.shares, 0);
  const avgEng        = filtered.length ? filtered.reduce((s, p) => s + p.engagementRate, 0) / filtered.length : 0;

  return (
    <div className="p-6 space-y-5">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Date range */}
        <div className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
          {(['7d', '30d', '90d', 'all'] as DateRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setDateRange(r)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                dateRange === r
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
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
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              activePlatform === 'all'
                ? 'bg-white text-gray-950 border-white'
                : 'text-gray-400 border-gray-700 hover:text-white hover:border-gray-500'
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
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all`}
                style={
                  isActive
                    ? { background: `${PLATFORM_COLORS[pl]}33`, borderColor: `${PLATFORM_COLORS[pl]}66`, color: PLATFORM_COLORS[pl] }
                    : { color: '#9ca3af', borderColor: '#374151' }
                }
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: PLATFORM_COLORS[pl] }} />
                {PLATFORM_LABELS[pl]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Views',      value: formatNum(totalViews),    accent: '#6366f1' },
          { label: 'Likes',      value: formatNum(totalLikes),    accent: '#e1306c' },
          { label: 'Comments',   value: formatNum(totalComments), accent: '#f59e0b' },
          { label: 'Shares',     value: formatNum(totalShares),   accent: '#10b981' },
          { label: 'Avg Eng.',   value: `${avgEng.toFixed(2)}%`,  accent: '#8b5cf6' },
        ].map(({ label, value, accent }) => (
          <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-4">
            <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-2">{label}</p>
            <p className="text-2xl font-bold" style={{ color: accent }}>{value}</p>
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

      {/* Engagement breakdown table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-white">Engagement Breakdown by Platform</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
              {['Platform', 'Posts', 'Total Views', 'Total Likes', 'Comments', 'Shares', 'Avg Engagement'].map((h) => (
                <th key={h} className="px-5 py-3 font-semibold uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {ALL_PLATFORMS.map((pl) => {
              const pp = byDate.filter((p) => p.platform === pl);
              if (!pp.length) return null;
              const pEng = pp.reduce((s, p) => s + p.engagementRate, 0) / pp.length;
              return (
                <tr key={pl} className="hover:bg-gray-800/40 transition-colors">
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: PLATFORM_COLORS[pl] }} />
                      <span className="text-gray-200 font-medium">{PLATFORM_LABELS[pl]}</span>
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-400">{pp.length}</td>
                  <td className="px-5 py-3 text-white font-semibold">{formatNum(pp.reduce((s, p) => s + p.views, 0))}</td>
                  <td className="px-5 py-3 text-gray-400">{formatNum(pp.reduce((s, p) => s + p.likes, 0))}</td>
                  <td className="px-5 py-3 text-gray-400">{formatNum(pp.reduce((s, p) => s + p.comments, 0))}</td>
                  <td className="px-5 py-3 text-gray-400">{formatNum(pp.reduce((s, p) => s + p.shares, 0))}</td>
                  <td className="px-5 py-3">
                    <span className={`font-semibold ${pEng > 10 ? 'text-emerald-400' : pEng > 5 ? 'text-yellow-400' : 'text-gray-400'}`}>
                      {pEng.toFixed(2)}%
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
