'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Platform, PLATFORM_COLORS, PLATFORM_LABELS, UnifiedPost } from '@/types';
import { IconEye } from '@/components/Icons';
import { formatNum } from '@/lib/utils';
import { useVideoModal } from '@/context/VideoModalContext';
import { useFilter } from '@/context/FilterContext';
import { getAllPostsByDate, getLatestPostsPerClip } from '@/lib/db';
import { DateFilterBar, useDateFilter } from '@/components/DateFilterBar';

const ALL_PLATFORMS: Platform[] = ['youtube', 'instagram'];

const CLIP_COLORS = [
  '#FF4444', '#FF8C42', '#FFD166', '#06D6A0',
  '#118AB2', '#7B2FBE', '#F72585', '#4CC9F0',
];


function postInteractions(p: UnifiedPost): number {
  return p.likes + p.comments + p.shares + p.saves;
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}


interface ClipTotal {
  clip_code: string;
  clip_details_code: string | undefined;
  platform: string;
  total_views: number;
}

interface Props {
  posts: UnifiedPost[];
}

export default function DashboardView({ posts }: Props) {
  const { open: openVideoModal } = useVideoModal();
  const { platform } = useFilter();

  const [allDailyPosts, setAllDailyPosts] = useState<UnifiedPost[]>([]);
  const [latestClipPosts, setLatestClipPosts] = useState<UnifiedPost[]>([]);

  const { filterPreset, setFilterPreset, customRange, setCustomRange, filterStart, filterEnd, filterLabel } = useDateFilter('30d');

  useEffect(() => {
    getAllPostsByDate('youtube').then(setAllDailyPosts).catch(() => setAllDailyPosts([]));
    getLatestPostsPerClip('youtube').then(setLatestClipPosts).catch(() => setLatestClipPosts([]));
  }, []);

  const filteredPosts = useMemo(() => {
    let result = platform === 'all' ? posts : posts.filter((p) => p.platform === platform);
    if (filterStart) {
      result = result.filter((p) => {
        const d = p.stat_date ?? p.date ?? '';
        return d >= filterStart && (!filterEnd || d <= filterEnd);
      });
    }
    return result;
  }, [posts, platform, filterStart, filterEnd]);

  const dateFilteredDailyPosts = useMemo(() => {
    if (!filterStart) return allDailyPosts;
    return allDailyPosts.filter((p) => {
      const d = p.stat_date ?? p.date ?? '';
      return d >= filterStart && (!filterEnd || d <= filterEnd);
    });
  }, [allDailyPosts, filterStart, filterEnd]);

  const dateFilteredClipTotals = useMemo(() => {
    const map = new Map<string, ClipTotal>();
    for (const p of dateFilteredDailyPosts) {
      if (!p.clip_code) continue;
      const ex = map.get(p.clip_code);
      if (!ex) {
        map.set(p.clip_code, { clip_code: p.clip_code, clip_details_code: p.clip_details_code, platform: p.platform, total_views: p.views });
      } else {
        ex.total_views += p.views;
      }
    }
    return Array.from(map.values()).sort((a, b) => b.total_views - a.total_views);
  }, [dateFilteredDailyPosts]);

  // Top content ranked by total views within the date filter
  const topPosts = useMemo(() => {
    if (dateFilteredClipTotals.length > 0) return dateFilteredClipTotals.slice(0, 6);
    return [...filteredPosts].sort((a, b) => b.views - a.views).slice(0, 6);
  }, [dateFilteredClipTotals, filteredPosts]);

  const totalViews = useMemo(() => dateFilteredClipTotals.reduce((s, c) => s + c.total_views, 0), [dateFilteredClipTotals]);
  const totalInteractions = useMemo(() => dateFilteredDailyPosts.reduce((s, p) => s + postInteractions(p), 0), [dateFilteredDailyPosts]);

  const platformTotals = useMemo(() =>
    ALL_PLATFORMS.map((pl) => ({
      platform: pl,
      views: filteredPosts.filter((p) => p.platform === pl).reduce((s, p) => s + p.views, 0),
      count: filteredPosts.filter((p) => p.platform === pl).length,
    })).sort((a, b) => b.views - a.views),
    [filteredPosts]
  );

  // Chart data: group dateFilteredDailyPosts by stat_date, one value per clip_code
  const { chartData, chartClips } = useMemo(() => {
    const clipSet: Record<string, true> = {};
    for (const p of dateFilteredDailyPosts) {
      if (p.clip_code && p.stat_date) clipSet[p.clip_code] = true;
    }
    const clips = Object.keys(clipSet);

    const byDate = new Map<string, Record<string, number>>();
    for (const p of dateFilteredDailyPosts) {
      if (!p.clip_code || !p.stat_date) continue;
      if (!byDate.has(p.stat_date)) byDate.set(p.stat_date, {});
      const entry = byDate.get(p.stat_date)!;
      entry[p.clip_code] = (entry[p.clip_code] ?? 0) + p.views;
    }

    const data = Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date: fmtDate(date), ...vals }));

    return { chartData: data, chartClips: clips };
  }, [dateFilteredDailyPosts]);

  // Peak day per clip_code from allDailyPosts
  const peakByClip = useMemo(() => {
    const map = new Map<string, { date: string; views: number }>();
    for (const p of allDailyPosts) {
      if (!p.clip_code || !p.stat_date) continue;
      const existing = map.get(p.clip_code);
      if (!existing || p.views > existing.views) {
        map.set(p.clip_code, { date: p.stat_date, views: p.views });
      }
    }
    return map;
  }, [allDailyPosts]);


  const statsGrid = useMemo(() => {
    let sumViews = 0, sumImpressions = 0;
    let sumLikes = 0, sumComments = 0, sumShares = 0;
    let sumDuration = 0, countDuration = 0;
    for (const p of dateFilteredDailyPosts) {
      sumViews += p.views;
      sumImpressions += p.impressions ?? 0;
      sumLikes += p.likes;
      sumComments += p.comments;
      sumShares += p.shares;
      if (p.avg_view_duration_seconds != null) { sumDuration += p.avg_view_duration_seconds; countDuration++; }
    }
    return {
      totalViews: sumViews,
      totalImpressions: sumImpressions,
      totalLikes: sumLikes,
      totalComments: sumComments,
      totalShares: sumShares,
      avgDuration: countDuration > 0 ? sumDuration / countDuration : 0,
    };
  }, [dateFilteredDailyPosts]);

  const impressionCtrDisplay = useMemo(() => {
    let sumImpressions = 0, sumWeightedCtr = 0;
    for (const p of latestClipPosts) {
      if (p.impressions) {
        sumImpressions += p.impressions;
        if (p.impression_ctr != null) sumWeightedCtr += p.impressions * p.impression_ctr;
      }
    }
    return sumImpressions > 0 ? `${(sumWeightedCtr / sumImpressions).toFixed(1)}%` : 'N/A';
  }, [latestClipPosts]);

  const uniqueViewersDisplay = useMemo(() => {
    const withData = latestClipPosts.filter((p) => p.unique_viewers != null);
    if (withData.length === 0) return 'N/A';
    return formatNum(withData.reduce((s, p) => s + (p.unique_viewers ?? 0), 0));
  }, [latestClipPosts]);

  const isClipTotal = (item: ClipTotal | UnifiedPost): item is ClipTotal =>
    'total_views' in item;

  return (
    <div className="flex gap-5 p-5 min-h-full">
      {/* ── Left column ─────────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-6">

        {/* Date filter bar */}
        <DateFilterBar
          preset={filterPreset}
          customRange={customRange}
          onPresetChange={setFilterPreset}
          onCustomRange={(start, end) => setCustomRange({ start, end })}
        />

        {/* Stat grid — 8 cards, 4 columns */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {([
            { label: 'Total Views',       value: formatNum(statsGrid.totalViews) },
            { label: 'Total Impressions', value: formatNum(statsGrid.totalImpressions) },
            { label: 'Impression CTR',    value: impressionCtrDisplay },
            { label: 'Unique Viewers',    value: uniqueViewersDisplay },
            { label: 'Total Likes',       value: formatNum(statsGrid.totalLikes) },
            { label: 'Total Comments',    value: formatNum(statsGrid.totalComments) },
            { label: 'Total Shares',      value: formatNum(statsGrid.totalShares) },
            { label: 'Avg View Duration', value: fmtDuration(statsGrid.avgDuration) },
          ] as { label: string; value: string }[]).map(({ label, value }) => (
            <div key={label} className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl px-4 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-3)] mb-2">{label}</p>
              <p className="text-2xl font-bold tabular-nums leading-none" style={{ color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Views Over Time chart */}
        {chartData.length > 0 && (
          <div className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl p-5">
            <h3 className="text-[15px] font-semibold text-[var(--text-1)] mb-4">Views Over Time</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#6b7280', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                  axisLine={{ stroke: 'transparent' }}
                  tickLine={false}
                />
                <YAxis
                  width={40}
                  tickFormatter={formatNum}
                  tick={{ fill: '#6b7280', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                  axisLine={{ stroke: 'transparent' }}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: '#1d1d1d',
                    border: '1px solid rgba(247,231,206,0.09)',
                    borderRadius: 10,
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                  }}
                  labelStyle={{ color: '#9ca3af', marginBottom: 6 }}
                  itemStyle={{ color: '#e5e7eb' }}
                  formatter={(value) => formatNum(Number(value))}
                />
                <Legend
                  wrapperStyle={{ fontSize: 10, fontFamily: 'var(--font-mono)', paddingTop: 12 }}
                  formatter={(value) => <span style={{ color: '#9ca3af' }}>{value}</span>}
                />
                {chartClips.map((clip, i) => (
                  <Line
                    key={clip}
                    type="monotone"
                    dataKey={clip}
                    stroke={CLIP_COLORS[i % CLIP_COLORS.length]}
                    strokeWidth={1.5}
                    dot={{ r: 2.5, strokeWidth: 0 }}
                    activeDot={{ r: 4 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Top content */}
        <div className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[rgba(247,231,206,0.05)] flex items-center justify-between">
            <h3 className="text-[15px] font-semibold text-[var(--text-1)]">Top Content</h3>
            <span className="text-[11px] text-[var(--text-2)]">{filterLabel}</span>
          </div>
          <div className="divide-y divide-[rgba(247,231,206,0.03)]">
            {topPosts.map((item, i) => {
              const clipCode = isClipTotal(item) ? item.clip_code : item.clip_code;
              const plt = isClipTotal(item) ? (item.platform as Platform) : item.platform;
              const views = isClipTotal(item) ? item.total_views : item.views;
              const peak = clipCode ? peakByClip.get(clipCode) : undefined;

              const handleClick = () => {
                if (!isClipTotal(item) && item.clip_details_code) {
                  openVideoModal(item, item.clip_details_code);
                } else if (isClipTotal(item) && item.clip_details_code) {
                  // Find a matching post from `posts` to open modal
                  const match = posts.find((p) => p.clip_code === item.clip_code);
                  if (match) openVideoModal(match, item.clip_details_code);
                }
              };

              return (
                <div
                  key={isClipTotal(item) ? `${item.clip_code}::${item.platform}` : item.id}
                  data-testid="post-row"
                  onClick={handleClick}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-[rgba(247,231,206,0.02)] transition-colors group cursor-pointer relative"
                >
                  <span className="text-[var(--text-3)] w-4 shrink-0 tabular-nums text-xs font-bold" style={{ fontFamily: 'var(--font-mono)' }}>{i + 1}</span>
                  <span
                    className="text-[10px] font-semibold px-2 py-1 rounded-lg shrink-0"
                    style={{
                      background: `${PLATFORM_COLORS[plt]}15`,
                      color: PLATFORM_COLORS[plt],
                    }}
                  >
                    {PLATFORM_LABELS[plt]}
                  </span>
                  <span className="flex-1 text-[13px] text-[var(--text-2)] truncate min-w-0 group-hover:text-[var(--text-1)] transition-colors">{clipCode}</span>
                  {!isClipTotal(item) && item.url && (
                    <svg className="w-3 h-3 shrink-0 text-[var(--text-2)]" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M4 3l10 5-10 5V3z" />
                    </svg>
                  )}
                  <div className="text-right shrink-0 mr-20">
                    <p className="text-sm font-bold text-[var(--text-1)] tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>{formatNum(views)}</p>
                    {peak && (
                      <p className="text-[10px] text-[var(--text-3)]">
                        Peak: {fmtDate(peak.date)} · {formatNum(peak.views)} views
                      </p>
                    )}
                  </div>

                </div>
              );
            })}
            {topPosts.length === 0 && (
              <div className="px-5 py-8 text-center text-[var(--text-2)] text-sm">No posts for {filterLabel.toLowerCase()}</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Right rail ──────────────────────────────────────── */}
      <div className="w-[260px] shrink-0 space-y-4">

        {/* Channel summary */}
        <div className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl overflow-hidden">
          <div className="px-4 py-3.5 border-b border-[rgba(247,231,206,0.05)]">
            <h3 className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-[0.16em]">Channel Summary</h3>
          </div>
          <div className="p-5">
            <p className="text-[11px] text-[var(--text-2)] mb-1 flex items-center gap-1.5">
              <IconEye className="w-3 h-3" /> Total Views
            </p>
            <p className="text-4xl font-bold leading-none tracking-tight text-[var(--text-1)]">{formatNum(totalViews)}</p>
            <p className="text-[11px] text-[var(--text-2)] mt-1">{filterLabel.toLowerCase()}</p>

            <div className="h-px bg-[rgba(247,231,206,0.05)] my-4" />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-3)] mb-1">Total Posts</p>
                <p className="text-xl font-bold text-[var(--text-1)] tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>{filteredPosts.length}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-3)] mb-1">Interactions</p>
                <p className="text-xl font-bold text-[var(--text-1)] tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>{formatNum(totalInteractions)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Platform breakdown */}
        <div className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl overflow-hidden">
          <div className="px-4 py-3.5 border-b border-[rgba(247,231,206,0.05)]">
            <h3 className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-[0.16em]">Platforms</h3>
          </div>
          <div className="p-3 space-y-1">
            {platformTotals.map(({ platform: pl, views, count }) => {
              const pct = totalViews > 0 ? (views / totalViews) * 100 : 0;
              const color = PLATFORM_COLORS[pl];
              return (
                <div key={pl} className="rounded-xl px-3 py-2.5 hover:bg-[rgba(247,231,206,0.03)] transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                      <span className="text-xs text-[var(--text-2)] font-medium">{PLATFORM_LABELS[pl]}</span>
                    </div>
                    <span className="text-xs text-[var(--text-1)] font-semibold tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>{formatNum(views)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-[rgba(247,231,206,0.04)] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: color, opacity: 0.6 }}
                      />
                    </div>
                    <span className="text-[10px] text-[var(--text-3)] w-8 text-right tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>{count}p</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
