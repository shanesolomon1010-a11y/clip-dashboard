'use client';

import { useMemo } from 'react';
import { Platform, PLATFORM_COLORS, PLATFORM_LABELS, UnifiedPost } from '@/types';
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

  const last7  = useMemo(() => filterDays(posts, 7), [posts]);
  const last30 = useMemo(() => filterDays(posts, 30), [posts]);
  const last90 = useMemo(() => filterDays(posts, 90), [posts]);

  const m7  = useMemo(() => metrics(last7), [last7]);
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

  return (
    <div className="flex gap-6 p-6 min-h-full">
      {/* ── Left column ─────────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-5">

        {/* Greeting */}
        <div>
          <p className="text-xs text-gray-500 mb-0.5">{now}</p>
          <h2 className="text-xl font-bold text-white">Welcome back, Creator</h2>
        </div>

        {/* Summary comparison */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Performance Summary</h3>
            <span className="text-xs text-gray-500">30-day window</span>
          </div>
          <div className="grid grid-cols-3 divide-x divide-gray-800">
            {[
              {
                label: 'Views',
                icon: <IconEye className="w-4 h-4" />,
                v7: formatNum(m7.views),
                v30: formatNum(m30.views),
                accent: '#6366f1',
              },
              {
                label: 'Posts',
                icon: <IconStar className="w-4 h-4" />,
                v7: String(m7.posts),
                v30: String(m30.posts),
                accent: '#8b5cf6',
              },
              {
                label: 'Avg Engagement',
                icon: <IconTrendUp className="w-4 h-4" />,
                v7: `${m7.eng.toFixed(1)}%`,
                v30: `${m30.eng.toFixed(1)}%`,
                accent: '#10b981',
              },
            ].map(({ label, icon, v7, v30, accent }) => (
              <div key={label} className="px-5 py-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <span style={{ color: accent }}>{icon}</span>
                  <span className="text-xs text-gray-500 font-medium">{label}</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[11px] text-gray-600">Last 7d</span>
                    <span className="text-base font-bold text-white">{v7}</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[11px] text-gray-600">Last 30d</span>
                    <span className="text-sm font-semibold text-gray-400">{v30}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Views line chart */}
        <ViewsLineChart posts={last90} activePlatforms={activePlatforms} />

        {/* Top content */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <h3 className="text-sm font-semibold text-white">Top Content — Last 30 Days</h3>
          </div>
          <div className="divide-y divide-gray-800/60">
            {topPosts.map((post, i) => (
              <div key={post.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-800/40 transition-colors">
                <span className="text-xs font-bold text-gray-600 w-4 shrink-0">{i + 1}</span>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded shrink-0"
                  style={{
                    background: `${PLATFORM_COLORS[post.platform]}22`,
                    color: PLATFORM_COLORS[post.platform],
                  }}
                >
                  {PLATFORM_LABELS[post.platform]}
                </span>
                <span className="flex-1 text-sm text-gray-200 truncate min-w-0">{post.title}</span>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-white">{formatNum(post.views)}</p>
                  <p className="text-[10px] text-gray-600">{post.engagementRate.toFixed(1)}% eng</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right rail ──────────────────────────────────────── */}
      <div className="w-72 shrink-0 space-y-4">

        {/* Channel analytics card */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3.5 border-b border-gray-800">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Channel Analytics</h3>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <p className="text-[11px] text-gray-500 mb-1 flex items-center gap-1.5">
                <IconEye className="w-3.5 h-3.5" /> Total Views
              </p>
              <p className="text-3xl font-bold text-white">{formatNum(totalViews)}</p>
              <p className="text-xs text-gray-600 mt-0.5">across all platforms</p>
            </div>
            <div className="h-px bg-gray-800" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] text-gray-500 mb-1">Total Posts</p>
                <p className="text-lg font-bold text-white">{posts.length}</p>
              </div>
              <div>
                <p className="text-[11px] text-gray-500 mb-1">Avg Engagement</p>
                <p className="text-lg font-bold text-white">{totalEng.toFixed(1)}%</p>
              </div>
            </div>
          </div>
        </div>

        {/* Platform breakdown */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3.5 border-b border-gray-800">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Platforms</h3>
          </div>
          <div className="p-3 space-y-1">
            {platformTotals.map(({ platform, views, count }) => {
              const pct = totalViews > 0 ? (views / totalViews) * 100 : 0;
              return (
                <div key={platform} className="rounded-lg px-3 py-2.5 hover:bg-gray-800/60 transition-colors">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: PLATFORM_COLORS[platform] }} />
                      <span className="text-xs text-gray-300 font-medium">{PLATFORM_LABELS[platform]}</span>
                    </div>
                    <span className="text-xs text-white font-semibold">{formatNum(views)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: PLATFORM_COLORS[platform] }}
                      />
                    </div>
                    <span className="text-[10px] text-gray-600 w-8 text-right">{count}p</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* What's new / tips */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3.5 border-b border-gray-800 flex items-center gap-2">
            <IconLightning className="w-3.5 h-3.5 text-amber-400" />
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Creator Tips</h3>
          </div>
          <div className="divide-y divide-gray-800/60">
            {TIPS.map((tip) => (
              <div key={tip.title} className="px-4 py-3.5">
                <div className="flex items-start gap-2.5">
                  <span className="text-base mt-px shrink-0">{tip.icon}</span>
                  <div>
                    <p className="text-xs font-semibold text-gray-200 mb-0.5">{tip.title}</p>
                    <p className="text-[11px] text-gray-500 leading-relaxed">{tip.body}</p>
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
