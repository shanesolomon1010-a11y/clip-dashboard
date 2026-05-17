'use client';

import { useEffect, useMemo, useState } from 'react';
import { Platform, PLATFORM_COLORS, PLATFORM_LABELS, UnifiedPost } from '@/types';
import { formatNum } from '@/lib/utils';
import { useVideoModal } from '@/context/VideoModalContext';
import { getTotalViewsPerClip, clipKey, displayClipCode, type ClipTotals } from '@/lib/db';

const ALL_PLATFORMS: Platform[] = ['youtube', 'instagram'];

const PLATFORM_META: Record<Platform, { description: string; exportNote: string }> = {
  youtube:   { description: 'Long-form and Shorts with watch-time signals', exportNote: 'YouTube Studio → Analytics → Export' },
  instagram: { description: 'Reels and feed posts with saves-driven reach', exportNote: 'Instagram Insights → Export data' },
};


interface Props { posts: UnifiedPost[] }

export default function PlatformsView({ posts }: Props) {
  const { open } = useVideoModal();
  const [totalsMap, setTotalsMap] = useState<Record<string, ClipTotals>>({});

  useEffect(() => {
    getTotalViewsPerClip().then((totals) => {
      const map: Record<string, ClipTotals> = {};
      for (const t of totals) map[clipKey(t)] = t;
      setTotalsMap(map);
    }).catch(() => setTotalsMap({}));
  }, []);

  const platformData = useMemo(() => {
    const totalsFor = (p: UnifiedPost) => totalsMap[clipKey(p)];
    const clipViews    = (p: UnifiedPost) => totalsFor(p)?.total_views    ?? p.views;
    const clipLikes    = (p: UnifiedPost) => totalsFor(p)?.total_likes    ?? p.likes;
    const clipComments = (p: UnifiedPost) => totalsFor(p)?.total_comments ?? p.comments;
    const clipShares   = (p: UnifiedPost) => totalsFor(p)?.total_shares   ?? p.shares;
    const clipSaves    = (p: UnifiedPost) => totalsFor(p)?.total_saves    ?? p.saves;
    return ALL_PLATFORMS.map((pl) => {
      const pp = posts.filter((p) => p.platform === pl);
      const views    = pp.reduce((s, p) => s + clipViews(p), 0);
      const likes    = pp.reduce((s, p) => s + clipLikes(p), 0);
      const comments = pp.reduce((s, p) => s + clipComments(p), 0);
      const shares   = pp.reduce((s, p) => s + clipShares(p), 0);
      const interactions = pp.reduce(
        (s, p) => s + clipLikes(p) + clipComments(p) + clipShares(p) + clipSaves(p),
        0,
      );
      const best = [...pp].sort((a, b) => clipViews(b) - clipViews(a))[0] ?? null;
      return { platform: pl, count: pp.length, views, likes, comments, shares, interactions, best };
    });
  }, [posts, totalsMap]);

  return (
    <div className="p-6 space-y-5">
      <div>
        <h2 className="text-base font-bold text-[var(--text-1)] mb-1 tracking-tight">Platform Overview</h2>
        <p className="text-sm text-[var(--text-2)]">All-time stats per platform based on imported CSV data.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {platformData.map(({ platform, count, views, likes, comments, shares, interactions, best }) => {
          const color = PLATFORM_COLORS[platform];
          const hasData = count > 0;
          return (
            <div
              key={platform}
              className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl overflow-hidden hover:border-[rgba(247,231,206,0.09)] transition-all"
            >
              {/* Header */}
              <div
                className="px-5 py-4 flex items-center justify-between"
                style={{
                  borderBottom: `1px solid ${color}20`,
                  background: `${color}08`,
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full shadow-md" style={{ background: color, boxShadow: `0 0 8px ${color}60` }} />
                  <span className="font-semibold text-[var(--text-1)] text-[13px]">{PLATFORM_LABELS[platform]}</span>
                  <span className="text-[11px] text-[var(--text-3)]">{PLATFORM_META[platform].description}</span>
                </div>
                <span
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-lg shrink-0"
                  style={{ background: `${color}18`, color }}
                >
                  {hasData ? `${count} posts` : 'No data'}
                </span>
              </div>

              <div className="p-5">
                {!hasData ? (
                  <div className="text-center py-5 space-y-2">
                    <div className="w-10 h-10 rounded-full bg-[rgba(247,231,206,0.03)] border border-[rgba(247,231,206,0.05)] flex items-center justify-center mx-auto mb-3">
                      <span className="w-3 h-3 rounded-full" style={{ background: `${color}50` }} />
                    </div>
                    <p className="text-[var(--text-2)] text-sm font-medium">No data imported yet</p>
                    <p className="text-[var(--text-3)] text-xs leading-relaxed">{PLATFORM_META[platform].exportNote}</p>
                  </div>
                ) : (
                  <>
                    {/* Stats grid */}
                    <div className="grid grid-cols-2 gap-2.5 mb-4">
                      {[
                        { label: 'Views',    value: formatNum(views) },
                        { label: 'Likes',    value: formatNum(likes) },
                        { label: 'Comments', value: formatNum(comments) },
                        { label: 'Shares',   value: formatNum(shares) },
                      ].map(({ label, value }) => (
                        <div key={label} className="bg-[rgba(247,231,206,0.02)] border border-[rgba(247,231,206,0.04)] rounded-xl px-3 py-2.5">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-3)] mb-1">{label}</p>
                          <p className="text-sm font-bold text-[var(--text-1)] font-['JetBrains_Mono'] tabular-nums">{value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Interactions bar */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-3)]">Interactions / Views</span>
                        <span className="text-xs font-bold font-['JetBrains_Mono'] tabular-nums text-[var(--text-1)]">
                          {formatNum(interactions)} / {formatNum(views)}
                        </span>
                      </div>
                      <div className="h-1.5 bg-[rgba(247,231,206,0.04)] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${views > 0 ? Math.min((interactions / views) * 100 * 10, 100) : 0}%`, background: color, opacity: 0.65 }}
                        />
                      </div>
                    </div>

                    {/* Best post */}
                    {best && (
                      <div onClick={() => (best.clip_details_code || best.clip_code) && open(best, displayClipCode(best))} className="bg-[rgba(247,231,206,0.03)] border border-[rgba(247,231,206,0.05)] rounded-xl p-3.5 cursor-pointer hover:bg-[rgba(247,231,206,0.05)] transition-colors">
                        <div className="flex items-center gap-1.5 mb-2">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-3)]">Best Post</p>
                          {best.url && (
                            <svg className="w-3 h-3 text-[var(--text-2)]" viewBox="0 0 16 16" fill="currentColor">
                              <path d="M4 3l10 5-10 5V3z" />
                            </svg>
                          )}
                        </div>
                        <p className="text-[12px] text-[var(--text-1)] font-medium leading-snug line-clamp-2 mb-2">{displayClipCode(best)}</p>
                        {(() => {
                          const bestTotals = totalsMap[clipKey(best)];
                          const bestViews = bestTotals?.total_views ?? best.views;
                          const bestInter = bestTotals
                            ? bestTotals.total_likes + bestTotals.total_comments + bestTotals.total_shares + bestTotals.total_saves
                            : best.likes + best.comments + best.shares + best.saves;
                          return (
                            <div className="flex gap-4 text-[11px]">
                              <span className="text-[var(--text-2)]">Views: <span className="text-[var(--text-1)] font-semibold font-['JetBrains_Mono'] tabular-nums">{formatNum(bestViews)}</span></span>
                              <span className="text-[var(--text-2)]">Interactions: <span className="text-[var(--text-1)] font-semibold font-['JetBrains_Mono'] tabular-nums">{formatNum(bestInter)}</span></span>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </>
                )}

                {/* Export hint */}
                <p className="text-[10px] text-[var(--text-3)] mt-3 leading-relaxed" style={{ fontFamily: 'var(--font-mono)' }}>{PLATFORM_META[platform].exportNote}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
