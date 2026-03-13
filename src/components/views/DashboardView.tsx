'use client';

import { useMemo } from 'react';
import { Platform, PLATFORM_COLORS, PLATFORM_LABELS, UnifiedPost } from '@/types';
import MetricCard from '@/components/MetricCard';
import ViewsLineChart from '@/components/ViewsLineChart';
import { IconEye, IconTrendUp, IconStar, IconLightning } from '@/components/Icons';

const ALL_PLATFORMS: Platform[] = ['tiktok', 'instagram', 'linkedin', 'twitter', 'youtube'];

const TIPS = [
  { icon: '🎯', title: 'Hook within 1 second', body: 'Viewers decide in the first frame. Open on action, not on text cards.' },
  { icon: '🔁', title: 'Repurpose across platforms', body: 'A top TikTok clip can earn 3–5× more reach when posted natively to Reels and Shorts.' },
  { icon: '📊', title: 'Post time matters less', body: 'Algorithm reach now outweighs publish time. Focus on retention over scheduling.' },
  { icon: '💬', title: 'Reply to early comments', body: 'Engaging in the first 30 min signals content quality and boosts distribution.' },
];

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function filterDays(posts: UnifiedPost[], days: number): UnifiedPost[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return posts.filter((p) => p.date >= cutoffStr);
}

function metrics(posts: UnifiedPost[]) {
  const views = posts.reduce((s, p) => s + p.views, 0);
  const eng = posts.length ? posts.reduce((s, p) => s + p.engagementRate, 0) / posts.length : 0;
  return { views, posts: posts.length, eng };
}

interface Props {
  posts: UnifiedPost[];
}

export default function DashboardView({ posts }: Props) {
  const now = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const last30 = useMemo(() => filterDays(posts, 30), [posts]);
  const last90 = useMemo(() => filterDays(posts, 90), [posts]);

  const m30 = useMemo(() => metrics(last30), [last30]);

  const topPosts = useMemo(() => [...last30].sort((a, b) => b.views - a.views).slice(0, 6), [last30]);

  const activePlatforms = useMemo<Platform[]>(
    () => ALL_PLATFORMS.filter((pl) => last90.some((p) => p.platform === pl)),
    [last90]
  );

  const platformTotals = useMemo(() =>
    ALL_PLATFORMS.map((pl) => ({
      platform: pl,
      views: posts.filter((p) => p.platform === pl).reduce((s, p) => s + p.views, 0),
      count: posts.filter((p) => p.platform === pl).length,
    })).sort((a, b) => b.views - a.views),
    [posts]
  );

  const totalViews = posts.reduce((s, p) => s + p.views, 0);
  const totalEng = posts.length ? posts.reduce((s, p) => s + p.engagementRate, 0) / posts.length : 0;
  const topPlatform = platformTotals[0];

  return (
    <div className="flex gap-6 p-6 min-h-full">
      {/* ── Left column ─────────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-6">

        {/* Greeting */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs text-gray-600 mb-1 font-medium">{now}</p>
            <h2 className="text-xl font-bold text-white tracking-tight">Welcome back, Creator</h2>
          </div>
          <span className="text-[11px] text-gray-600 bg-white/[0.03] border border-white/[0.05] px-2.5 py-1 rounded-lg">
            Last 30 days
          </span>
        </div>

        {/* Metric cards strip */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <MetricCard
            label="Total Views"
            value={formatNum(totalViews)}
            sub="all-time across platforms"
            icon={<IconEye className="w-4 h-4" />}
            accent="#6366f1"
          />
          <MetricCard
            label="Posts (30d)"
            value={String(m30.posts)}
            sub={`${posts.length} total all-time`}
            icon={<IconStar className="w-4 h-4" />}
            accent="#8b5cf6"
          />
          <MetricCard
            label="Avg Engagement"
            value={`${totalEng.toFixed(1)}%`}
            sub="across all platforms"
            icon={<IconTrendUp className="w-4 h-4" />}
            accent="#10b981"
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
        <ViewsLineChart posts={last90} activePlatforms={activePlatforms} />

        {/* Top content */}
        <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.05] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Top Content</h3>
            <span className="text-[11px] text-gray-600">Last 30 days</span>
          </div>
          <div className="divide-y divide-white/[0.03]">
            {topPosts.map((post, i) => (
              <div key={post.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.02] transition-colors group">
                <span className="text-xs font-bold text-gray-700 w-4 shrink-0 tabular-nums">{i + 1}</span>
                <span
                  className="text-[10px] font-semibold px-2 py-1 rounded-lg shrink-0"
                  style={{
                    background: `${PLATFORM_COLORS[post.platform]}15`,
                    color: PLATFORM_COLORS[post.platform],
                  }}
                >
                  {PLATFORM_LABELS[post.platform]}
                </span>
                <span className="flex-1 text-[13px] text-gray-300 truncate min-w-0 group-hover:text-white transition-colors">{post.title}</span>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-white tabular-nums">{formatNum(post.views)}</p>
                  <p className="text-[10px] text-gray-600 tabular-nums">{post.engagementRate.toFixed(1)}% eng</p>
                </div>
              </div>
            ))}
            {topPosts.length === 0 && (
              <div className="px-5 py-8 text-center text-gray-600 text-sm">No posts in the last 30 days</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Right rail ──────────────────────────────────────── */}
      <div className="w-[260px] shrink-0 space-y-4">

        {/* Channel summary */}
        <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl overflow-hidden">
          <div className="px-4 py-3.5 border-b border-white/[0.05]">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Channel Summary</h3>
          </div>
          <div className="p-5">
            <p className="text-[11px] text-gray-600 mb-1 flex items-center gap-1.5">
              <IconEye className="w-3 h-3" /> Total Views
            </p>
            <p className="text-4xl font-bold text-white leading-none tracking-tight">{formatNum(totalViews)}</p>
            <p className="text-[11px] text-gray-600 mt-1">across all platforms</p>

            <div className="h-px bg-white/[0.05] my-4" />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] text-gray-600 mb-1">Total Posts</p>
                <p className="text-xl font-bold text-white">{posts.length}</p>
              </div>
              <div>
                <p className="text-[11px] text-gray-600 mb-1">Avg Eng.</p>
                <p className="text-xl font-bold text-white">{totalEng.toFixed(1)}%</p>
              </div>
            </div>
          </div>
        </div>

        {/* Platform breakdown */}
        <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl overflow-hidden">
          <div className="px-4 py-3.5 border-b border-white/[0.05]">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Platforms</h3>
          </div>
          <div className="p-3 space-y-1">
            {platformTotals.map(({ platform, views, count }) => {
              const pct = totalViews > 0 ? (views / totalViews) * 100 : 0;
              const color = PLATFORM_COLORS[platform];
              return (
                <div key={platform} className="rounded-xl px-3 py-2.5 hover:bg-white/[0.03] transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                      <span className="text-xs text-gray-300 font-medium">{PLATFORM_LABELS[platform]}</span>
                    </div>
                    <span className="text-xs text-white font-semibold tabular-nums">{formatNum(views)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-white/[0.04] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: color, opacity: 0.7 }}
                      />
                    </div>
                    <span className="text-[10px] text-gray-600 w-8 text-right tabular-nums">{count}p</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Creator Tips */}
        <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl overflow-hidden">
          <div className="px-4 py-3.5 border-b border-white/[0.05] flex items-center gap-2">
            <IconLightning className="w-3.5 h-3.5 text-amber-400" />
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Creator Tips</h3>
          </div>
          <div className="divide-y divide-white/[0.03]">
            {TIPS.map((tip) => (
              <div key={tip.title} className="px-4 py-3.5 hover:bg-white/[0.02] transition-colors">
                <div className="flex items-start gap-2.5">
                  <span className="text-base mt-px shrink-0">{tip.icon}</span>
                  <div>
                    <p className="text-[12px] font-semibold text-gray-200 mb-0.5">{tip.title}</p>
                    <p className="text-[11px] text-gray-600 leading-relaxed">{tip.body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
