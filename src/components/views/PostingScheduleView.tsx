'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useVideoModal } from '@/context/VideoModalContext';
import { fetchAllClipDetails } from '@/lib/db';
import type { ClipDetail } from '@/lib/db';
import type { UnifiedPost, Platform as UnifiedPlatform } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────────

type Platform = 'yt' | 'ig';

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
};

const PLATFORM_LABELS: Record<Platform, string> = {
  yt: 'YouTube',
  ig: 'Instagram',
};

const SCHEDULE_TO_UNIFIED: Record<Platform, UnifiedPlatform> = {
  yt: 'youtube',
  ig: 'instagram',
};

const ALL_PLATFORMS: Platform[] = ['yt', 'ig'];
const DEFAULT_PLATFORMS = new Set<Platform>(['yt', 'ig']);

const TIME_OPTIONS: string[] = (() => {
  const opts: string[] = [];
  for (let h = 9; h <= 21; h++) {
    for (const min of [0, 30]) {
      if (h === 21 && min === 30) break;
      const period = h < 12 ? 'AM' : 'PM';
      const display12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      opts.push(`${display12}:${String(min).padStart(2, '0')} ${period}`);
    }
  }
  return opts;
})();

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
  const [fetchError, setFetchError] = useState(false);
  const [year, setYear]             = useState(() => new Date().getFullYear());
  const [month, setMonth]           = useState(() => new Date().getMonth());  // 0-indexed
  const [selectedDate, setSelected] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [todayStr]                  = useState(getTodayStr);
  const { open: openModal } = useVideoModal();

  // ── Scheduling form state ──────────────────────────────────────────────────
  const [schedulingMode, setSchedulingMode]           = useState(false);
  const [formStep, setFormStep]                       = useState<1 | 2 | 3>(1);
  const [clipOptions, setClipOptions]                 = useState<ClipDetail[]>([]);
  const [clipSearch, setClipSearch]                   = useState('');
  const [selectedClip, setSelectedClip]               = useState<ClipDetail | null>(null);
  const [selectedPlatforms, setSelectedPlatforms]     = useState<Set<Platform>>(new Set(DEFAULT_PLATFORMS));
  const [postTime, setPostTime]                       = useState('11:00 AM');
  const [submitting, setSubmitting]                   = useState(false);
  const [submitError, setSubmitError]                 = useState<string | null>(null);
  const [editingTimeId, setEditingTimeId]             = useState<string | null>(null);
  const [editingTimeValue, setEditingTimeValue]       = useState('11:00 AM');
  const [timeEditError, setTimeEditError]             = useState<string | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────

  function loadPosts() {
    supabase
      .from('scheduled_posts')
      .select('id, clip_code, title, platform, scheduled_date, post_time, status, content_type')
      .then(({ data, error }) => {
        if (error) {
          console.error('scheduled_posts fetch error:', error);
          setFetchError(true);
        } else if (data) {
          setPosts(data as ScheduledPost[]);
        }
        setLoading(false);
      });
  }

  function refetchPosts() {
    supabase
      .from('scheduled_posts')
      .select('id, clip_code, title, platform, scheduled_date, post_time, status, content_type')
      .then(({ data, error }) => {
        if (error) console.error('scheduled_posts refetch error:', error);
        else if (data) setPosts(data as ScheduledPost[]);
      });
  }

  useEffect(() => { loadPosts(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Group posts by date string
  const postsByDate = new Map<string, ScheduledPost[]>();
  for (const post of posts) {
    const existing = postsByDate.get(post.scheduled_date) ?? [];
    existing.push(post);
    postsByDate.set(post.scheduled_date, existing);
  }

  // ── Calendar grid math (all via Date.UTC) ──────────────────────────────────
  const firstDayOfWeek = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth    = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

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
    setSchedulingMode(false);
    setDrawerOpen(true);
  }
  function closeDrawer() {
    setDrawerOpen(false);
    setSchedulingMode(false);
  }

  // ── Scheduling form handlers ───────────────────────────────────────────────

  async function openSchedulingForm() {
    setFormStep(1);
    setSelectedClip(null);
    setClipSearch('');
    setSelectedPlatforms(new Set(DEFAULT_PLATFORMS));
    setPostTime('11:00 AM');
    setSubmitError(null);
    setSchedulingMode(true);
    try {
      const clips = await fetchAllClipDetails();
      setClipOptions(clips);
    } catch (err) {
      console.error('clip_details fetch error:', err);
    }
  }

  function cancelSchedulingForm() {
    setSchedulingMode(false);
  }

  function togglePlatform(p: Platform) {
    setSelectedPlatforms(prev => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  function startTimeEdit(post: ScheduledPost) {
    const stripped = post.post_time.replace(/\s*CT$/, '').trim();
    const matched = TIME_OPTIONS.includes(stripped) ? stripped : '11:00 AM';
    setEditingTimeValue(matched);
    setTimeEditError(null);
    setEditingTimeId(post.id);
  }

  async function handleTimeSave(id: string) {
    const newTime = `${editingTimeValue} CT`;
    console.log('[TimeSave] updating post id:', id, '→', newTime);
    setTimeEditError(null);
    try {
      const { error } = await supabase
        .from('scheduled_posts')
        .update({ post_time: newTime })
        .eq('id', id);
      if (error) {
        console.error('[TimeSave] Supabase error:', error);
        setTimeEditError(error.message);
        return;
      }
      console.log('[TimeSave] update succeeded');
      setPosts(prev => prev.map(p => p.id === id ? { ...p, post_time: newTime } : p));
      setEditingTimeId(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[TimeSave] exception:', err);
      setTimeEditError(msg);
    }
  }

  async function handleDeletePost(id: string) {
    await supabase.from('scheduled_posts').delete().eq('id', id);
    refetchPosts();
  }

  async function handleScheduleSubmit() {
    if (!selectedClip || selectedPlatforms.size === 0 || !selectedDate) return;
    setSubmitting(true);
    setSubmitError(null);

    const rows = Array.from(selectedPlatforms).map(platform => ({
      clip_code: selectedClip.clip_code,
      title: selectedClip.clip_code,
      platform,
      scheduled_date: selectedDate,
      post_time: `${postTime} CT`,
      status: 'scheduled',
    }));

    const { error } = await supabase.from('scheduled_posts').insert(rows);
    setSubmitting(false);

    if (error) {
      console.error('scheduled_posts insert error:', error);
      setSubmitError(error.message);
      return;
    }

    setSchedulingMode(false);
    refetchPosts();
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const selectedPosts = selectedDate ? (postsByDate.get(selectedDate) ?? []) : [];
  const displayDate   = selectedDate ? formatDisplayDate(selectedDate) : null;

  const filteredClips = clipOptions.filter(c =>
    clipSearch === '' ||
    c.clip_code.toLowerCase().includes(clipSearch.toLowerCase()) ||
    (c.title ?? '').toLowerCase().includes(clipSearch.toLowerCase())
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--text-2)] text-sm">
        Loading schedule…
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--text-2)] text-sm">
        Failed to load schedule.
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

      {/* ── Slide-in drawer ──────────────────────────────────────────────────── */}
      <div
        className={[
          'fixed inset-0 z-40 transition-opacity duration-200',
          drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        ].join(' ')}
      >
        {/* Backdrop */}
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
              {schedulingMode ? (
                <>
                  <p className="text-sm font-semibold text-[var(--text-1)]">Schedule a Post</p>
                  <p className="text-xs text-[var(--text-2)] mt-0.5">Step {formStep} of 3</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-[var(--text-1)]">
                    {displayDate?.full ?? ''}
                  </p>
                  <p className="text-xs text-[var(--text-2)] mt-0.5">
                    {displayDate?.weekday ?? ''}
                  </p>
                </>
              )}
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

            {schedulingMode ? (
              /* ── Scheduling form ── */
              <>
                {formStep === 1 && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-wider">Select Clip</p>

                    <input
                      type="text"
                      placeholder="Search clips…"
                      value={clipSearch}
                      onChange={e => setClipSearch(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-[var(--bg-base)] border border-[var(--border)] rounded-lg text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--gold-border)]"
                    />

                    <div className="max-h-40 overflow-y-auto rounded-lg border border-[var(--border)] divide-y divide-[var(--border)]">
                      {filteredClips.map(clip => (
                        <button
                          key={clip.clip_code}
                          onClick={() => setSelectedClip(clip)}
                          className={[
                            'w-full text-left px-3 py-2.5 text-xs transition-colors',
                            selectedClip?.clip_code === clip.clip_code
                              ? 'bg-[var(--gold-dim)] text-[var(--gold)]'
                              : 'text-[var(--text-1)] hover:bg-[var(--bg-hover)]',
                          ].join(' ')}
                        >
                          <span className="font-mono text-[10px] text-[var(--text-3)]">{clip.clip_details_code}</span>
                        </button>
                      ))}
                      {filteredClips.length === 0 && (
                        <p className="px-3 py-4 text-xs text-[var(--text-3)] text-center">No clips found</p>
                      )}
                    </div>

                    {selectedClip && (
                      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3 space-y-1.5">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-3)]">Preview</p>
                        {selectedClip.headline_banner && (
                          <p className="text-xs font-semibold text-[var(--text-1)] leading-snug">
                            {selectedClip.headline_banner}
                          </p>
                        )}
                        {selectedClip.question_banner && (
                          <p className="text-xs text-[var(--text-2)] leading-snug">
                            {selectedClip.question_banner}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={cancelSchedulingForm}
                        className="flex-1 py-2 text-xs text-[var(--text-2)] border border-[var(--border)] rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => setFormStep(2)}
                        disabled={!selectedClip}
                        className="flex-1 py-2 text-xs font-semibold text-[var(--bg-base)] bg-[var(--gold)] rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Next →
                      </button>
                    </div>
                  </div>
                )}

                {formStep === 2 && (
                  <div className="space-y-4">
                    <p className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-wider">Platforms</p>

                    <div className="space-y-2.5">
                      {ALL_PLATFORMS.map(p => (
                        <label key={p} className="flex items-center gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedPlatforms.has(p)}
                            onChange={() => togglePlatform(p)}
                            className="w-3.5 h-3.5 accent-[var(--gold)]"
                          />
                          <span className="flex items-center gap-1.5 text-xs text-[var(--text-1)]">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: PLATFORM_COLORS[p] }} />
                            {PLATFORM_LABELS[p]}
                          </span>
                        </label>
                      ))}
                    </div>

                    <div className="space-y-2 border-t border-[var(--border)] pt-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[var(--text-3)]">Date</span>
                        <span className="text-[var(--text-1)]">{displayDate?.full ?? ''}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[var(--text-3)]">Time</span>
                        <select
                          value={postTime}
                          onChange={e => setPostTime(e.target.value)}
                          className="px-2 py-1 text-xs bg-[var(--bg-base)] border border-[var(--border)] rounded-lg text-[var(--text-1)] focus:outline-none focus:border-[var(--gold-border)]"
                        >
                          {TIME_OPTIONS.map(t => (
                            <option key={t} value={t}>{t} CT</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => setFormStep(1)}
                        className="flex-1 py-2 text-xs text-[var(--text-2)] border border-[var(--border)] rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
                      >
                        ← Back
                      </button>
                      <button
                        onClick={() => setFormStep(3)}
                        disabled={selectedPlatforms.size === 0}
                        className="flex-1 py-2 text-xs font-semibold text-[var(--bg-base)] bg-[var(--gold)] rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Next →
                      </button>
                    </div>
                  </div>
                )}

                {formStep === 3 && (
                  <div className="space-y-4">
                    <p className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-wider">Confirm</p>

                    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3 space-y-2">
                      <p className="text-[10px] font-mono text-[var(--text-3)]">{selectedClip?.clip_code}</p>
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {Array.from(selectedPlatforms).map(p => (
                          <span
                            key={p}
                            className="px-2 py-0.5 rounded text-[10px] font-medium"
                            style={{ background: `${PLATFORM_COLORS[p]}22`, color: PLATFORM_COLORS[p] }}
                          >
                            {PLATFORM_LABELS[p]}
                          </span>
                        ))}
                      </div>
                      <p className="text-[11px] text-[var(--text-2)] pt-0.5">
                        {displayDate?.full} · {postTime} CT
                      </p>
                    </div>

                    {submitError && (
                      <p className="text-xs text-red-400">{submitError}</p>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={() => setFormStep(2)}
                        className="flex-1 py-2 text-xs text-[var(--text-2)] border border-[var(--border)] rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
                      >
                        ← Back
                      </button>
                      <button
                        onClick={handleScheduleSubmit}
                        disabled={submitting}
                        className="flex-1 py-2 text-xs font-semibold text-[var(--bg-base)] bg-[var(--gold)] rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40"
                      >
                        {submitting ? 'Scheduling…' : 'Schedule Post'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* ── Normal list view ── */
              <>
                {selectedPosts.length === 0 && (
                  <p className="text-sm text-[var(--text-2)] text-center py-6">
                    Nothing scheduled
                  </p>
                )}

                {selectedPosts.map(post => (
                  <div
                    key={post.id}
                    className="relative rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3 space-y-2"
                  >
                    <button
                      onClick={() => handleDeletePost(post.id)}
                      aria-label="Delete post"
                      className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded text-[var(--text-3)] hover:text-[var(--text-2)] hover:bg-[rgba(247,231,206,0.06)] transition-colors text-[10px] leading-none"
                    >
                      ✕
                    </button>
                    <div className="flex items-center justify-between pr-5">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-1)]">
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: PLATFORM_COLORS[post.platform] }}
                        />
                        {PLATFORM_LABELS[post.platform]}
                      </span>
                      {editingTimeId === post.id ? (
                        <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1">
                          <select
                            value={editingTimeValue}
                            onChange={e => setEditingTimeValue(e.target.value)}
                            className="px-1.5 py-0.5 text-[10px] bg-[var(--bg-base)] border border-[var(--border)] rounded text-[var(--text-1)] focus:outline-none focus:border-[var(--gold-border)]"
                          >
                            {TIME_OPTIONS.map(t => (
                              <option key={t} value={t}>{t} CT</option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleTimeSave(post.id)}
                            aria-label="Save time"
                            className="w-5 h-5 flex items-center justify-center rounded text-green-400 hover:bg-[rgba(247,231,206,0.06)] transition-colors text-[10px]"
                          >
                            ✓
                          </button>
                          <button
                            onClick={() => { setEditingTimeId(null); setTimeEditError(null); }}
                            aria-label="Cancel time edit"
                            className="w-5 h-5 flex items-center justify-center rounded text-[var(--text-3)] hover:bg-[rgba(247,231,206,0.06)] transition-colors text-[10px]"
                          >
                            ✕
                          </button>
                        </div>
                        {timeEditError && (
                          <p className="text-[9px] text-red-400">{timeEditError}</p>
                        )}
                        </div>
                      ) : (
                        <button
                          onClick={() => startTimeEdit(post)}
                          className="flex items-center gap-1 text-xs text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors group"
                        >
                          {post.post_time}
                          <span className="opacity-0 group-hover:opacity-60 text-[9px] transition-opacity">✎</span>
                        </button>
                      )}
                    </div>

                    <button
                      onClick={() => {
                        const minimalPost: UnifiedPost = {
                          id: post.id,
                          platform: SCHEDULE_TO_UNIFIED[post.platform],
                          title: post.title,
                          date: post.scheduled_date,
                          views: 0,
                          likes: 0,
                          comments: 0,
                          shares: 0,
                          saves: 0,
                          engagementRate: 0,
                        };
                        openModal(minimalPost, post.clip_code);
                      }}
                      className="text-left text-sm font-medium text-[var(--text-1)] leading-snug hover:text-[rgba(247,231,206,0.8)] transition-colors w-full"
                    >
                      {post.clip_code}
                    </button>

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

                <button
                  onClick={openSchedulingForm}
                  className="w-full py-2.5 text-xs text-[var(--text-2)] border border-dashed border-[var(--border)] rounded-lg hover:border-[var(--border-md)] hover:text-[var(--text-1)] transition-colors"
                >
                  + Schedule a post
                </button>
              </>
            )}

          </div>
        </div>
      </div>

    </div>
  );
}
