'use client';

import { useState, useRef, useEffect, useMemo } from 'react';

export type FilterPreset = '7d' | '30d' | 'all' | 'custom';
export interface CustomRange { start: string; end: string; }

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function DateRangeCalendar({
  initialStart,
  initialEnd,
  onApply,
  onClose,
}: {
  initialStart: string | null;
  initialEnd: string | null;
  onApply: (start: string, end: string) => void;
  onClose: () => void;
}) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [pickStart, setPickStart] = useState<string | null>(initialStart);
  const [pickEnd, setPickEnd] = useState<string | null>(initialEnd);
  const [hovered, setHovered] = useState<string | null>(null);

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }

  function handleDayClick(day: string) {
    if (!pickStart || pickEnd) {
      setPickStart(day);
      setPickEnd(null);
    } else if (day < pickStart) {
      setPickEnd(pickStart);
      setPickStart(day);
    } else {
      setPickEnd(day);
    }
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const startOffset = new Date(viewYear, viewMonth, 1).getDay();

  const cells: (string | null)[] = [
    ...Array<null>(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const d = String(i + 1).padStart(2, '0');
      const m = String(viewMonth + 1).padStart(2, '0');
      return `${viewYear}-${m}-${d}`;
    }),
  ];

  function isSelected(day: string) {
    return day === pickStart || day === pickEnd;
  }

  function isInRange(day: string) {
    const lo = pickStart;
    const hi = pickEnd ?? hovered;
    if (!lo || !hi) return false;
    const [a, b] = lo <= hi ? [lo, hi] : [hi, lo];
    return day > a && day < b;
  }

  return (
    <div className="absolute z-50 top-full mt-2 left-0 bg-[var(--bg-card)] border border-[rgba(247,231,206,0.1)] rounded-2xl shadow-2xl p-4 w-[280px]">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={prevMonth}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[rgba(247,231,206,0.06)] transition-colors text-base leading-none"
        >
          ‹
        </button>
        <span className="text-[13px] font-semibold text-[var(--text-1)]">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button
          onClick={nextMonth}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[rgba(247,231,206,0.06)] transition-colors text-base leading-none"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
          <div key={d} className="text-center text-[9px] font-semibold text-[var(--text-3)] py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (!day) return <div key={`blank-${i}`} />;
          const sel = isSelected(day);
          const inRange = isInRange(day);
          return (
            <button
              key={day}
              onClick={() => handleDayClick(day)}
              onMouseEnter={() => setHovered(day)}
              onMouseLeave={() => setHovered(null)}
              className="text-[11px] py-1.5 rounded transition-colors text-center leading-none"
              style={{
                background: sel ? 'var(--gold)' : inRange ? 'rgba(212,146,42,0.18)' : 'transparent',
                color: sel ? '#000' : inRange ? 'var(--gold)' : 'var(--text-2)',
                fontWeight: sel ? 700 : 400,
              }}
            >
              {parseInt(day.slice(-2), 10)}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-[rgba(247,231,206,0.06)]">
        <span className="text-[10px] text-[var(--text-3)] truncate max-w-[130px]">
          {pickStart && pickEnd
            ? `${pickStart} → ${pickEnd}`
            : pickStart
            ? `From ${pickStart}`
            : 'Click a start date'}
        </span>
        <div className="flex gap-1.5 shrink-0">
          <button
            onClick={onClose}
            className="text-[11px] text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors px-2 py-1 rounded"
          >
            Cancel
          </button>
          <button
            onClick={() => { if (pickStart && pickEnd) onApply(pickStart, pickEnd); }}
            disabled={!pickStart || !pickEnd}
            className="text-[11px] font-semibold text-[var(--gold)] border border-[var(--gold-border)] bg-[var(--gold-dim)] hover:bg-[rgba(212,146,42,0.12)] rounded-lg px-2.5 py-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

interface DateFilterBarProps {
  preset: FilterPreset;
  customRange: CustomRange | null;
  onPresetChange: (preset: FilterPreset) => void;
  onCustomRange: (start: string, end: string) => void;
}

export function DateFilterBar({ preset, customRange, onPresetChange, onCustomRange }: DateFilterBarProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (calendarRef.current && !calendarRef.current.contains(e.target as Node)) {
        setCalendarOpen(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {([
        { val: '7d', label: '7 Days' },
        { val: '30d', label: '30 Days' },
        { val: 'all', label: 'All Time' },
      ] as { val: FilterPreset; label: string }[]).map(({ val, label }) => (
        <button
          key={val}
          onClick={() => { onPresetChange(val); setCalendarOpen(false); }}
          className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all border"
          style={{
            background: preset === val ? 'var(--gold)' : 'rgba(247,231,206,0.04)',
            color: preset === val ? '#000' : 'var(--text-3)',
            borderColor: preset === val ? 'transparent' : 'rgba(247,231,206,0.08)',
          }}
        >
          {label}
        </button>
      ))}
      <div className="relative" ref={calendarRef}>
        <button
          onClick={() => setCalendarOpen((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border"
          style={{
            background: preset === 'custom' ? 'var(--gold)' : 'rgba(247,231,206,0.04)',
            color: preset === 'custom' ? '#000' : 'var(--text-3)',
            borderColor: preset === 'custom' ? 'transparent' : 'rgba(247,231,206,0.08)',
          }}
        >
          {preset === 'custom' && customRange
            ? `${customRange.start} → ${customRange.end}`
            : 'Custom Range'}
          <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {calendarOpen && (
          <DateRangeCalendar
            initialStart={customRange?.start ?? null}
            initialEnd={customRange?.end ?? null}
            onApply={(start, end) => {
              onCustomRange(start, end);
              onPresetChange('custom');
              setCalendarOpen(false);
            }}
            onClose={() => setCalendarOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

export function useDateFilter(defaultPreset: FilterPreset = '30d') {
  const [filterPreset, setFilterPreset] = useState<FilterPreset>(defaultPreset);
  const [customRange, setCustomRange] = useState<CustomRange | null>(null);

  const { filterStart, filterEnd } = useMemo(() => {
    if (filterPreset === 'all') return { filterStart: null, filterEnd: null };
    if (filterPreset === 'custom' && customRange) {
      return { filterStart: customRange.start, filterEnd: customRange.end };
    }
    const end = new Date();
    const start = new Date();
    if (filterPreset === '7d') start.setDate(start.getDate() - 7);
    else start.setDate(start.getDate() - 30);
    return {
      filterStart: start.toISOString().slice(0, 10),
      filterEnd: end.toISOString().slice(0, 10),
    };
  }, [filterPreset, customRange]);

  const filterLabel =
    filterPreset === '7d' ? 'Last 7 days' :
    filterPreset === '30d' ? 'Last 30 days' :
    filterPreset === 'custom' && customRange ? `${customRange.start} → ${customRange.end}` :
    'All time';

  return {
    filterPreset,
    setFilterPreset,
    customRange,
    setCustomRange,
    filterStart,
    filterEnd,
    filterLabel,
  };
}
