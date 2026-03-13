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
      const eng = pp.length ? pp.reduce((s, p) => s + p.engagementRate, 0) / pp.length : 0;
      const best = [...pp].sort((a, b) => b.views - a.views)[0] ?? null;
      return { platform: pl, count: pp.length, views, likes, comments, shares, eng, best };
    }),
    [posts]
  );

  return (
    <div className="p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-white mb-1">Platform Overview</h2>
        <p className="text-sm text-gray-500">All-time stats per platform based on imported CSV data.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {platformData.map(({ platform, count, views, likes, comments, shares, eng, best }) => {
          const color = PLATFORM_COLORS[platform];
          const hasData = count > 0;
          return (
            <div
              key={platform}
              className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-700 transition-colors"
            >
              {/* Header */}
              <div
                className="px-5 py-4 flex items-center justify-between"
                style={{ borderBottom: `1px solid ${color}22`, background: `${color}0a` }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ background: color }} />
                  <span className="font-semibold text-white">{PLATFORM_LABELS[platform]}</span>
                </div>
                <span
                  className="text-xs font-bold px-2.5 py-1 rounded-full"
                  style={{ background: `${color}22`, color }}
                >
                  {hasData ? `${count} posts` : 'No data'}
                </span>
              </div>

              <div className="p-5">
                {!hasData ? (
                  <div className="text-center py-4">
                    <p className="text-gray-600 text-sm mb-1">No data imported yet</p>
                    <p className="text-gray-700 text-xs">{PLATFORM_META[platform].exportNote}</p>
                  </div>
                ) : (
                  <>
                    {/* Stats grid */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      {[
                        { label: 'Views',    value: formatNum(views) },
                        { label: 'Likes',    value: formatNum(likes) },
                        { label: 'Comments', value: formatNum(comments) },
                        { label: 'Shares',   value: formatNum(shares) },
                      ].map(({ label, value }) => (
                        <div key={label} className="bg-gray-800/60 rounded-lg px-3 py-2.5">
                          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{label}</p>
                          <p className="text-sm font-bold text-white">{value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Avg engagement */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs text-gray-500">Avg Engagement Rate</span>
                        <span className="text-sm font-bold" style={{ color: eng > 10 ? '#22c55e' : eng > 5 ? '#eab308' : '#9ca3af' }}>
                          {eng.toFixed(2)}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.min(eng * 4, 100)}%`, background: color }}
                        />
                      </div>
                    </div>

                    {/* Best post */}
                    {best && (
                      <div className="bg-gray-800/50 rounded-lg p-3">
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Best Post</p>
                        <p className="text-xs text-gray-200 font-medium leading-snug line-clamp-2 mb-1.5">{best.title}</p>
                        <div className="flex gap-3 text-[11px]">
                          <span className="text-gray-500">Views: <span className="text-white font-semibold">{formatNum(best.views)}</span></span>
                          <span className="text-gray-500">Eng: <span className="text-white font-semibold">{best.engagementRate.toFixed(1)}%</span></span>
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
