'use client';

import { useMemo, useState } from 'react';
import { DateRange, Platform, PLATFORM_COLORS, PLATFORM_LABELS, UnifiedPost } from '@/types';
import { SAMPLE_POSTS } from '@/lib/sampleData';
import MetricCard from '@/components/MetricCard';
import ViewsLineChart from '@/components/ViewsLineChart';
import PlatformBarChart from '@/components/PlatformBarChart';
import TopPostsTable from '@/components/TopPostsTable';
import UploadZone from '@/components/UploadZone';

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
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return posts.filter((p) => p.date >= cutoffStr);
}

export default function DashboardPage() {
  const [posts, setPosts] = useState<UnifiedPost[]>(SAMPLE_POSTS);
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [activePlatform, setActivePlatform] = useState<Platform | 'all'>('all');

  const filteredByDate = useMemo(() => filterByDateRange(posts, dateRange), [posts, dateRange]);

  const filteredPosts = useMemo(() =>
    activePlatform === 'all'
      ? filteredByDate
      : filteredByDate.filter((p) => p.platform === activePlatform),
    [filteredByDate, activePlatform]
  );

  const activePlatforms = useMemo<Platform[]>(() =>
    activePlatform === 'all'
      ? ALL_PLATFORMS.filter((pl) => filteredByDate.some((p) => p.platform === pl))
      : [activePlatform],
    [activePlatform, filteredByDate]
  );

  // Metrics
  const totalViews = useMemo(() => filteredPosts.reduce((s, p) => s + p.views, 0), [filteredPosts]);
  const totalPosts = filteredPosts.length;
  const avgEngagement = useMemo(() =>
    filteredPosts.length
      ? filteredPosts.reduce((s, p) => s + p.engagementRate, 0) / filteredPosts.length
      : 0,
    [filteredPosts]
  );
  const bestPost = useMemo(() =>
    [...filteredPosts].sort((a, b) => b.views - a.views)[0] ?? null,
    [filteredPosts]
  );

  const handleUpload = (newPosts: UnifiedPost[]) => {
    setPosts((prev) => {
      const existingIds = new Set(prev.map((p) => p.id));
      return [...prev, ...newPosts.filter((p) => !existingIds.has(p.id))];
    });
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm font-bold">
              C
            </div>
            <h1 className="text-lg font-bold tracking-tight">Clip Analytics</h1>
            <span className="hidden sm:inline text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
              {posts.length} posts loaded
            </span>
          </div>

          {/* Date Range */}
          <div className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
            {(['7d', '30d', '90d', 'all'] as DateRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                  dateRange === r
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                {r === 'all' ? 'All' : r.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Platform Tabs */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setActivePlatform('all')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold border transition-all ${
              activePlatform === 'all'
                ? 'bg-white text-gray-950 border-white'
                : 'bg-transparent text-gray-400 border-gray-700 hover:border-gray-500 hover:text-white'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-indigo-400 to-purple-500" />
            All Platforms
          </button>

          {ALL_PLATFORMS.map((platform) => {
            const isActive = activePlatform === platform;
            const color = PLATFORM_COLORS[platform];
            return (
              <button
                key={platform}
                onClick={() => setActivePlatform(isActive ? 'all' : platform)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold border transition-all ${
                  isActive
                    ? 'text-white border-transparent'
                    : 'bg-transparent text-gray-400 border-gray-700 hover:border-gray-500 hover:text-white'
                }`}
                style={isActive ? { background: `${color}33`, borderColor: `${color}66`, color } : {}}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                {PLATFORM_LABELS[platform]}
              </button>
            );
          })}
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Total Views"
            value={formatNum(totalViews)}
            sub={`across ${totalPosts} posts`}
            accent="#6366f1"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            }
          />
          <MetricCard
            label="Total Posts"
            value={String(totalPosts)}
            sub={`in ${dateRange === 'all' ? 'all time' : `last ${dateRange}`}`}
            accent="#8b5cf6"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18M9 21V9" />
              </svg>
            }
          />
          <MetricCard
            label="Avg Engagement"
            value={`${avgEngagement.toFixed(2)}%`}
            sub="likes + comments + shares + saves"
            accent="#10b981"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            }
          />
          <MetricCard
            label="Best Post"
            value={bestPost ? formatNum(bestPost.views) : '—'}
            sub={bestPost ? `${PLATFORM_LABELS[bestPost.platform]}: ${bestPost.title.slice(0, 36)}…` : 'No data'}
            accent="#f59e0b"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            }
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2">
            <ViewsLineChart posts={filteredByDate} activePlatforms={activePlatforms} />
          </div>
          <div>
            <PlatformBarChart posts={filteredByDate} activePlatforms={activePlatforms} />
          </div>
        </div>

        {/* Top Posts Table */}
        <TopPostsTable posts={filteredPosts} />

        {/* CSV Upload */}
        <UploadZone onUpload={handleUpload} />
      </main>

      <footer className="border-t border-gray-800 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between text-xs text-gray-600">
          <span>Clip Analytics Dashboard</span>
          <span>{new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
}
