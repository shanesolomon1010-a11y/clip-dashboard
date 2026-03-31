'use client';

import { useMemo } from 'react';
import { Platform, PLATFORM_COLORS, PLATFORM_LABELS, UnifiedPost } from '@/types';
import MetricCard from '@/components/MetricCard';
import ViewsLineChart from '@/components/ViewsLineChart';
import { IconEye, IconTrendUp, IconStar } from '@/components/Icons';
import { formatNum } from '@/lib/utils';
import { useVideoModal } from '@/context/VideoModalContext';
import { useFilter } from '@/context/FilterContext';

const ALL_PLATFORMS: Platform[] = ['youtube', 'instagram'];

const RANGES: { key: string; label: string; days: number | null }[] = [
  { key: '1d',  label: 'Last 24 hours', days: 1   },
  { key: '7d',  label: 'Last 7 days',   days: 7   },
  { key: '30d', label: 'Last 30 days',  days: 30  },
  { key: '90d', label: 'Last 90 days',  days: 90  },
  { key: 'all', label: 'All time',      days: null },
];

function filterByDays(posts: UnifiedPost[], days: number | null): UnifiedPost[] {
  if (days === null) return posts;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return posts.filter((p) => p.date >= cutoffStr);
}

function postInteractions(p: UnifiedPost): number {
  return p.likes + p.comments + p.shares + p.saves;
}

interface Props {
  posts: UnifiedPost[];
}

export default function DashboardView({ posts }: Props) {
  const { open: openVideoModal } = useVideoModal();
  const { dateRange, platform } = useFilter();

  const selectedRange = RANGES.find((r) => r.key === dateRange) ?? RANGES[2];

  const filteredPosts = useMemo(() => {
    const byDate = filterByDays(posts, selectedRange.days);
    return platform === 'all' ? byDate : byDate.filter((p) => p.platform === platform);
  }, [posts, selectedRange.days, platform]);

  const topPosts = useMemo(
    () => [...filteredPosts].sort((a, b) => b.views - a.views).slice(0, 6),
    [filteredPosts]
  );

  const activePlatforms = useMemo<Platform[]>(
    () => ALL_PLATFORMS.filter((pl) => filteredPosts.some((p) => p.platform === pl)),
    [filteredPosts]
  );

  const totalViews = useMemo(() => filteredPosts.reduce((s, p) => s + p.views, 0), [filteredPosts]);
  const totalInteractions = useMemo(() => filteredPosts.reduce((s, p) => s + postInteractions(p), 0), [filteredPosts]);

  const platformTotals = useMemo(() =>
    ALL_PLATFORMS.map((pl) => ({
      platform: pl,
      views: filteredPosts.filter((p) => p.platform === pl).reduce((s, p) => s + p.views, 0),
      count: filteredPosts.filter((p) => p.platform === pl).length,
    })).sort((a, b) => b.views - a.views),
    [filteredPosts]
  );

  const topPlatform = platformTotals[0];

  return (
    <div className="flex gap-5 p-5 min-h-full">
      {/* ── Left column ─────────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-6">

        {/* Metric cards strip */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <MetricCard
            label="Total Views"
            value={formatNum(totalViews)}
            sub={selectedRange.label.toLowerCase()}
            icon={<IconEye className="w-4 h-4" />}
            accent="#d4922a"
          />
          <MetricCard
            label="Posts"
            value={String(filteredPosts.length)}
            sub={selectedRange.label.toLowerCase()}
            icon={<IconStar className="w-4 h-4" />}
            accent="#d4922a"
          />
          <MetricCard
            label="Total Interactions"
            value={formatNum(totalInteractions)}
            sub="likes, comments, shares & saves"
            icon={<IconTrendUp className="w-4 h-4" />}
            accent="#F7E7CE"
          />
          <MetricCard
            label="Top Platform"
            value={topPlatform?.count ? PLATFORM_LABELS[topPlatform.platform] : '—'}
            sub={topPlatform?.count ? `${formatNum(topPlatform.views)} views` : 'No data yet'}
            icon={
              <span className="w-3 h-3 rounded-full" style={{ background: topPlatform ? PLATFORM_COLORS[topPlatform.platform] : '#6b7280' }} />
            }
            accent={topPlatform ? PLATFORM_COLORS[topPlatform.platform] : '#6b7280'}
          />
        </div>

        {/* Views line chart */}
        <ViewsLineChart posts={filteredPosts} activePlatforms={activePlatforms} rangeLabel={selectedRange.label} />

        {/* Top content */}
        <div className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[rgba(247,231,206,0.05)] flex items-center justify-between">
            <h3 className="text-[15px] font-semibold text-[var(--text-1)]">Top Content</h3>
            <span className="text-[11px] text-[var(--text-2)]">{selectedRange.label}</span>
          </div>
          <div className="divide-y divide-[rgba(247,231,206,0.03)]">
            {topPosts.map((post, i) => (
              <div key={post.id} data-testid="post-row" onClick={() => post.clip_code && openVideoModal(post, post.clip_code)} className="flex items-center gap-4 px-5 py-3.5 hover:bg-[rgba(247,231,206,0.02)] transition-colors group cursor-pointer">
                <span className="text-[var(--text-3)] w-4 shrink-0 tabular-nums text-xs font-bold" style={{ fontFamily: 'var(--font-mono)' }}>{i + 1}</span>
                <span
                  className="text-[10px] font-semibold px-2 py-1 rounded-lg shrink-0"
                  style={{
                    background: `${PLATFORM_COLORS[post.platform]}15`,
                    color: PLATFORM_COLORS[post.platform],
                  }}
                >
                  {PLATFORM_LABELS[post.platform]}
                </span>
                <span className="flex-1 text-[13px] text-[var(--text-2)] truncate min-w-0 group-hover:text-[var(--text-1)] transition-colors">{post.clip_code}</span>
                {post.url && (
                  <svg className="w-3 h-3 shrink-0 text-[var(--text-2)]" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M4 3l10 5-10 5V3z" />
                  </svg>
                )}
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-[var(--text-1)] tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>{formatNum(post.views)}</p>
                  <p className="text-[10px] text-[var(--text-3)] tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>{formatNum(postInteractions(post))} interactions</p>
                </div>
              </div>
            ))}
            {topPosts.length === 0 && (
              <div className="px-5 py-8 text-center text-[var(--text-2)] text-sm">No posts for {selectedRange.label.toLowerCase()}</div>
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
            <p className="text-[11px] text-[var(--text-2)] mt-1">{selectedRange.label.toLowerCase()}</p>

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
