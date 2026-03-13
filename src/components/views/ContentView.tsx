'use client';

import TopPostsTable from '@/components/TopPostsTable';
import UploadZone from '@/components/UploadZone';
import { PLATFORM_COLORS, PLATFORM_LABELS, UnifiedPost } from '@/types';

interface Props {
  posts: UnifiedPost[];
  onUpload: (posts: UnifiedPost[]) => void;
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function ContentView({ posts, onUpload }: Props) {
  const recent = [...posts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);

  return (
    <div className="p-6 space-y-6">
      {/* Recent uploads strip */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Recently Added</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {recent.map((post) => (
            <div
              key={post.id}
              className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors"
            >
              <div className="flex items-center gap-2 mb-3">
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded"
                  style={{
                    background: `${PLATFORM_COLORS[post.platform]}22`,
                    color: PLATFORM_COLORS[post.platform],
                  }}
                >
                  {PLATFORM_LABELS[post.platform]}
                </span>
                <span className="text-[10px] text-gray-600 ml-auto">{post.date}</span>
              </div>
              <p className="text-xs text-gray-200 font-medium leading-snug line-clamp-2 mb-3">{post.title}</p>
              <div className="flex justify-between text-[11px]">
                <span className="text-gray-500">Views</span>
                <span className="text-white font-semibold">{formatNum(post.views)}</span>
              </div>
              <div className="flex justify-between text-[11px] mt-1">
                <span className="text-gray-500">Engagement</span>
                <span className="font-semibold" style={{ color: post.engagementRate > 10 ? '#22c55e' : '#eab308' }}>
                  {post.engagementRate.toFixed(1)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Full posts table */}
      <TopPostsTable posts={posts} />

      {/* Upload zone */}
      <UploadZone onUpload={onUpload} />
    </div>
  );
}
