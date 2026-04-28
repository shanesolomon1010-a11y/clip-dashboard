'use client';

import { useEffect, useRef, useState } from 'react';
import { IconWarning } from '@/components/Icons';

interface FounderReportData {
  longFormsPublished: number;
  shortsPublished: number;
  newSubscribers: number;
  longFormViews: number;
  shortsViews: number;
  longFormWatchTimeHours: number;
  shortsWatchTimeHours: number;
  windowDays: number;
  lastDataDate: string | null;
  generatedAt: string;
  _validation?: { warnings: string[] };
}

interface FounderReportResponse extends Partial<FounderReportData> {
  error?: string;
}

type FilterPreset = '7d' | '30d' | 'all' | 'custom';

const MBM_ERA_START = '2025-01-01';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function presetRange(preset: Exclude<FilterPreset, 'custom'>): { start: string; end: string } {
  const now = new Date();
  const end = toYMD(now);
  if (preset === 'all') return { start: MBM_ERA_START, end };
  const days = preset === '7d' ? 7 : 30;
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  return { start: toYMD(start), end };
}

function formatLongDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${d}, ${y}`;
}

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

function SkeletonCard() {
  return (
    <div className="bg-[var(--bg-card)] border border-white/[0.05] rounded-2xl p-6 animate-pulse">
      <div className="h-9 w-24 rounded-lg bg-white/[0.06] mb-3" />
      <div className="h-3.5 w-36 rounded bg-white/[0.04]" />
    </div>
  );
}

interface MetricCardProps {
  value: number;
  label: string;
  suffix?: string;
}

function MetricCard({ value, label, suffix = '' }: MetricCardProps) {
  const formatted = value % 1 === 0
    ? value.toLocaleString()
    : value.toFixed(1);

  return (
    <div className="bg-[var(--bg-card)] border border-white/[0.05] rounded-2xl p-6">
      <p className="text-[36px] font-bold text-[var(--text-1)] leading-none tabular-nums">
        {formatted}{suffix}
      </p>
      <p className="text-[13px] text-[var(--text-3)] mt-2">{label}</p>
    </div>
  );
}

export default function FounderReportView() {
  const [filterPreset, setFilterPreset] = useState<FilterPreset>('30d');
  const [customRange, setCustomRange] = useState<{ start: string; end: string } | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);

  const [data, setData] = useState<FounderReportData | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const activeRange = filterPreset === 'custom' && customRange
    ? customRange
    : presetRange(filterPreset === 'custom' ? '30d' : filterPreset);

  useEffect(() => {
    if (filterPreset === 'custom' && !customRange) return;

    setLoading(true);
    setError(null);
    setData(null);
    setWarnings([]);

    const url = `/api/founder-report?startDate=${activeRange.start}&endDate=${activeRange.end}`;
    fetch(url)
      .then((r) => r.json() as Promise<FounderReportResponse>)
      .then((json) => {
        if (json.error) {
          setError(json.error);
        } else {
          setData(json as FounderReportData);
          setWarnings(json._validation?.warnings ?? []);
          setLastUpdated(new Date());
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      })
      .finally(() => setLoading(false));
  }, [filterPreset, customRange, activeRange.start, activeRange.end]);

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[22px] font-bold text-[var(--text-1)] leading-tight">
          Founder Report
        </h1>
        <p className="text-[13px] text-[var(--text-3)] mt-1">
          Channel-level performance for stakeholder reporting
        </p>
      </div>

      {/* Date filter bar — matches AnalyticsView pattern */}
      <div className="flex items-center gap-1.5 flex-wrap mb-8">
        {([
          { val: '7d',  label: '7 Days' },
          { val: '30d', label: '30 Days' },
          { val: 'all', label: 'All Time' },
        ] as { val: FilterPreset; label: string }[]).map(({ val, label }) => (
          <button
            key={val}
            onClick={() => { setFilterPreset(val); setCalendarOpen(false); }}
            className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all border"
            style={{
              background: filterPreset === val ? 'var(--gold)' : 'rgba(247,231,206,0.04)',
              color: filterPreset === val ? '#000' : 'var(--text-3)',
              borderColor: filterPreset === val ? 'transparent' : 'rgba(247,231,206,0.08)',
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
              background: filterPreset === 'custom' ? 'var(--gold)' : 'rgba(247,231,206,0.04)',
              color: filterPreset === 'custom' ? '#000' : 'var(--text-3)',
              borderColor: filterPreset === 'custom' ? 'transparent' : 'rgba(247,231,206,0.08)',
            }}
          >
            {filterPreset === 'custom' && customRange
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
                setCustomRange({ start, end });
                setFilterPreset('custom');
                setCalendarOpen(false);
              }}
              onClose={() => setCalendarOpen(false)}
            />
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-[13px] text-red-400">
          {error}
        </div>
      )}

      {/* Metric grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {warnings.length > 0 && (
          <div className="col-span-full px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-center gap-2 mb-2">
              <IconWarning className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-[12px] font-semibold text-amber-400">Data validation warnings:</span>
            </div>
            <ul className="space-y-1 pl-5">
              {warnings.map((w, i) => (
                <li key={i} className="text-[12px] text-amber-400/80 list-disc">{w}</li>
              ))}
            </ul>
          </div>
        )}

        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : data ? (
          <>
            <MetricCard value={data.longFormsPublished}     label="YouTube Long Forms Published" />
            <MetricCard value={data.shortsPublished}        label="YouTube Shorts Published" />
            <MetricCard value={data.newSubscribers}         label="New Subscribers" />
            <MetricCard value={data.longFormViews}          label="Long-form Views" />
            <MetricCard value={data.shortsViews}            label="Shorts Views" />
            <MetricCard value={data.longFormWatchTimeHours} label="Long-form Watch Time" suffix=" hrs" />
            <MetricCard value={data.shortsWatchTimeHours}   label="Shorts Watch Time" suffix=" hrs" />
          </>
        ) : null}
      </div>

      {/* Footer */}
      {!loading && data && (
        <div className="mt-6 space-y-1">
          {data.lastDataDate && (
            <p className="text-[11px] text-[var(--text-3)]">
              Data current through {formatLongDate(data.lastDataDate)}
            </p>
          )}
          {lastUpdated && (
            <p className="text-[11px] text-[var(--text-3)]">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
