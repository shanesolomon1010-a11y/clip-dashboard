'use client';

import { useState } from 'react';
import { CONTENT_TYPES, PLATFORM_COLORS, PLATFORM_LABELS, UnifiedPost } from '@/types';
import { updatePostContentType } from '@/lib/db';
import { formatNum } from '@/lib/utils';
import { useVideoModal } from '@/context/VideoModalContext';

const CONTENT_TYPE_COLORS: Record<string, string> = {
  'Hook Video':   '#d4922a',
  'Tutorial':     '#3b82f6',
  'UGC Style':    '#a855f7',
  'Talking Head': '#22c55e',
  'B-Roll':       '#f97316',
  'Podcast Clip': '#ec4899',
  'Text Post':    '#14b8a6',
  'Other':        '#6b7280',
};

interface Props {
  posts: UnifiedPost[];
  onContentTypeChange?: (postId: string, contentType: string | undefined) => void;
}


export default function TopPostsTable({ posts, onContentTypeChange }: Props) {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const { open } = useVideoModal();

  const handleTypeSelect = async (post: UnifiedPost, type: string) => {
    setOpenDropdown(null);
    setSaving(post.id);
    const previousType = post.content_type;
    onContentTypeChange?.(post.id, type);
    try {
      await updatePostContentType(post.platform, post.title, post.date, type);
    } catch {
      onContentTypeChange?.(post.id, previousType);
    } finally {
      setSaving(null);
    }
  };

  const sorted = [...posts].sort((a, b) => b.views - a.views).slice(0, 10);

  return (
    <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-white/[0.05] flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-[var(--text-1)]">Top Posts</h2>
        <span className="text-[11px] text-[var(--text-2)]">by views</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-white/[0.04]">
              <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-[0.16em]">Platform</th>
              <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-[0.16em]">Title</th>
              <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-[0.16em] text-right">Views</th>
              <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-[0.16em] text-right">Likes</th>
              <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-[0.16em] text-right">Comments</th>
              <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-[0.16em] text-right">
                <span title="Engagement Rate = (Likes + Comments + Shares + Saves) / Views × 100" className="cursor-help underline decoration-dotted underline-offset-2">Eng. Rate</span>
              </th>
              <th className="px-5 py-3 text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-[0.16em]">Type</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {sorted.map((post) => (
              <tr
                key={post.id}
                className="hover:bg-white/[0.02] transition-colors group"
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
                <td className="px-5 py-3.5 max-w-[220px] cursor-pointer" onClick={() => open(post)}>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[var(--text-1)] truncate text-[13px] group-hover:text-white transition-colors flex-1" title={post.title}>
                      {post.title.length > 44 ? post.title.slice(0, 44) + '…' : post.title}
                    </span>
                    {post.url && (
                      <svg className="w-3 h-3 shrink-0 text-amber-400/70" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M4 3l10 5-10 5V3z" />
                      </svg>
                    )}
                  </div>
                  <span className="text-[var(--text-3)] text-[11px]">{post.date}</span>
                </td>
                <td className="px-5 py-3.5 text-right">
                  <span className="text-[var(--text-1)] font-semibold tabular-nums font-['JetBrains_Mono']">{formatNum(post.views)}</span>
                </td>
                <td className="px-5 py-3.5 text-right">
                  <span className="text-[var(--text-2)] tabular-nums font-['JetBrains_Mono']">{formatNum(post.likes)}</span>
                </td>
                <td className="px-5 py-3.5 text-right">
                  <span className="text-[var(--text-2)] tabular-nums font-['JetBrains_Mono']">{formatNum(post.comments)}</span>
                </td>
                <td className="px-5 py-3.5 text-right">
                  <span className="text-[var(--text-2)] font-semibold tabular-nums font-['JetBrains_Mono'] text-[13px]">
                    {post.views === 0 ? '—' : `${((post.likes + post.comments + post.shares + post.saves) / post.views * 100).toFixed(1)}%`}
                  </span>
                </td>
                <td className="px-5 py-3.5 relative">
                  <button
                    onClick={() => setOpenDropdown(openDropdown === post.id ? null : post.id)}
                    disabled={saving === post.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border transition-all disabled:opacity-50"
                    style={
                      post.content_type
                        ? {
                            background: `${CONTENT_TYPE_COLORS[post.content_type] ?? '#6b7280'}18`,
                            borderColor: `${CONTENT_TYPE_COLORS[post.content_type] ?? '#6b7280'}40`,
                            color: CONTENT_TYPE_COLORS[post.content_type] ?? '#6b7280',
                          }
                        : { borderColor: 'rgba(255,255,255,0.06)', color: 'var(--text-3)' }
                    }
                  >
                    {post.content_type ?? '—'}
                  </button>
                  {openDropdown === post.id && (
                    <div className="absolute right-0 top-full mt-1 z-50 bg-[var(--bg-elevated)] border border-white/[0.08] rounded-xl shadow-xl overflow-hidden py-1 w-36">
                      {CONTENT_TYPES.map((type) => (
                        <button
                          key={type}
                          onClick={() => handleTypeSelect(post, type)}
                          className="w-full text-left px-3.5 py-2 text-[11px] text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-white/[0.04] transition-colors"
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-[var(--text-2)] text-sm">No posts yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
