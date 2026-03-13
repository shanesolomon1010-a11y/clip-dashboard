'use client';

import { PLATFORM_COLORS, PLATFORM_LABELS, UnifiedPost } from '@/types';

interface Props {
  posts: UnifiedPost[];
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function TopPostsTable({ posts }: Props) {
  const sorted = [...posts].sort((a, b) => b.views - a.views).slice(0, 10);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-500 mb-4">Top Posts</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
              <th className="pb-3 font-semibold uppercase tracking-wider pr-4">Platform</th>
              <th className="pb-3 font-semibold uppercase tracking-wider pr-4">Title</th>
              <th className="pb-3 font-semibold uppercase tracking-wider pr-4 text-right">Views</th>
              <th className="pb-3 font-semibold uppercase tracking-wider pr-4 text-right">Likes</th>
              <th className="pb-3 font-semibold uppercase tracking-wider text-right">Eng. Rate</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((post) => (
              <tr
                key={post.id}
                className="border-b border-gray-800/50 hover:bg-gray-800/40 transition-colors"
              >
                <td className="py-3 pr-4">
                  <span
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold"
                    style={{
                      background: `${PLATFORM_COLORS[post.platform]}22`,
                      color: PLATFORM_COLORS[post.platform],
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: PLATFORM_COLORS[post.platform] }}
                    />
                    {PLATFORM_LABELS[post.platform]}
                  </span>
                </td>
                <td className="py-3 pr-4 max-w-[220px]">
                  <span className="text-gray-200 truncate block" title={post.title}>
                    {post.title.length > 44 ? post.title.slice(0, 44) + '…' : post.title}
                  </span>
                  <span className="text-gray-600 text-xs">{post.date}</span>
                </td>
                <td className="py-3 pr-4 text-right text-white font-semibold">{formatNum(post.views)}</td>
                <td className="py-3 pr-4 text-right text-gray-400">{formatNum(post.likes)}</td>
                <td className="py-3 text-right">
                  <span
                    className="font-semibold"
                    style={{
                      color: post.engagementRate > 10
                        ? '#22c55e'
                        : post.engagementRate > 5
                        ? '#eab308'
                        : '#9ca3af',
                    }}
                  >
                    {post.engagementRate.toFixed(2)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
