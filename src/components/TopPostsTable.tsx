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
    <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-white/[0.05] flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Top Posts</h2>
        <span className="text-[11px] text-gray-600">by views</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-white/[0.04]">
              <th className="px-5 py-3 text-[11px] font-medium text-gray-600 uppercase tracking-wider">Platform</th>
              <th className="px-5 py-3 text-[11px] font-medium text-gray-600 uppercase tracking-wider">Title</th>
              <th className="px-5 py-3 text-[11px] font-medium text-gray-600 uppercase tracking-wider text-right">Views</th>
              <th className="px-5 py-3 text-[11px] font-medium text-gray-600 uppercase tracking-wider text-right">Likes</th>
              <th className="px-5 py-3 text-[11px] font-medium text-gray-600 uppercase tracking-wider text-right">Interactions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((post) => (
              <tr
                key={post.id}
                className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors group"
              >
                <td className="px-5 py-3.5">
                  <span
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold"
                    style={{
                      background: `${PLATFORM_COLORS[post.platform]}15`,
                      color: PLATFORM_COLORS[post.platform],
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: PLATFORM_COLORS[post.platform] }}
                    />
                    {PLATFORM_LABELS[post.platform]}
                  </span>
                </td>
                <td className="px-5 py-3.5 max-w-[220px]">
                  <span className="text-gray-200 truncate block text-[13px] group-hover:text-white transition-colors" title={post.title}>
                    {post.title.length > 44 ? post.title.slice(0, 44) + '…' : post.title}
                  </span>
                  <span className="text-gray-600 text-[11px]">{post.date}</span>
                </td>
                <td className="px-5 py-3.5 text-right">
                  <span className="text-white font-semibold tabular-nums">{formatNum(post.views)}</span>
                </td>
                <td className="px-5 py-3.5 text-right">
                  <span className="text-gray-400 tabular-nums">{formatNum(post.likes)}</span>
                </td>
                <td className="px-5 py-3.5 text-right">
                  <span className="text-gray-300 font-semibold tabular-nums text-[13px]">
                    {formatNum(post.likes + post.comments + post.shares + post.saves)}
                  </span>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-gray-600 text-sm">No posts yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
