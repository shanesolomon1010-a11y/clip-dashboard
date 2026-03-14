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
    <div className="p-5 space-y-5">
      {/* Recently added */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-[0.16em]">Recently Added</h2>
          <span className="text-[11px] text-[var(--text-2)]">{posts.length} total posts</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {recent.map((post) => (
            <div
              key={post.id}
              className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl p-4 hover:bg-[var(--bg-hover)] hover:border-white/[0.09] transition-all group"
            >
              <div className="flex items-center gap-2 mb-3">
                <span
                  className="text-[10px] font-semibold px-2 py-1 rounded-lg"
                  style={{
                    background: `${PLATFORM_COLORS[post.platform]}15`,
                    color: PLATFORM_COLORS[post.platform],
                  }}
                >
                  {PLATFORM_LABELS[post.platform]}
                </span>
                <span className="text-[10px] text-[var(--text-2)] ml-auto font-medium">{post.date}</span>
              </div>
              <p className="text-xs text-[var(--text-1)] font-medium leading-snug line-clamp-2 mb-3 group-hover:text-white transition-colors">{post.title}</p>
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-[var(--text-2)]">Views</span>
                  <span className="text-[var(--text-1)] font-semibold tabular-nums font-['JetBrains_Mono']">{formatNum(post.views)}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-[var(--text-2)]">Eng. Rate</span>
                  <span className="font-semibold tabular-nums text-[var(--text-2)] font-['JetBrains_Mono']">
                    {post.views === 0 ? '—' : `${((post.likes + post.comments + post.shares + post.saves) / post.views * 100).toFixed(1)}%`}
                  </span>
                </div>
              </div>
            </div>
          ))}
          {recent.length === 0 && (
            <div className="col-span-4 bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl p-8 text-center text-[var(--text-2)] text-sm">
              No posts yet — upload a CSV to get started
            </div>
          )}
        </div>
      </div>

      {/* Full posts table */}
      <TopPostsTable posts={posts} />

      {/* Upload zone */}
      <UploadZone onUpload={onUpload} />
    </div>
  );
}
