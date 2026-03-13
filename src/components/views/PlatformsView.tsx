'use client';

import { useMemo } from 'react';
import { Platform, PLATFORM_COLORS, PLATFORM_LABELS, UnifiedPost } from '@/types';

const ALL_PLATFORMS: Platform[] = ['tiktok', 'instagram', 'linkedin', 'twitter', 'youtube'];

const PLATFORM_META: Record<Platform, { description: string; exportNote: string }> = {
  tiktok:    { description: 'Short-form video with algorithmic reach', exportNote: 'TikTok Studio → Analytics → Export' },
  instagram: { description: 'Reels and feed posts with saves-driven reach', exportNote: 'Instagram Insights → Export data' },
  linkedin:  { description: 'B2B content with high professional engagement', exportNote: 'LinkedIn Analytics → Post analytics → Export' },
  twitter:   { description: 'Real-time conversation and viral text+video', exportNote: 'X Analytics → Tweets → Export data' },
  youtube:   { description: 'Long-form and Shorts with watch-time signals', exportNote: 'YouTube Studio → Analytics → Export' },
};

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

interface Props { posts: UnifiedPost[] }

export default function PlatformsView({ posts }: Props) {
  const platformData = useMemo(() =>
    ALL_PLATFORMS.map((pl) => {
      const pp = posts.filter((p) => p.platform === pl);
      const views = pp.reduce((s, p) => s + p.views, 0);
      const likes = pp.reduce((s, p) => s + p.likes, 0);
      const comments = pp.reduce((s, p) => s + p.comments, 0);
      const shares = pp.reduce((s, p) => s + p.shares, 0);
      const interactions = pp.reduce((s, p) => s + p.likes + p.comments + p.shares + p.saves, 0);
      const best = [...pp].sort((a, b) => b.views - a.views)[0] ?? null;
      return { platform: pl, count: pp.length, views, likes, comments, shares, interactions, best };
    }),
    [posts]
  );

  return (
    <div className="p-6 space-y-5">
      <div>
        <h2 className="text-base font-bold text-white mb-1 tracking-tight">Platform Overview</h2>
        <p className="text-sm text-gray-500">All-time stats per platform based on imported CSV data.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {platformData.map(({ platform, count, views, likes, comments, shares, interactions, best }) => {
          const color = PLATFORM_COLORS[platform];
          const hasData = count > 0;
          return (
            <div
              key={platform}
              className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl overflow-hidden hover:border-white/[0.1] transition-all"
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
                  <span className="font-semibold text-white text-[13px]">{PLATFORM_LABELS[platform]}</span>
                  <span className="text-[11px] text-gray-600">{PLATFORM_META[platform].description}</span>
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
                    <div className="w-10 h-10 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto mb-3">
                      <span className="w-3 h-3 rounded-full" style={{ background: `${color}50` }} />
                    </div>
                    <p className="text-gray-500 text-sm font-medium">No data imported yet</p>
                    <p className="text-gray-700 text-xs leading-relaxed">{PLATFORM_META[platform].exportNote}</p>
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
                        <div key={label} className="bg-white/[0.03] border border-white/[0.05] rounded-xl px-3 py-2.5">
                          <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1 font-medium">{label}</p>
                          <p className="text-sm font-bold text-white tabular-nums">{value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Interactions bar */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] text-gray-500 font-medium">Interactions / Views</span>
                        <span className="text-xs font-bold tabular-nums text-gray-300">
                          {formatNum(interactions)} / {formatNum(views)}
                        </span>
                      </div>
                      <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${views > 0 ? Math.min((interactions / views) * 100 * 10, 100) : 0}%`, background: color, opacity: 0.8 }}
                        />
                      </div>
                    </div>

                    {/* Best post */}
                    {best && (
                      <div className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-3.5">
                        <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-2 font-medium">Best Post</p>
                        <p className="text-[12px] text-gray-200 font-medium leading-snug line-clamp-2 mb-2">{best.title}</p>
                        <div className="flex gap-4 text-[11px]">
                          <span className="text-gray-600">Views: <span className="text-white font-semibold tabular-nums">{formatNum(best.views)}</span></span>
                          <span className="text-gray-600">Interactions: <span className="text-white font-semibold tabular-nums">{formatNum(best.likes + best.comments + best.shares + best.saves)}</span></span>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Export hint */}
                <p className="text-[10px] text-gray-700 mt-3 leading-relaxed">{PLATFORM_META[platform].exportNote}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
