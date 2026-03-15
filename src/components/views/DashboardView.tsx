'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { Platform, PLATFORM_COLORS, PLATFORM_LABELS, UnifiedPost } from '@/types';
import MetricCard from '@/components/MetricCard';
import ViewsLineChart from '@/components/ViewsLineChart';
import GoalsSection from '@/components/GoalsSection';
import { IconEye, IconTrendUp, IconStar, IconLightning } from '@/components/Icons';
import { formatNum } from '@/lib/utils';
import { useVideoModal } from '@/context/VideoModalContext';

const ALL_PLATFORMS: Platform[] = ['tiktok', 'instagram', 'linkedin', 'twitter', 'youtube'];

const TIPS = [
  {
    icon: '🎯',
    title: 'Hook within 1 second',
    body: 'Viewers decide in the first frame. Open on action, not on text cards.',
    details: [
      'The first frame is your entire pitch. If it looks like a title card or slow intro, 60–80% of viewers swipe before second 2.',
      'Best hooks: mid-action clips, a bold visual contrast, someone mid-sentence saying something surprising, or a text overlay that creates immediate curiosity ("I lost $10k doing this…").',
      'Avoid: logos, intros, "hey guys welcome back", slow zooms, black fades.',
      'Pro move: shoot your hook last — once you know the full story, it\'s easier to write the best entry point.',
      'Benchmark: aim for a 3-second retention rate above 70% in your analytics.',
    ],
  },
  {
    icon: '🔄',
    title: 'Repurpose across platforms',
    body: 'A top TikTok clip can earn 3–5× more reach when posted natively to Reels and Shorts.',
    details: [
      'Native uploads always outperform cross-posted links — each algorithm rewards content uploaded directly.',
      'Adjust aspect ratio and text safe zones per platform: TikTok and Reels favor 9:16 full bleed, Shorts wants text kept center-screen.',
      'Swap platform-specific audio when needed (trending sounds differ per platform).',
      'Post within 24–48 hrs of your original for maximum overlap momentum.',
      'Tools: CapCut, Descript, and ClipStudio (this app) can help batch your exports.',
      'Warning: remove TikTok watermarks before posting to Reels/Shorts — both algorithms suppress watermarked content.',
    ],
  },
  {
    icon: '📊',
    title: 'Post time matters less',
    body: 'Algorithm reach now outweighs publish time. Focus on retention over scheduling.',
    details: [
      'Pre-2022 advice said post at peak hours. That\'s largely obsolete — TikTok, Reels, and Shorts now distribute content over days or weeks based on engagement signals, not timestamps.',
      'What actually moves the needle: watch time %, like-to-view ratio, comment velocity in the first hour, and share rate.',
      'That said: posting when your core audience is awake still helps seed that first-hour signal. Use your platform analytics to find your audience\'s active window.',
      'Don\'t delay a great piece of content waiting for a "perfect" time. Consistency > timing.',
    ],
  },
  {
    icon: '💬',
    title: 'Reply to early comments',
    body: 'Engaging in the first 30 min signals content quality and boosts distribution.',
    details: [
      'Comments in the first 30 minutes are a strong quality signal to TikTok and Instagram\'s algorithms.',
      'Reply to every comment in that window if possible — even a single emoji reply counts as engagement and re-surfaces your post in commenter feeds.',
      'Ask a question in your caption or on-screen to seed the comment section before you post.',
      'Pin a comment yourself to set the tone — either a hot take, a follow-up detail, or a funny response.',
      'Video replies to comments (TikTok feature) consistently outperform text replies in reach.',
    ],
  },
];

type RangeKey = '1d' | '7d' | '30d' | '90d' | 'all';

const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: '1d',  label: 'Last 24 hours', days: 1   },
  { key: '7d',  label: 'Last 7 days',   days: 7   },
  { key: '30d', label: 'Last 30 days',  days: 30  },
  { key: '90d', label: 'Last 90 days',  days: 90  },
  { key: 'all', label: 'All time',      days: null },
];

function filterByDays(posts: UnifiedPost[], days: number | null): UnifiedPost[] {
  if (days === null) return posts;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return posts.filter((p) => p.date >= cutoffStr);
}

function postInteractions(p: UnifiedPost): number {
  return p.likes + p.comments + p.shares + p.saves;
}

function CreatorTips() {
  const [activeTip, setActiveTip] = useState<typeof TIPS[0] | null>(null);

  return (
    <>
      <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl overflow-hidden">
        <div className="px-4 py-3.5 border-b border-white/[0.05] flex items-center gap-2">
          <IconLightning className="w-3.5 h-3.5 text-amber-400" />
          <h3 className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-[0.16em]">Creator Tips</h3>
        </div>
        <div className="divide-y divide-white/[0.03]">
          {TIPS.map((tip) => (
            <button
              key={tip.title}
              onClick={() => setActiveTip(tip)}
              className="w-full px-4 py-3.5 hover:bg-white/[0.02] transition-colors text-left"
            >
              <div className="flex items-start gap-2.5">
                <span className="text-base mt-px shrink-0">{tip.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-[var(--text-1)] mb-0.5">{tip.title}</p>
                  <p className="text-[11px] text-[var(--text-2)] leading-relaxed">{tip.body}</p>
                </div>
                <svg
                  className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[var(--text-3)]"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M6 4l4 4-4 4" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      </div>

      {activeTip && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{
            backgroundColor: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            animation: 'fadeIn 200ms ease',
          }}
          onClick={() => setActiveTip(null)}
        >
          <div
            className="relative bg-[var(--bg-card)] border border-white/[0.08] rounded-2xl w-full max-w-md p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setActiveTip(null)}
              className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition-colors text-[var(--text-3)]"
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="w-3.5 h-3.5">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">{activeTip.icon}</span>
              <h2 className="text-[15px] font-semibold text-[var(--text-1)]">{activeTip.title}</h2>
            </div>
            <p className="text-[12px] text-[var(--text-2)] leading-relaxed mb-4">{activeTip.body}</p>
            <ul className="space-y-3">
              {activeTip.details.map((point, j) => (
                <li key={j} className="flex items-start gap-2.5">
                  <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-amber-400/60 shrink-0" />
                  <p className="text-[12px] text-[var(--text-2)] leading-relaxed">{point}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

interface Props {
  posts: UnifiedPost[];
}

export default function DashboardView({ posts }: Props) {
  const now = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const [range, setRange] = useState<RangeKey>('30d');
  const [open, setOpen] = useState(false);
  const { open: openVideoModal } = useVideoModal();
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const selectedRange = RANGES.find((r) => r.key === range)!;

  const filteredPosts = useMemo(
    () => filterByDays(posts, selectedRange.days),
    [posts, selectedRange.days]
  );

  const topPosts = useMemo(
    () => [...filteredPosts].sort((a, b) => b.views - a.views).slice(0, 6),
    [filteredPosts]
  );

  const activePlatforms = useMemo<Platform[]>(
    () => ALL_PLATFORMS.filter((pl) => filteredPosts.some((p) => p.platform === pl)),
    [filteredPosts]
  );

  const totalViews = useMemo(() => filteredPosts.reduce((s, p) => s + p.views, 0), [filteredPosts]);
  const totalInteractions = useMemo(() => filteredPosts.reduce((s, p) => s + postInteractions(p), 0), [filteredPosts]);

  const platformTotals = useMemo(() =>
    ALL_PLATFORMS.map((pl) => ({
      platform: pl,
      views: filteredPosts.filter((p) => p.platform === pl).reduce((s, p) => s + p.views, 0),
      count: filteredPosts.filter((p) => p.platform === pl).length,
    })).sort((a, b) => b.views - a.views),
    [filteredPosts]
  );

  const topPlatform = platformTotals[0];

  return (
    <div className="flex gap-5 p-5 min-h-full">
      {/* ── Left column ─────────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-6">

        {/* Greeting */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] text-[var(--text-3)] mb-1" style={{ fontFamily: 'var(--font-mono)' }}>{now}</p>
            <h2 className="text-[22px] font-bold text-[var(--text-1)] leading-tight tracking-tight">Welcome back, Creator</h2>
          </div>

          {/* Date range dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setOpen((o) => !o)}
              className="flex items-center gap-1.5 text-[10px] text-[var(--text-2)] border border-white/[0.06] px-2.5 py-1 rounded-lg hover:border-white/[0.12] hover:text-[var(--text-1)] transition-all"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {selectedRange.label}
              <svg
                className={`w-3 h-3 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {open && (
              <div className="absolute right-0 top-full mt-1.5 w-40 bg-[var(--bg-elevated)] border border-white/[0.08] rounded-xl shadow-xl z-50 overflow-hidden py-1">
                {RANGES.map((r) => (
                  <button
                    key={r.key}
                    onClick={() => { setRange(r.key); setOpen(false); }}
                    className={`w-full text-left px-3.5 py-2 text-[11px] transition-colors ${
                      r.key === range
                        ? 'text-[var(--gold)] bg-[var(--gold-dim)]'
                        : 'text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-white/[0.04]'
                    }`}
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {r.key === range && <span className="mr-1.5">✓</span>}{r.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Metric cards strip */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <MetricCard
            label="Total Views"
            value={formatNum(totalViews)}
            sub={selectedRange.label.toLowerCase()}
            icon={<IconEye className="w-4 h-4" />}
            accent="#d4922a"
          />
          <MetricCard
            label="Posts"
            value={String(filteredPosts.length)}
            sub={selectedRange.label.toLowerCase()}
            icon={<IconStar className="w-4 h-4" />}
            accent="#d4922a"
          />
          <MetricCard
            label="Total Interactions"
            value={formatNum(totalInteractions)}
            sub="likes, comments, shares & saves"
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

        {/* Goals */}
        <GoalsSection posts={filteredPosts} />

        {/* Views line chart */}
        <ViewsLineChart posts={filteredPosts} activePlatforms={activePlatforms} rangeLabel={selectedRange.label} />

        {/* Top content */}
        <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.05] flex items-center justify-between">
            <h3 className="text-[15px] font-semibold text-[var(--text-1)]">Top Content</h3>
            <span className="text-[11px] text-[var(--text-2)]">{selectedRange.label}</span>
          </div>
          <div className="divide-y divide-white/[0.03]">
            {topPosts.map((post, i) => (
              <div key={post.id} onClick={() => openVideoModal(post)} className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.02] transition-colors group cursor-pointer">
                <span className="text-[var(--text-3)] w-4 shrink-0 tabular-nums text-xs font-bold" style={{ fontFamily: 'var(--font-mono)' }}>{i + 1}</span>
                <span
                  className="text-[10px] font-semibold px-2 py-1 rounded-lg shrink-0"
                  style={{
                    background: `${PLATFORM_COLORS[post.platform]}15`,
                    color: PLATFORM_COLORS[post.platform],
                  }}
                >
                  {PLATFORM_LABELS[post.platform]}
                </span>
                <span className="flex-1 text-[13px] text-[var(--text-2)] truncate min-w-0 group-hover:text-[var(--text-1)] transition-colors">{post.title}</span>
                {post.url && (
                  <svg className="w-3 h-3 shrink-0 text-amber-400/70" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M4 3l10 5-10 5V3z" />
                  </svg>
                )}
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-[var(--text-1)] tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>{formatNum(post.views)}</p>
                  <p className="text-[10px] text-[var(--text-3)] tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>{formatNum(postInteractions(post))} interactions</p>
                </div>
              </div>
            ))}
            {topPosts.length === 0 && (
              <div className="px-5 py-8 text-center text-[var(--text-2)] text-sm">No posts for {selectedRange.label.toLowerCase()}</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Right rail ──────────────────────────────────────── */}
      <div className="w-[260px] shrink-0 space-y-4">

        {/* Channel summary */}
        <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl overflow-hidden">
          <div className="px-4 py-3.5 border-b border-white/[0.05]">
            <h3 className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-[0.16em]">Channel Summary</h3>
          </div>
          <div className="p-5">
            <p className="text-[11px] text-[var(--text-2)] mb-1 flex items-center gap-1.5">
              <IconEye className="w-3 h-3" /> Total Views
            </p>
            <p className="text-4xl font-bold leading-none tracking-tight text-[var(--text-1)]">{formatNum(totalViews)}</p>
            <p className="text-[11px] text-[var(--text-2)] mt-1">{selectedRange.label.toLowerCase()}</p>

            <div className="h-px bg-white/[0.05] my-4" />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-3)] mb-1">Total Posts</p>
                <p className="text-xl font-bold text-[var(--text-1)] tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>{filteredPosts.length}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-3)] mb-1">Interactions</p>
                <p className="text-xl font-bold text-[var(--text-1)] tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>{formatNum(totalInteractions)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Platform breakdown */}
        <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl overflow-hidden">
          <div className="px-4 py-3.5 border-b border-white/[0.05]">
            <h3 className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-[0.16em]">Platforms</h3>
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
                      <span className="text-xs text-[var(--text-2)] font-medium">{PLATFORM_LABELS[platform]}</span>
                    </div>
                    <span className="text-xs text-[var(--text-1)] font-semibold tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>{formatNum(views)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-white/[0.04] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: color, opacity: 0.6 }}
                      />
                    </div>
                    <span className="text-[10px] text-[var(--text-3)] w-8 text-right tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>{count}p</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Creator Tips */}
        <CreatorTips />
      </div>
    </div>
  );
}
