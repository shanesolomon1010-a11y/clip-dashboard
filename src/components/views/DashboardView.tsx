'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Platform, PLATFORM_COLORS, PLATFORM_LABELS, UnifiedPost } from '@/types';
import { IconEye } from '@/components/Icons';
import { formatNum } from '@/lib/utils';
import { useVideoModal } from '@/context/VideoModalContext';
import { useFilter } from '@/context/FilterContext';
import { getAllPostsByDate, getLatestPostsPerClip } from '@/lib/db';
import { DateFilterBar, useDateFilter, type FilterPreset, type CustomRange } from '@/components/DateFilterBar';
import { ContentTypeToggle, type ContentType } from '@/components/ContentTypeToggle';

const ALL_PLATFORMS: Platform[] = ['youtube', 'instagram'];

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

const DASHBOARD_PRESET_KEY = 'dashboard_filter_preset';
const DASHBOARD_RANGE_KEY = 'dashboard_filter_custom_range';
const DASHBOARD_CONTENT_KEY = 'dashboard_content_type';

function isFilterPreset(v: unknown): v is FilterPreset {
  return v === '7d' || v === '30d' || v === 'all' || v === 'custom';
}

function isContentType(v: unknown): v is ContentType {
  return v === 'all' || v === 'long_form' || v === 'short';
}

function readInitialDashboardState(searchParams: URLSearchParams): {
  preset: FilterPreset;
  customRange: CustomRange | null;
  contentType: ContentType;
} {
  let preset: FilterPreset = '30d';
  let customRange: CustomRange | null = null;
  let contentType: ContentType = 'all';

  const urlRange = searchParams.get('range');
  const urlStart = searchParams.get('start');
  const urlEnd = searchParams.get('end');
  const urlContentType = searchParams.get('contentType');

  if (isFilterPreset(urlRange)) preset = urlRange;
  if (isContentType(urlContentType)) contentType = urlContentType;
  if (urlStart && urlEnd && YMD_RE.test(urlStart) && YMD_RE.test(urlEnd)) {
    customRange = { start: urlStart, end: urlEnd };
  }

  if (typeof window !== 'undefined') {
    if (!urlRange) {
      const stored = window.localStorage.getItem(DASHBOARD_PRESET_KEY);
      if (isFilterPreset(stored)) preset = stored;
    }
    if (!urlContentType) {
      const stored = window.localStorage.getItem(DASHBOARD_CONTENT_KEY);
      if (isContentType(stored)) contentType = stored;
    }
    if (!(urlStart && urlEnd)) {
      const raw = window.localStorage.getItem(DASHBOARD_RANGE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { start?: unknown; end?: unknown };
          if (typeof parsed.start === 'string' && typeof parsed.end === 'string'
              && YMD_RE.test(parsed.start) && YMD_RE.test(parsed.end)) {
            customRange = { start: parsed.start, end: parsed.end };
          }
        } catch {
          // fall through
        }
      }
    }
  }

  if (preset === 'custom' && !customRange) preset = '30d';

  return { preset, customRange, contentType };
}

function postInteractions(p: UnifiedPost): number {
  return p.likes + p.comments + p.shares + p.saves;
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}


interface ClipTotal {
  clip_code: string;
  clip_details_code: string | undefined;
  platform: string;
  total_views: number;
}

interface Props {
  posts: UnifiedPost[];
}

export default function DashboardView({ posts }: Props) {
  const { open: openVideoModal } = useVideoModal();
  const { platform } = useFilter();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [initialState] = useState(() =>
    readInitialDashboardState(new URLSearchParams(searchParams.toString())),
  );

  const [allDailyPosts, setAllDailyPosts] = useState<UnifiedPost[]>([]);
  const [latestClipPosts, setLatestClipPosts] = useState<UnifiedPost[]>([]);

  const { filterPreset, setFilterPreset, customRange, setCustomRange, filterStart, filterEnd, filterLabel } =
    useDateFilter(initialState.preset, initialState.customRange);

  const [contentType, setContentType] = useState<ContentType>(initialState.contentType);

  const firstSyncRef = useRef(true);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DASHBOARD_PRESET_KEY, filterPreset);
      window.localStorage.setItem(DASHBOARD_CONTENT_KEY, contentType);
      if (filterPreset === 'custom' && customRange) {
        window.localStorage.setItem(DASHBOARD_RANGE_KEY, JSON.stringify(customRange));
      }
    }
    // Skip the URL write on first render — the state was just read FROM the URL,
    // so re-writing would only thrash the history entry.
    if (firstSyncRef.current) {
      firstSyncRef.current = false;
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set('range', filterPreset);
    if (filterPreset === 'custom' && customRange) {
      params.set('start', customRange.start);
      params.set('end', customRange.end);
    } else {
      params.delete('start');
      params.delete('end');
    }
    if (contentType === 'all') params.delete('contentType');
    else params.set('contentType', contentType);
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [filterPreset, customRange, contentType]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    getAllPostsByDate('youtube', filterStart ?? undefined, filterEnd ?? undefined)
      .then(setAllDailyPosts)
      .catch(() => setAllDailyPosts([]));
  }, [filterStart, filterEnd]);

  useEffect(() => {
    getLatestPostsPerClip('youtube').then(setLatestClipPosts).catch(() => setLatestClipPosts([]));
  }, []);

  const filteredPosts = useMemo(() => {
    return posts.filter((p) => {
      if (platform !== 'all' && p.platform !== platform) return false;
      if (contentType !== 'all' && p.content_type !== contentType) return false;
      if (filterStart) {
        const d = p.stat_date ?? p.date ?? '';
        if (d < filterStart) return false;
        if (filterEnd && d > filterEnd) return false;
      }
      return true;
    });
  }, [posts, platform, contentType, filterStart, filterEnd]);

  const dateFilteredDailyPosts = useMemo(() => {
    return allDailyPosts.filter((p) => {
      if (contentType !== 'all' && p.content_type !== contentType) return false;
      if (filterStart) {
        const d = p.stat_date ?? p.date ?? '';
        if (d < filterStart) return false;
        if (filterEnd && d > filterEnd) return false;
      }
      return true;
    });
  }, [allDailyPosts, contentType, filterStart, filterEnd]);

  const dateFilteredClipTotals = useMemo(() => {
    const map = new Map<string, ClipTotal>();
    for (const p of dateFilteredDailyPosts) {
      if (!p.clip_code) continue;
      const ex = map.get(p.clip_code);
      if (!ex) {
        map.set(p.clip_code, { clip_code: p.clip_code, clip_details_code: p.clip_details_code, platform: p.platform, total_views: p.views });
      } else {
        ex.total_views += p.views;
      }
    }
    return Array.from(map.values()).sort((a, b) => b.total_views - a.total_views);
  }, [dateFilteredDailyPosts]);

  // Top content ranked by total views within the date filter
  const topPosts = useMemo(() => {
    if (dateFilteredClipTotals.length > 0) return dateFilteredClipTotals.slice(0, 6);
    return [...filteredPosts].sort((a, b) => b.views - a.views).slice(0, 6);
  }, [dateFilteredClipTotals, filteredPosts]);

  const totalViews = useMemo(() => dateFilteredClipTotals.reduce((s, c) => s + c.total_views, 0), [dateFilteredClipTotals]);
  const totalInteractions = useMemo(() => dateFilteredDailyPosts.reduce((s, p) => s + postInteractions(p), 0), [dateFilteredDailyPosts]);

  const totalPostsInWindow = useMemo(() => {
    const keys = new Set<string>();
    for (const p of dateFilteredDailyPosts) {
      if (p.clip_code) keys.add(`${p.clip_code}::${p.platform}`);
    }
    return keys.size;
  }, [dateFilteredDailyPosts]);

  const platformTotals = useMemo(() => {
    const byPlatform = new Map<Platform, { views: number; clips: Set<string> }>();
    for (const pl of ALL_PLATFORMS) byPlatform.set(pl, { views: 0, clips: new Set() });
    for (const p of dateFilteredDailyPosts) {
      const entry = byPlatform.get(p.platform);
      if (!entry) continue;
      entry.views += p.views;
      if (p.clip_code) entry.clips.add(p.clip_code);
    }
    return ALL_PLATFORMS
      .map((pl) => ({
        platform: pl,
        views: byPlatform.get(pl)!.views,
        count: byPlatform.get(pl)!.clips.size,
      }))
      .sort((a, b) => b.views - a.views);
  }, [dateFilteredDailyPosts]);

  // Peak day per clip_code from allDailyPosts (respects content-type filter)
  const peakByClip = useMemo(() => {
    const map = new Map<string, { date: string; views: number }>();
    for (const p of allDailyPosts) {
      if (!p.clip_code || !p.stat_date) continue;
      if (contentType !== 'all' && p.content_type !== contentType) continue;
      const existing = map.get(p.clip_code);
      if (!existing || p.views > existing.views) {
        map.set(p.clip_code, { date: p.stat_date, views: p.views });
      }
    }
    return map;
  }, [allDailyPosts, contentType]);


  const statsGrid = useMemo(() => {
    let sumViews = 0, sumImpressions = 0;
    let sumLikes = 0, sumComments = 0, sumShares = 0;
    let sumWeightedDuration = 0, sumViewsForDuration = 0;
    for (const p of dateFilteredDailyPosts) {
      sumViews += p.views;
      sumImpressions += p.impressions ?? 0;
      sumLikes += p.likes;
      sumComments += p.comments;
      sumShares += p.shares;
      if (p.avg_view_duration_seconds != null && p.views > 0) {
        sumWeightedDuration += p.avg_view_duration_seconds * p.views;
        sumViewsForDuration += p.views;
      }
    }
    return {
      totalViews: sumViews,
      totalImpressions: sumImpressions,
      totalLikes: sumLikes,
      totalComments: sumComments,
      totalShares: sumShares,
      avgDuration: sumViewsForDuration > 0 ? sumWeightedDuration / sumViewsForDuration : 0,
    };
  }, [dateFilteredDailyPosts]);

  const impressionCtrDisplay = useMemo(() => {
    let sumImpressions = 0, sumWeightedCtr = 0;
    for (const p of dateFilteredDailyPosts) {
      if (p.platform !== 'youtube') continue;
      if (p.impressions) {
        sumImpressions += p.impressions;
        if (p.impression_ctr != null) sumWeightedCtr += p.impressions * p.impression_ctr;
      }
    }
    return sumImpressions > 0 ? `${(sumWeightedCtr / sumImpressions).toFixed(1)}%` : 'N/A';
  }, [dateFilteredDailyPosts]);

  const topUniqueViewers = useMemo(() => {
    const clips = latestClipPosts
      .filter((p) => contentType === 'all' || p.content_type === contentType)
      .filter((p) => p.unique_viewers != null)
      .sort((a, b) => (b.unique_viewers ?? 0) - (a.unique_viewers ?? 0))
      .slice(0, 3);
    const snapshotDate = clips.reduce<string | null>((latest, p) => {
      const d = p.stat_date ?? '';
      return !latest || d > latest ? d : latest;
    }, null);
    return { clips, snapshotDate };
  }, [latestClipPosts, contentType]);

  const isClipTotal = (item: ClipTotal | UnifiedPost): item is ClipTotal =>
    'total_views' in item;

  return (
    <div className="flex gap-5 p-5 min-h-full">
      {/* ── Left column ─────────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-6">

        {/* Date filter bar + content-type toggle */}
        <div className="flex items-center gap-3 flex-wrap">
          <DateFilterBar
            preset={filterPreset}
            customRange={customRange}
            onPresetChange={setFilterPreset}
            onCustomRange={(start, end) => setCustomRange({ start, end })}
          />
          <ContentTypeToggle value={contentType} onChange={setContentType} />
        </div>

        {/* Stat grid — 8 cards, 4 columns */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {([
            { label: 'Total Views',       value: formatNum(statsGrid.totalViews) },
            { label: 'Total Impressions', value: formatNum(statsGrid.totalImpressions) },
            { label: 'Impression CTR',    value: impressionCtrDisplay },
            { label: 'Unique Viewers',    value: '' },
            { label: 'Total Likes',       value: formatNum(statsGrid.totalLikes) },
            { label: 'Total Comments',    value: formatNum(statsGrid.totalComments) },
            { label: 'Total Shares',      value: formatNum(statsGrid.totalShares) },
            { label: 'Avg View Duration', value: fmtDuration(statsGrid.avgDuration) },
          ] as { label: string; value: string }[]).map(({ label, value }) => {
            if (label === 'Unique Viewers') {
              return (
                <div key={label} className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl px-4 py-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-3)] mb-2">
                    Top Clips by Unique Viewers
                  </p>
                  {topUniqueViewers.clips.length === 0 ? (
                    <p className="text-[12px] text-[var(--text-3)] mt-2">No data yet</p>
                  ) : (
                    <>
                      <div className="space-y-1.5 mt-1">
                        {topUniqueViewers.clips.map((p) => (
                          <div key={p.id} className="flex items-center justify-between gap-2">
                            <span className="text-[11px] text-[var(--text-2)] truncate" style={{ fontFamily: 'var(--font-mono)' }}>
                              {p.clip_details_code ?? p.clip_code}
                            </span>
                            <span className="text-[11px] font-semibold tabular-nums shrink-0" style={{ color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>
                              {formatNum(p.unique_viewers ?? 0)}
                            </span>
                          </div>
                        ))}
                      </div>
                      {topUniqueViewers.snapshotDate && (
                        <p className="text-[10px] text-[var(--text-3)] mt-2">Last snapshot: {topUniqueViewers.snapshotDate}</p>
                      )}
                    </>
                  )}
                </div>
              );
            }
            return (
              <div key={label} className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl px-4 py-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-3)] mb-2">{label}</p>
                <p className="text-2xl font-bold tabular-nums leading-none" style={{ color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>{value}</p>
              </div>
            );
          })}
        </div>

        {/* Top content */}
        <div className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[rgba(247,231,206,0.05)] flex items-center justify-between">
            <h3 className="text-[15px] font-semibold text-[var(--text-1)]">Top Content</h3>
            <span className="text-[11px] text-[var(--text-2)]">{filterLabel}</span>
          </div>
          <div className="divide-y divide-[rgba(247,231,206,0.03)]">
            {topPosts.map((item, i) => {
              const clipCode = isClipTotal(item) ? item.clip_code : item.clip_code;
              const plt = isClipTotal(item) ? (item.platform as Platform) : item.platform;
              const views = isClipTotal(item) ? item.total_views : item.views;
              const peak = clipCode ? peakByClip.get(clipCode) : undefined;

              const handleClick = () => {
                if (!isClipTotal(item) && item.clip_details_code) {
                  openVideoModal(item, item.clip_details_code);
                } else if (isClipTotal(item) && item.clip_details_code) {
                  // Find a matching post from `posts` to open modal
                  const match = posts.find((p) => p.clip_code === item.clip_code);
                  if (match) openVideoModal(match, item.clip_details_code);
                }
              };

              return (
                <div
                  key={isClipTotal(item) ? `${item.clip_code}::${item.platform}` : item.id}
                  data-testid="post-row"
                  onClick={handleClick}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-[rgba(247,231,206,0.02)] transition-colors group cursor-pointer relative"
                >
                  <span className="text-[var(--text-3)] w-4 shrink-0 tabular-nums text-xs font-bold" style={{ fontFamily: 'var(--font-mono)' }}>{i + 1}</span>
                  <span
                    className="text-[10px] font-semibold px-2 py-1 rounded-lg shrink-0"
                    style={{
                      background: `${PLATFORM_COLORS[plt]}15`,
                      color: PLATFORM_COLORS[plt],
                    }}
                  >
                    {PLATFORM_LABELS[plt]}
                  </span>
                  <span className="flex-1 text-[13px] text-[var(--text-2)] truncate min-w-0 group-hover:text-[var(--text-1)] transition-colors">{clipCode}</span>
                  {!isClipTotal(item) && item.url && (
                    <svg className="w-3 h-3 shrink-0 text-[var(--text-2)]" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M4 3l10 5-10 5V3z" />
                    </svg>
                  )}
                  <div className="text-right shrink-0 mr-20">
                    <p className="text-sm font-bold text-[var(--text-1)] tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>{formatNum(views)}</p>
                    {peak && (
                      <p className="text-[10px] text-[var(--text-3)]">
                        Peak: {fmtDate(peak.date)} · {formatNum(peak.views)} views
                      </p>
                    )}
                  </div>

                </div>
              );
            })}
            {topPosts.length === 0 && (
              <div className="px-5 py-8 text-center text-[var(--text-2)] text-sm">No posts for {filterLabel.toLowerCase()}</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Right rail ──────────────────────────────────────── */}
      <div className="w-[260px] shrink-0 space-y-4">

        {/* Channel summary */}
        <div className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl overflow-hidden">
          <div className="px-4 py-3.5 border-b border-[rgba(247,231,206,0.05)]">
            <h3 className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-[0.16em]">Channel Summary</h3>
          </div>
          <div className="p-5">
            <p className="text-[11px] text-[var(--text-2)] mb-1 flex items-center gap-1.5">
              <IconEye className="w-3 h-3" /> Total Views
            </p>
            <p className="text-4xl font-bold leading-none tracking-tight text-[var(--text-1)]">{formatNum(totalViews)}</p>
            <p className="text-[11px] text-[var(--text-2)] mt-1">{filterLabel.toLowerCase()}</p>

            <div className="h-px bg-[rgba(247,231,206,0.05)] my-4" />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-3)] mb-1">Total Posts</p>
                <p className="text-xl font-bold text-[var(--text-1)] tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>{totalPostsInWindow}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-3)] mb-1">Interactions</p>
                <p className="text-xl font-bold text-[var(--text-1)] tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>{formatNum(totalInteractions)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Platform breakdown */}
        <div className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl overflow-hidden">
          <div className="px-4 py-3.5 border-b border-[rgba(247,231,206,0.05)]">
            <h3 className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-[0.16em]">Platforms</h3>
          </div>
          <div className="p-3 space-y-1">
            {platformTotals.map(({ platform: pl, views, count }) => {
              const pct = totalViews > 0 ? (views / totalViews) * 100 : 0;
              const color = PLATFORM_COLORS[pl];
              return (
                <div key={pl} className="rounded-xl px-3 py-2.5 hover:bg-[rgba(247,231,206,0.03)] transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                      <span className="text-xs text-[var(--text-2)] font-medium">{PLATFORM_LABELS[pl]}</span>
                    </div>
                    <span className="text-xs text-[var(--text-1)] font-semibold tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>{formatNum(views)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-[rgba(247,231,206,0.04)] rounded-full overflow-hidden">
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

      </div>
    </div>
  );
}
