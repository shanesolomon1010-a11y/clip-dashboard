'use client';

import { useEffect, useState } from 'react';
import TopPostsTable from '@/components/TopPostsTable';
import UploadZone from '@/components/UploadZone';
import { PLATFORM_COLORS, PLATFORM_LABELS, UnifiedPost } from '@/types';
import { formatNum } from '@/lib/utils';
import { useVideoModal } from '@/context/VideoModalContext';
import { getTotalViewsPerClip, type ClipTotals } from '@/lib/db';

interface Props {
  posts: UnifiedPost[];
  onUpload: (posts: UnifiedPost[]) => void;
  onPostUpdate: (postId: string, contentType: string | undefined) => void;
}

export default function ContentView({ posts, onUpload, onPostUpdate }: Props) {
  const recent = [...posts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  const { open } = useVideoModal();
  const [totalsMap, setTotalsMap] = useState<Record<string, ClipTotals>>({});

  useEffect(() => {
    getTotalViewsPerClip().then((totals) => {
      const map: Record<string, ClipTotals> = {};
      for (const t of totals) map[`${t.clip_code}::${t.platform}`] = t;
      setTotalsMap(map);
    }).catch(() => setTotalsMap({}));
  }, []);

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
              onClick={() => post.clip_code && open(post, post.clip_code)}
              className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl p-4 hover:bg-[var(--bg-hover)] hover:border-[rgba(247,231,206,0.09)] transition-all group cursor-pointer"
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
                {post.url && (
                  <svg className="w-3 h-3 text-[var(--text-2)]" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M4 3l10 5-10 5V3z" />
                  </svg>
                )}
                <span className="text-[10px] text-[var(--text-2)] ml-auto font-medium">{post.date}</span>
              </div>
              <p className="text-xs text-[var(--text-1)] font-medium leading-snug line-clamp-2 mb-3 group-hover:text-[var(--text-1)] transition-colors">{post.clip_code}</p>
              <div className="space-y-1">
                {(() => {
                  const t = totalsMap[`${post.clip_code}::${post.platform}`];
                  const v = t?.total_views ?? post.views;
                  const interactions = t
                    ? t.total_likes + t.total_comments + t.total_shares + t.total_saves
                    : post.likes + post.comments + post.shares + post.saves;
                  return (
                    <>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-[var(--text-2)]">Views</span>
                        <span className="text-[var(--text-1)] font-semibold tabular-nums font-['JetBrains_Mono']">{formatNum(v)}</span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-[var(--text-2)]">Eng. Rate</span>
                        <span className="font-semibold tabular-nums text-[var(--text-2)] font-['JetBrains_Mono']">
                          {v === 0 ? '—' : `${(interactions / v * 100).toFixed(1)}%`}
                        </span>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          ))}
          {recent.length === 0 && (
            <div className="col-span-4 bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl p-8 text-center text-[var(--text-2)] text-sm">
              No posts yet — upload a CSV to get started
            </div>
          )}
        </div>
      </div>

      {/* Full posts table */}
      <TopPostsTable posts={posts} onContentTypeChange={onPostUpdate} clipTotals={totalsMap} />

      {/* Upload zone */}
      <UploadZone onUpload={onUpload} />
    </div>
  );
}
