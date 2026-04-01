'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface DayData {
  stat_date: string;
  total_views: number;
  clip_count: number;
}

interface TooltipState {
  x: number;
  y: number;
  date: string;
  total_views: number;
  clip_count: number;
}

const PLATFORM_COLOR = '#FF4444';
const DOW_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function cellColor(total_views: number): string {
  if (total_views === 0) return '#1f2937';
  if (total_views < 100) return `${PLATFORM_COLOR}33`;
  if (total_views < 500) return `${PLATFORM_COLOR}80`;
  if (total_views < 1000) return `${PLATFORM_COLOR}BF`;
  return PLATFORM_COLOR;
}

function fmtDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

async function fetchHeatmapData(): Promise<DayData[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 60);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('posts')
    .select('stat_date, views, clip_code')
    .gte('stat_date', cutoffStr)
    .not('stat_date', 'is', null);

  if (error) throw error;

  const map: Record<string, { total_views: number; clips: Record<string, true> }> = {};
  for (const row of data ?? []) {
    const date = row.stat_date as string;
    if (!map[date]) map[date] = { total_views: 0, clips: {} };
    map[date].total_views += Number(row.views ?? 0);
    if (row.clip_code) map[date].clips[row.clip_code as string] = true;
  }

  return Object.entries(map)
    .map(([stat_date, { total_views, clips }]) => ({
      stat_date,
      total_views,
      clip_count: Object.keys(clips).length,
    }))
    .sort((a, b) => a.stat_date.localeCompare(b.stat_date));
}

export default function PostingHeatmap() {
  const [dayData, setDayData] = useState<DayData[]>([]);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchHeatmapData().then(setDayData).catch(() => setDayData([]));
  }, []);

  const { weeks, dataMap, todayStr } = useMemo(() => {
    const dataMap: Record<string, DayData> = {};
    for (const d of dayData) dataMap[d.stat_date] = d;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);

    // Start 60 days ago, aligned back to Monday
    const start = new Date(today);
    start.setDate(start.getDate() - 60);
    const dow = start.getDay(); // 0=Sun, 1=Mon…
    const daysToMon = dow === 0 ? 6 : dow - 1;
    start.setDate(start.getDate() - daysToMon);

    // Build all days from start through today
    const days: string[] = [];
    const cur = new Date(start);
    while (cur <= today) {
      days.push(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }

    // Group into weeks of 7
    const weeks: string[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
    }

    return { weeks, dataMap, todayStr };
  }, [dayData]);

  function weekMonthLabel(week: string[], wi: number): string | null {
    if (wi === 0) return MONTH_NAMES[parseInt(week[0].slice(5, 7), 10) - 1];
    for (const d of week) {
      if (d.slice(8, 10) === '01') {
        return MONTH_NAMES[parseInt(d.slice(5, 7), 10) - 1];
      }
    }
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl p-5 relative"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[15px] font-semibold text-[var(--text-1)]">Posting Cadence</h3>
        <span className="text-[11px] text-[var(--text-2)]">Last 60 days</span>
      </div>

      <div className="overflow-x-auto">
        {/* Day-of-week header */}
        <div className="flex mb-1.5">
          <div className="w-8 shrink-0" />
          {DOW_LABELS.map((label, i) => (
            <div
              key={i}
              className="w-8 text-center text-[10px] text-[var(--text-3)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Week rows */}
        {weeks.map((week, wi) => {
          const monthLabel = weekMonthLabel(week, wi);
          return (
            <div key={wi} className="flex items-center mb-1">
              {/* Month label column */}
              <div
                className="w-8 shrink-0 text-[9px] text-[var(--text-3)] leading-none select-none"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {monthLabel ?? ''}
              </div>

              {/* Day cells */}
              {week.map((dateStr) => {
                const data = dataMap[dateStr];
                const views = data?.total_views ?? 0;
                const isFuture = dateStr > todayStr;

                return (
                  <div
                    key={dateStr}
                    className="w-7 h-7 rounded-sm mr-1 flex-shrink-0 transition-opacity duration-150"
                    style={{
                      background: isFuture ? 'transparent' : cellColor(views),
                      opacity: isFuture ? 0 : 1,
                    }}
                    onMouseEnter={(e) => {
                      if (!data || isFuture) return;
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      const containerRect = containerRef.current?.getBoundingClientRect();
                      if (!containerRect) return;
                      setTooltip({
                        x: rect.left - containerRect.left + rect.width / 2,
                        y: rect.top - containerRect.top,
                        date: dateStr,
                        total_views: data.total_views,
                        clip_count: data.clip_count,
                      });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-50 pointer-events-none border border-[rgba(247,231,206,0.09)] rounded-xl shadow-2xl px-3 py-2 whitespace-nowrap"
          style={{
            background: '#1d1d1d',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            left: tooltip.x,
            top: tooltip.y - 68,
            transform: 'translateX(-50%)',
          }}
        >
          <p className="text-[var(--text-2)] mb-1">{fmtDisplayDate(tooltip.date)}</p>
          <p className="text-[var(--text-1)] font-semibold">{tooltip.total_views.toLocaleString()} views</p>
          <p className="text-[var(--text-3)]">{tooltip.clip_count} clip{tooltip.clip_count !== 1 ? 's' : ''}</p>
        </div>
      )}
    </div>
  );
}
