'use client';

import { useEffect, useState } from 'react';

interface FounderReportData {
  longFormsPublished: number;
  shortsPublished: number;
  newSubscribers: number;
  longFormWatchTimeHours: number;
  shortsWatchTimeHours: number;
  windowDays: number;
  generatedAt: string;
}

interface FounderReportResponse extends Partial<FounderReportData> {
  error?: string;
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
  const [selectedWindow, setSelectedWindow] = useState<7 | 30>(7);
  const [data, setData] = useState<FounderReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setData(null);

    fetch(`/api/founder-report?window=${selectedWindow}`)
      .then((r) => r.json() as Promise<FounderReportResponse>)
      .then((json) => {
        if (json.error) {
          setError(json.error);
        } else {
          setData(json as FounderReportData);
          setLastUpdated(new Date());
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      })
      .finally(() => setLoading(false));
  }, [selectedWindow]);

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

      {/* Window toggle */}
      <div className="flex gap-1 mb-8">
        {([7, 30] as const).map((w) => (
          <button
            key={w}
            onClick={() => setSelectedWindow(w)}
            className="px-4 py-1.5 rounded-lg text-[13px] font-medium border transition-all"
            style={{
              background: selectedWindow === w ? 'var(--gold)' : 'rgba(247,231,206,0.04)',
              color: selectedWindow === w ? '#000' : 'var(--text-3)',
              borderColor: selectedWindow === w ? 'transparent' : 'rgba(247,231,206,0.08)',
            }}
          >
            {w} Days
          </button>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-[13px] text-red-400">
          {error}
        </div>
      )}

      {/* Metric grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : data ? (
          <>
            <MetricCard value={data.longFormsPublished}      label="YouTube Long Forms Published" />
            <MetricCard value={data.shortsPublished}         label="YouTube Shorts Published" />
            <MetricCard value={data.newSubscribers}          label="New Subscribers" />
            <MetricCard value={data.longFormWatchTimeHours}  label="Long-form Watch Time" suffix=" hrs" />
            <MetricCard value={data.shortsWatchTimeHours}    label="Shorts Watch Time" suffix=" hrs" />
          </>
        ) : null}
      </div>

      {/* Footer */}
      {lastUpdated && !loading && (
        <p className="mt-6 text-[11px] text-[var(--text-3)]">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
