'use client';

import { useState, useRef, useMemo } from 'react';
import { DateRangeCalendar } from './DateRangeCalendar';

export type FilterPreset = '7d' | '30d' | 'all' | 'custom';
export interface CustomRange { start: string; end: string; }

interface DateFilterBarProps {
  preset: FilterPreset;
  customRange: CustomRange | null;
  onPresetChange: (preset: FilterPreset) => void;
  onCustomRange: (start: string, end: string) => void;
}

export function DateFilterBar({ preset, customRange, onPresetChange, onCustomRange }: DateFilterBarProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);

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
            containerRef={calendarRef}
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

export function useDateFilter(
  defaultPreset: FilterPreset = '30d',
  defaultCustomRange: CustomRange | null = null,
) {
  const [filterPreset, setFilterPreset] = useState<FilterPreset>(defaultPreset);
  const [customRange, setCustomRange] = useState<CustomRange | null>(defaultCustomRange);

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
