'use client';

import { useEffect, useRef, useState, type RefObject, type ChangeEvent } from 'react';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const YEAR_OPTIONS: number[] = (() => {
  const max = new Date().getFullYear() + 1;
  const arr: number[] = [];
  for (let y = 2023; y <= max; y++) arr.push(y);
  return arr;
})();

function parseYMDToYearMonth(ymd: string | null): { year: number; month: number } | null {
  if (!ymd) return null;
  const parts = ymd.split('-');
  if (parts.length < 2) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  return { year: y, month: m - 1 };
}

interface DateRangeCalendarProps {
  initialStart: string | null;
  initialEnd: string | null;
  onApply: (start: string, end: string) => void;
  onClose: () => void;
  containerRef?: RefObject<HTMLElement | null>;
}

export function DateRangeCalendar({
  initialStart,
  initialEnd,
  onApply,
  onClose,
  containerRef,
}: DateRangeCalendarProps) {
  const now = new Date();
  const seed = parseYMDToYearMonth(initialStart) ?? { year: now.getFullYear(), month: now.getMonth() };
  const [viewYear, setViewYear] = useState(seed.year);
  const [viewMonth, setViewMonth] = useState(seed.month);
  const [pickStart, setPickStart] = useState<string | null>(initialStart);
  const [pickEnd, setPickEnd] = useState<string | null>(initialEnd);
  const [hovered, setHovered] = useState<string | null>(null);

  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!containerRef) return;
    function handleMouseDown(e: MouseEvent) {
      const node = containerRef?.current;
      if (node && !node.contains(e.target as Node)) {
        onCloseRef.current();
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [containerRef]);

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }

  function handleMonthSelect(e: ChangeEvent<HTMLSelectElement>) {
    setViewMonth(parseInt(e.target.value, 10));
  }

  function handleYearSelect(e: ChangeEvent<HTMLSelectElement>) {
    setViewYear(parseInt(e.target.value, 10));
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
      <div className="flex items-center justify-between mb-3 gap-1.5">
        <button
          onClick={prevMonth}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[rgba(247,231,206,0.06)] transition-colors text-base leading-none shrink-0"
        >
          ‹
        </button>
        <div className="flex items-center gap-1 flex-1 justify-center">
          <select
            value={viewMonth}
            onChange={handleMonthSelect}
            className="bg-[rgba(247,231,206,0.04)] border border-[rgba(247,231,206,0.08)] text-[var(--text-1)] text-[12px] font-semibold rounded px-1.5 py-0.5 cursor-pointer focus:outline-none focus:border-[var(--gold-border)]"
          >
            {MONTH_NAMES.map((m, i) => (
              <option key={m} value={i}>{m}</option>
            ))}
          </select>
          <select
            value={viewYear}
            onChange={handleYearSelect}
            className="bg-[rgba(247,231,206,0.04)] border border-[rgba(247,231,206,0.08)] text-[var(--text-1)] text-[12px] font-semibold rounded px-1.5 py-0.5 cursor-pointer focus:outline-none focus:border-[var(--gold-border)]"
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <button
          onClick={nextMonth}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[rgba(247,231,206,0.06)] transition-colors text-base leading-none shrink-0"
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
