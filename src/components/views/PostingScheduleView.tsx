'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────────

type Platform = 'yt' | 'ig' | 'tt' | 'tw';

interface ScheduledPost {
  id: string;
  clip_code: string;
  title: string;
  platform: Platform;
  scheduled_date: string;  // 'YYYY-MM-DD'
  post_time: string;
  status: string;
  content_type: string | null;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PLATFORM_COLORS: Record<Platform, string> = {
  yt: '#FF4444',
  ig: '#C855E8',
  tt: '#3ECFCF',
  tw: '#4A9EE8',
};

const PLATFORM_LABELS: Record<Platform, string> = {
  yt: 'YouTube',
  ig: 'Instagram',
  tt: 'TikTok',
  tw: 'Twitter/X',
};

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_LONG  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES   = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ── Date helpers ───────────────────────────────────────────────────────────────

/** Returns 'YYYY-MM-DD' for the given UTC year/month/day. Prevents DST shifts. */
function toDateStr(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

/** Returns today's date as 'YYYY-MM-DD' in local time (not UTC). */
function getTodayStr(): string {
  const t = new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, '0');
  const d = String(t.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parses a 'YYYY-MM-DD' string and returns display strings. */
function formatDisplayDate(dateStr: string): { full: string; weekday: string } {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const utc = new Date(Date.UTC(y, mo - 1, d));
  return {
    full:    `${MONTH_NAMES[utc.getUTCMonth()]} ${utc.getUTCDate()}, ${utc.getUTCFullYear()}`,
    weekday: WEEKDAY_LONG[utc.getUTCDay()],
  };
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function PostingScheduleView() {
  const [posts, setPosts]           = useState<ScheduledPost[]>([]);
  const [loading, setLoading]       = useState(true);
  const [year, setYear]             = useState(() => new Date().getFullYear());
  const [month, setMonth]           = useState(() => new Date().getMonth());  // 0-indexed
  const [selectedDate, setSelected] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const todayStr = getTodayStr();

  // Fetch on mount — no realtime subscription needed
  useEffect(() => {
    supabase
      .from('scheduled_posts')
      .select('id, clip_code, title, platform, scheduled_date, post_time, status, content_type')
      .then(({ data, error }) => {
        if (!error && data) setPosts(data as ScheduledPost[]);
        setLoading(false);
      });
  }, []);

  // Group posts by date string
  const postsByDate = new Map<string, ScheduledPost[]>();
  for (const post of posts) {
    const existing = postsByDate.get(post.scheduled_date) ?? [];
    existing.push(post);
    postsByDate.set(post.scheduled_date, existing);
  }

  // ── Calendar grid math (all via Date.UTC) ──────────────────────────────────
  const firstDayOfWeek = new Date(Date.UTC(year, month, 1)).getUTCDay();   // 0=Sun
  const daysInMonth    = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  // Fill leading blank cells, then day numbers, then trailing blanks to complete row
  const cells: (number | null)[] = [
    ...Array<null>(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  // ── Navigation ─────────────────────────────────────────────────────────────
  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  function openDrawer(day: number) {
    setSelected(toDateStr(year, month, day));
    setDrawerOpen(true);
  }
  function closeDrawer() {
    setDrawerOpen(false);
  }

  const selectedPosts  = selectedDate ? (postsByDate.get(selectedDate) ?? []) : [];
  const displayDate    = selectedDate ? formatDisplayDate(selectedDate) : null;

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--text-2)] text-sm">
        Loading schedule…
      </div>
    );
  }

  return (
    <div className="p-5">

      {/* Platform legend */}
      <div className="flex flex-wrap gap-5 mb-5">
        {(Object.entries(PLATFORM_LABELS) as [Platform, string][]).map(([key, label]) => (
          <span key={key} className="flex items-center gap-1.5 text-xs text-[var(--text-2)]">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: PLATFORM_COLORS[key] }}
            />
            {label}
          </span>
        ))}
      </div>

      {/* Month navigation */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={prevMonth}
          className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--bg-hover)] transition-colors text-lg leading-none"
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className="text-base font-medium text-[var(--text-1)] min-w-[156px] text-center">
          {MONTH_NAMES[month]} {year}
        </span>
        <button
          onClick={nextMonth}
          className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--bg-hover)] transition-colors text-lg leading-none"
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      {/* Calendar grid */}
      <div className="rounded-lg border border-[var(--border)] overflow-hidden">

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--bg-elevated)]">
          {WEEKDAY_SHORT.map(d => (
            <div
              key={d}
              className="py-2 text-center text-[9px] font-semibold tracking-[0.2em] uppercase text-[var(--text-3)]"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Cells */}
        <div className="grid grid-cols-7">
          {cells.map((day, idx) => {
            // Blank cell (before first day or trailing filler)
            if (day === null) {
              return (
                <div
                  key={`blank-${idx}`}
                  className="min-h-[80px] border-b border-r border-[var(--border)] bg-[var(--bg-base)] opacity-40"
                />
              );
            }

            const dateStr  = toDateStr(year, month, day);
            const dayPosts = postsByDate.get(dateStr) ?? [];
            const isToday  = dateStr === todayStr;
            // Deduplicate platforms — one dot per platform
            const platforms = Array.from(new Set(dayPosts.map(p => p.platform)));

            return (
              <div
                key={dateStr}
                onClick={() => openDrawer(day)}
                className={[
                  'min-h-[80px] border-b border-r border-[var(--border)] p-2 cursor-pointer transition-colors select-none',
                  isToday
                    ? 'bg-[var(--bg-elevated)]'
                    : 'bg-[var(--bg-base)] hover:bg-[var(--bg-hover)]',
                ].join(' ')}
              >
                {/* Date number + today pip */}
                <div className="flex items-center gap-1 mb-1.5">
                  {isToday && (
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                  )}
                  <span
                    className={[
                      'text-xs font-medium',
                      isToday ? 'text-[var(--text-1)]' : 'text-[var(--text-2)]',
                    ].join(' ')}
                  >
                    {day}
                  </span>
                </div>

                {/* Platform dots */}
                <div className="flex flex-wrap gap-1">
                  {platforms.map((p: Platform) => (
                    <span
                      key={p}
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: PLATFORM_COLORS[p] }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Slide-in drawer (always in DOM, animated via translateX) ────────── */}
      <div
        className={[
          'fixed inset-0 z-40 transition-opacity duration-200',
          drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        ].join(' ')}
      >
        {/* Backdrop — click outside to close */}
        <div
          className="absolute inset-0 bg-black/40"
          onClick={closeDrawer}
        />

        {/* Drawer panel */}
        <div
          className={[
            'absolute right-0 top-0 h-full w-80 flex flex-col',
            'bg-[var(--bg-elevated)] border-l border-[var(--border)]',
            'transition-transform duration-200 z-50',
            drawerOpen ? 'translate-x-0' : 'translate-x-full',
          ].join(' ')}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drawer header */}
          <div className="flex items-start justify-between p-4 border-b border-[var(--border)] flex-shrink-0">
            <div>
              <p className="text-sm font-semibold text-[var(--text-1)]">
                {displayDate?.full ?? ''}
              </p>
              <p className="text-xs text-[var(--text-2)] mt-0.5">
                {displayDate?.weekday ?? ''}
              </p>
            </div>
            <button
              onClick={closeDrawer}
              className="text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors mt-0.5 text-sm"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Drawer body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">

            {/* Empty state */}
            {selectedPosts.length === 0 && (
              <p className="text-sm text-[var(--text-2)] text-center py-6">
                Nothing scheduled
              </p>
            )}

            {/* Post cards */}
            {selectedPosts.map(post => (
              <div
                key={post.id}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3 space-y-2"
              >
                {/* Platform badge + time */}
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-1)]">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: PLATFORM_COLORS[post.platform] }}
                    />
                    {PLATFORM_LABELS[post.platform]}
                  </span>
                  <span className="text-xs text-[var(--text-2)]">{post.post_time}</span>
                </div>

                {/* Title */}
                <p className="text-sm font-medium text-[var(--text-1)] leading-snug">
                  {post.title}
                </p>

                {/* Clip code */}
                <p className="text-xs text-[var(--text-2)] font-mono">
                  {post.clip_code}
                </p>

                {/* Tags: content_type + status */}
                <div className="flex flex-wrap gap-1.5">
                  {post.content_type && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-hover)] text-[var(--text-2)] border border-[var(--border)]">
                      {post.content_type}
                    </span>
                  )}
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--gold-dim)] text-[var(--gold)] border border-[var(--gold-border)]">
                    {post.status}
                  </span>
                </div>
              </div>
            ))}

            {/* Schedule a post CTA */}
            <button className="w-full py-2.5 text-xs text-[var(--text-2)] border border-dashed border-[var(--border)] rounded-lg hover:border-[var(--border-md)] hover:text-[var(--text-1)] transition-colors">
              + Schedule a post
            </button>

          </div>
        </div>
      </div>

    </div>
  );
}
