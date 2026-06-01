'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type Status = 'green' | 'yellow' | 'red';

interface FreshnessCheck {
  timestamp: string | null;
  hours_ago: number | null;
  status: Status;
}

interface StatDateCheck {
  date: string | null;
  days_ago: number | null;
  status: Status;
}

interface DriftPerClip {
  clip_details_code: string;
  days_with_drift: number;
  max_pct_delta: number;
  posts_views_sum: number;
  studio_views_sum: number;
  status: Status;
}

interface DiagnosticsData {
  thresholds: {
    drift_pct_red: number;
    drift_pct_yellow: number;
    freshness_hours_red: number;
    freshness_hours_yellow: number;
    drift_window_days: number;
  };
  cron_health: {
    last_youtube_sync_short: FreshnessCheck;
    last_youtube_sync_longform: FreshnessCheck;
  };
  data_freshness: {
    posts_short_latest_stat: StatDateCheck;
    posts_longform_latest_stat: StatDateCheck;
  };
  schema_integrity: {
    posts_null_content_id_count: number;
    posts_null_clip_details_code_short_count: number;
    studio_snapshots_null_clip_details_code_count: number;
    posts_orphaned_rows: number;
    status: Status;
  };
  internal_consistency: {
    longform_views_displayed: number;
    longform_views_recomputed: number;
    longform_views_delta: number;
    shorts_views_displayed: number;
    shorts_views_recomputed: number;
    shorts_views_delta: number;
    longform_watch_displayed: number;
    longform_watch_recomputed: number;
    longform_watch_delta: number;
    shorts_watch_displayed: number;
    shorts_watch_recomputed: number;
    shorts_watch_delta: number;
    status: Status;
    error?: string;
  };
  drift_check: {
    window_days: number;
    total_rows_compared: number;
    rows_with_drift: number;
    drift_pct_overall: number;
    by_clip: DriftPerClip[];
    status: Status;
  };
  coverage: {
    posts_distinct_clips_7d: number;
    studio_snapshots_distinct_clips_7d: number;
    clips_in_posts_missing_from_studio: string[];
    clips_in_studio_missing_from_posts: string[];
    status: Status;
  };
  generated_at: string;
}

interface Thresholds {
  drift_pct_red: number;
  drift_pct_yellow: number;
  freshness_hours_red: number;
  freshness_hours_yellow: number;
  drift_window_days: number;
}

const DEFAULT_THRESHOLDS: Thresholds = {
  drift_pct_red: 10,
  drift_pct_yellow: 5,
  freshness_hours_red: 24,
  freshness_hours_yellow: 12,
  drift_window_days: 7,
};

const STORAGE_KEY = 'diagnostics_thresholds';

function loadThresholds(): Thresholds {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_THRESHOLDS;
    const parsed = JSON.parse(raw) as Partial<Thresholds>;
    return {
      drift_pct_red: typeof parsed.drift_pct_red === 'number' ? parsed.drift_pct_red : DEFAULT_THRESHOLDS.drift_pct_red,
      drift_pct_yellow: typeof parsed.drift_pct_yellow === 'number' ? parsed.drift_pct_yellow : DEFAULT_THRESHOLDS.drift_pct_yellow,
      freshness_hours_red: typeof parsed.freshness_hours_red === 'number' ? parsed.freshness_hours_red : DEFAULT_THRESHOLDS.freshness_hours_red,
      freshness_hours_yellow: typeof parsed.freshness_hours_yellow === 'number' ? parsed.freshness_hours_yellow : DEFAULT_THRESHOLDS.freshness_hours_yellow,
      drift_window_days: typeof parsed.drift_window_days === 'number' ? parsed.drift_window_days : DEFAULT_THRESHOLDS.drift_window_days,
    };
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

function StatusDot({ status, size = 'md' }: { status: Status; size?: 'sm' | 'md' | 'lg' }) {
  const color = status === 'green' ? '#4ade80' : status === 'yellow' ? '#facc15' : '#f87171';
  const bg = status === 'green' ? 'rgba(74,222,128,0.15)' : status === 'yellow' ? 'rgba(250,204,21,0.15)' : 'rgba(248,113,113,0.15)';
  const px = size === 'sm' ? 8 : size === 'lg' ? 14 : 10;
  return (
    <span
      className="inline-block rounded-full"
      style={{ width: px, height: px, background: color, boxShadow: `0 0 0 4px ${bg}` }}
    />
  );
}

function StatusPill({ status }: { status: Status }) {
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  const color = status === 'green' ? '#4ade80' : status === 'yellow' ? '#facc15' : '#f87171';
  const bg = status === 'green' ? 'rgba(74,222,128,0.12)' : status === 'yellow' ? 'rgba(250,204,21,0.12)' : 'rgba(248,113,113,0.12)';
  return (
    <span
      className="text-[11px] font-semibold px-2.5 py-1 rounded-lg inline-flex items-center gap-1.5"
      style={{ background: bg, color }}
    >
      <StatusDot status={status} size="sm" />
      {label}
    </span>
  );
}

function CardShell({
  title,
  status,
  headline,
  fullWidth,
  children,
}: {
  title: string;
  status: Status;
  headline: string;
  fullWidth?: boolean;
  children?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl overflow-hidden ${fullWidth ? 'col-span-1 md:col-span-2' : ''}`}>
      <div className="px-5 py-4 border-b border-[rgba(247,231,206,0.05)] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <StatusDot status={status} size="lg" />
          <h3 className="text-[13px] font-semibold text-[var(--text-1)]">{title}</h3>
        </div>
        <StatusPill status={status} />
      </div>
      <div className="px-5 py-4 space-y-3">
        <p className="text-sm text-[var(--text-2)]">{headline}</p>
        {children && (
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="text-[11px] text-[var(--text-3)] hover:text-[var(--gold)] transition-colors"
          >
            {expanded ? 'Hide details' : 'Show details'}
          </button>
        )}
        {expanded && children}
      </div>
    </div>
  );
}

function fmtNumber(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString();
}

function fmtSigned(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return '0';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toLocaleString()}`;
}

function fmtHoursAgo(h: number | null): string {
  if (h === null || !Number.isFinite(h)) return 'never';
  if (h < 1) return 'just now';
  if (h < 24) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export default function DiagnosticsView() {
  const [thresholds, setThresholds] = useState<Thresholds>(DEFAULT_THRESHOLDS);
  const [thresholdsOpen, setThresholdsOpen] = useState(false);
  const [data, setData] = useState<DiagnosticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [driftWindowOverride, setDriftWindowOverride] = useState<number | null>(null);
  const [driftFilterOnly, setDriftFilterOnly] = useState(false);

  // Load saved thresholds on first mount.
  useEffect(() => {
    setThresholds(loadThresholds());
  }, []);

  const fetchData = useCallback(async (t: Thresholds, windowOverride?: number | null) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        drift_pct_red: String(t.drift_pct_red),
        drift_pct_yellow: String(t.drift_pct_yellow),
        freshness_hours_red: String(t.freshness_hours_red),
        freshness_hours_yellow: String(t.freshness_hours_yellow),
        drift_window_days: String(windowOverride ?? t.drift_window_days),
      });
      const res = await fetch(`/api/diagnostics?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const body = (await res.json()) as DiagnosticsData;
      setData(body);
      setLastRefreshed(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + refetch whenever thresholds or window override changes.
  useEffect(() => {
    void fetchData(thresholds, driftWindowOverride);
  }, [thresholds, driftWindowOverride, fetchData]);

  const handleSaveThresholds = (next: Thresholds) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setThresholds(next);
  };

  const handleResetThresholds = () => {
    localStorage.removeItem(STORAGE_KEY);
    setThresholds(DEFAULT_THRESHOLDS);
  };

  const handleExport = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diagnostics-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const driftRows = useMemo(() => {
    if (!data) return [];
    const rows = data.drift_check.by_clip;
    return driftFilterOnly ? rows.filter(r => r.status !== 'green') : rows;
  }, [data, driftFilterOnly]);

  return (
    <div className="space-y-5">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-[var(--text-1)] tracking-tight">Diagnostics</h3>
          <p className="text-xs text-[var(--text-3)]">
            Data health, internal consistency, and drift detection between API and Studio sources.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastRefreshed && (
            <p className="text-[11px] text-[var(--text-3)]">Last refreshed: {lastRefreshed}</p>
          )}
          <button
            type="button"
            onClick={() => void fetchData(thresholds, driftWindowOverride)}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-semibold text-[var(--text-2)] bg-[rgba(247,231,206,0.04)] border border-[rgba(247,231,206,0.08)] rounded-xl hover:bg-[rgba(247,231,206,0.07)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={!data}
            className="px-3 py-1.5 text-xs font-semibold text-[var(--text-2)] bg-[rgba(247,231,206,0.04)] border border-[rgba(247,231,206,0.08)] rounded-xl hover:bg-[rgba(247,231,206,0.07)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Export JSON
          </button>
        </div>
      </div>

      {/* Threshold config */}
      <div className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setThresholdsOpen(v => !v)}
          className="w-full px-5 py-3 flex items-center justify-between hover:bg-[rgba(247,231,206,0.02)] transition-colors"
        >
          <span className="text-[13px] font-semibold text-[var(--text-1)]">Thresholds</span>
          <span className="text-[11px] text-[var(--text-3)]">{thresholdsOpen ? 'Hide' : 'Configure'}</span>
        </button>
        {thresholdsOpen && (
          <ThresholdEditor
            current={thresholds}
            onSave={handleSaveThresholds}
            onReset={handleResetThresholds}
          />
        )}
      </div>

      {error && (
        <div className="px-4 py-3 text-xs text-red-400 bg-[rgba(248,113,113,0.08)] border border-[rgba(248,113,113,0.15)] rounded-xl">
          {error}
        </div>
      )}

      {!data && !error && (
        <div className="px-4 py-3 text-xs text-[var(--text-3)] bg-[rgba(247,231,206,0.02)] border border-[rgba(247,231,206,0.06)] rounded-xl">
          {loading ? 'Loading diagnostics…' : 'No data yet.'}
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 1. Cron health */}
          <CardShell
            title="Cron Health"
            status={worstFreshness(data.cron_health)}
            headline={`Last Shorts sync: ${fmtHoursAgo(data.cron_health.last_youtube_sync_short.hours_ago)}`}
          >
            <div className="space-y-2 text-xs">
              <FreshnessRow label="YouTube Shorts sync" check={data.cron_health.last_youtube_sync_short} />
              <FreshnessRow label="YouTube long-form sync" check={data.cron_health.last_youtube_sync_longform} />
            </div>
          </CardShell>

          {/* 2. Data freshness */}
          <CardShell
            title="Data Freshness"
            status={worstStatDate(data.data_freshness)}
            headline={`Latest Shorts stat: ${data.data_freshness.posts_short_latest_stat.date ?? '—'} (${data.data_freshness.posts_short_latest_stat.days_ago ?? '—'}d ago)`}
          >
            <div className="space-y-2 text-xs">
              <StatDateRow label="posts (Shorts) latest stat_date" check={data.data_freshness.posts_short_latest_stat} />
              <StatDateRow label="posts (long-form) latest stat_date" check={data.data_freshness.posts_longform_latest_stat} />
            </div>
          </CardShell>

          {/* 3. Schema integrity */}
          <CardShell
            title="Schema Integrity"
            status={data.schema_integrity.status}
            headline={
              data.schema_integrity.posts_orphaned_rows === 0 &&
              data.schema_integrity.posts_null_content_id_count === 0 &&
              data.schema_integrity.posts_null_clip_details_code_short_count === 0 &&
              data.schema_integrity.studio_snapshots_null_clip_details_code_count === 0
                ? 'All identifier columns populated.'
                : 'Null or orphaned rows detected.'
            }
          >
            <div className="space-y-2 text-xs">
              <KeyValueRow label="posts.content_id IS NULL" value={fmtNumber(data.schema_integrity.posts_null_content_id_count)} />
              <KeyValueRow label="posts.clip_details_code IS NULL (Shorts)" value={fmtNumber(data.schema_integrity.posts_null_clip_details_code_short_count)} />
              <KeyValueRow label="studio_snapshots.clip_details_code IS NULL" value={fmtNumber(data.schema_integrity.studio_snapshots_null_clip_details_code_count)} />
              <KeyValueRow label="posts orphaned (no clip_details match)" value={fmtNumber(data.schema_integrity.posts_orphaned_rows)} />
            </div>
          </CardShell>

          {/* 4. Internal consistency */}
          <CardShell
            title="Internal Consistency (Founder Report 30d)"
            status={data.internal_consistency.status}
            headline={
              data.internal_consistency.error
                ? `Error: ${data.internal_consistency.error}`
                : data.internal_consistency.status === 'green'
                  ? 'Founder Report aggregates match a fresh recompute.'
                  : 'Founder Report aggregates DIVERGE from a fresh recompute.'
            }
          >
            <div className="text-xs">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[rgba(247,231,206,0.05)]">
                    <th className="text-left py-2 font-semibold text-[var(--text-3)]">Metric</th>
                    <th className="text-right py-2 font-semibold text-[var(--text-3)]">Displayed</th>
                    <th className="text-right py-2 font-semibold text-[var(--text-3)]">Recomputed</th>
                    <th className="text-right py-2 font-semibold text-[var(--text-3)]">Δ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(247,231,206,0.04)]">
                  <ConsistencyRow label="Long-form views" displayed={data.internal_consistency.longform_views_displayed} recomputed={data.internal_consistency.longform_views_recomputed} delta={data.internal_consistency.longform_views_delta} />
                  <ConsistencyRow label="Shorts views" displayed={data.internal_consistency.shorts_views_displayed} recomputed={data.internal_consistency.shorts_views_recomputed} delta={data.internal_consistency.shorts_views_delta} />
                  <ConsistencyRow label="Long-form watch (h)" displayed={data.internal_consistency.longform_watch_displayed} recomputed={data.internal_consistency.longform_watch_recomputed} delta={data.internal_consistency.longform_watch_delta} />
                  <ConsistencyRow label="Shorts watch (h)" displayed={data.internal_consistency.shorts_watch_displayed} recomputed={data.internal_consistency.shorts_watch_recomputed} delta={data.internal_consistency.shorts_watch_delta} />
                </tbody>
              </table>
            </div>
          </CardShell>

          {/* 6. Coverage */}
          <CardShell
            title="Coverage (last 7d)"
            status={data.coverage.status}
            headline={`posts: ${data.coverage.posts_distinct_clips_7d} clips · studio_snapshots: ${data.coverage.studio_snapshots_distinct_clips_7d} clips`}
          >
            <div className="space-y-3 text-xs">
              <div>
                <p className="text-[var(--text-3)] mb-1">In posts but missing from studio_snapshots ({data.coverage.clips_in_posts_missing_from_studio.length})</p>
                {data.coverage.clips_in_posts_missing_from_studio.length === 0 ? (
                  <p className="text-[var(--text-3)]">—</p>
                ) : (
                  <p className="font-mono text-[var(--text-2)] break-words">{data.coverage.clips_in_posts_missing_from_studio.join(', ')}</p>
                )}
              </div>
              <div>
                <p className="text-[var(--text-3)] mb-1">In studio_snapshots but missing from posts ({data.coverage.clips_in_studio_missing_from_posts.length})</p>
                {data.coverage.clips_in_studio_missing_from_posts.length === 0 ? (
                  <p className="text-[var(--text-3)]">—</p>
                ) : (
                  <p className="font-mono text-[var(--text-2)] break-words">{data.coverage.clips_in_studio_missing_from_posts.join(', ')}</p>
                )}
              </div>
            </div>
          </CardShell>

          {/* 5. Drift check — full width, last */}
          <CardShell
            title={`Drift Check (${data.drift_check.window_days}d window)`}
            status={data.drift_check.status}
            headline={`${data.drift_check.rows_with_drift}/${data.drift_check.total_rows_compared} rows with drift · overall avg ${data.drift_check.drift_pct_overall.toFixed(2)}%`}
            fullWidth
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setDriftWindowOverride(driftWindowOverride === 30 ? null : 30)}
                    className="text-[11px] font-semibold px-3 py-1.5 rounded-xl bg-[rgba(247,231,206,0.04)] border border-[rgba(247,231,206,0.08)] text-[var(--text-2)] hover:bg-[rgba(247,231,206,0.07)] transition-all"
                  >
                    {driftWindowOverride === 30 ? `Reset to ${thresholds.drift_window_days}d` : '30-day view'}
                  </button>
                  <label className="flex items-center gap-2 text-[11px] text-[var(--text-3)]">
                    <input
                      type="checkbox"
                      checked={driftFilterOnly}
                      onChange={e => setDriftFilterOnly(e.target.checked)}
                    />
                    Only show clips with drift
                  </label>
                </div>
                <p className="text-[11px] text-[var(--text-3)]">
                  Yellow ≥ {thresholds.drift_pct_yellow}% · Red ≥ {thresholds.drift_pct_red}%
                </p>
              </div>
              <DriftTable rows={driftRows} />
            </div>
          </CardShell>
        </div>
      )}
    </div>
  );
}

function ThresholdEditor({
  current,
  onSave,
  onReset,
}: {
  current: Thresholds;
  onSave: (next: Thresholds) => void;
  onReset: () => void;
}) {
  const [draft, setDraft] = useState<Thresholds>(current);

  useEffect(() => {
    setDraft(current);
  }, [current]);

  const setField = (key: keyof Thresholds, value: string) => {
    const n = Number(value);
    setDraft(prev => ({ ...prev, [key]: Number.isFinite(n) ? n : prev[key] }));
  };

  return (
    <div className="px-5 py-4 border-t border-[rgba(247,231,206,0.05)] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <ThresholdField label="Drift % (red)" value={draft.drift_pct_red} min={0} max={100} step={0.5} onChange={v => setField('drift_pct_red', v)} />
      <ThresholdField label="Drift % (yellow)" value={draft.drift_pct_yellow} min={0} max={100} step={0.5} onChange={v => setField('drift_pct_yellow', v)} />
      <ThresholdField label="Freshness hours (red)" value={draft.freshness_hours_red} min={1} max={168} step={1} onChange={v => setField('freshness_hours_red', v)} />
      <ThresholdField label="Freshness hours (yellow)" value={draft.freshness_hours_yellow} min={1} max={168} step={1} onChange={v => setField('freshness_hours_yellow', v)} />
      <ThresholdField label="Drift window (days)" value={draft.drift_window_days} min={1} max={90} step={1} onChange={v => setField('drift_window_days', v)} />
      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={() => onSave(draft)}
          className="px-4 py-2 text-xs font-semibold text-[var(--bg-base)] bg-[var(--gold)] rounded-xl hover:opacity-90 transition-opacity"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onReset}
          className="px-4 py-2 text-xs font-semibold text-[var(--text-2)] bg-[rgba(247,231,206,0.04)] border border-[rgba(247,231,206,0.08)] rounded-xl hover:bg-[rgba(247,231,206,0.07)] transition-all"
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
}

function ThresholdField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] text-[var(--text-3)]">{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 text-xs bg-[var(--bg-base)] border border-[rgba(247,231,206,0.10)] rounded-xl text-[var(--text-1)] focus:outline-none focus:border-[var(--gold-border)]"
      />
    </div>
  );
}

function FreshnessRow({ label, check }: { label: string; check: FreshnessCheck }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[var(--text-2)]">{label}</span>
      <span className="flex items-center gap-2">
        <span className="text-[var(--text-3)]">{fmtHoursAgo(check.hours_ago)}</span>
        <StatusDot status={check.status} size="sm" />
      </span>
    </div>
  );
}

function StatDateRow({ label, check }: { label: string; check: StatDateCheck }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[var(--text-2)]">{label}</span>
      <span className="flex items-center gap-2">
        <span className="text-[var(--text-3)]">
          {check.date ?? '—'}{check.days_ago !== null ? ` (${check.days_ago}d)` : ''}
        </span>
        <StatusDot status={check.status} size="sm" />
      </span>
    </div>
  );
}

function KeyValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[var(--text-2)]">{label}</span>
      <span className="font-mono text-[var(--text-3)]">{value}</span>
    </div>
  );
}

function ConsistencyRow({
  label,
  displayed,
  recomputed,
  delta,
}: {
  label: string;
  displayed: number;
  recomputed: number;
  delta: number;
}) {
  const deltaColor = Math.abs(delta) > 0.0001 ? '#f87171' : 'var(--text-3)';
  return (
    <tr>
      <td className="py-2 text-[var(--text-2)]">{label}</td>
      <td className="py-2 text-right font-mono text-[var(--text-2)]">{fmtNumber(displayed)}</td>
      <td className="py-2 text-right font-mono text-[var(--text-2)]">{fmtNumber(recomputed)}</td>
      <td className="py-2 text-right font-mono" style={{ color: deltaColor }}>{fmtSigned(delta)}</td>
    </tr>
  );
}

type DriftSortKey = 'clip_details_code' | 'days_with_drift' | 'max_pct_delta' | 'posts_views_sum' | 'studio_views_sum' | 'status';

function DriftTable({ rows }: { rows: DriftPerClip[] }) {
  const [sortKey, setSortKey] = useState<DriftSortKey>('max_pct_delta');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    const copy = [...rows];
    const statusRank: Record<Status, number> = { red: 2, yellow: 1, green: 0 };
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'clip_details_code') {
        cmp = a.clip_details_code.localeCompare(b.clip_details_code);
      } else if (sortKey === 'status') {
        cmp = statusRank[a.status] - statusRank[b.status];
      } else {
        cmp = (a[sortKey] as number) - (b[sortKey] as number);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const setSort = (key: DriftSortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'clip_details_code' ? 'asc' : 'desc');
    }
  };

  if (rows.length === 0) {
    return <p className="text-xs text-[var(--text-3)]">No clips in window.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[rgba(247,231,206,0.05)]">
            <SortHeader label="Clip Code" col="clip_details_code" current={sortKey} dir={sortDir} onClick={setSort} align="left" />
            <SortHeader label="Days with Drift" col="days_with_drift" current={sortKey} dir={sortDir} onClick={setSort} align="right" />
            <SortHeader label="Max % Δ" col="max_pct_delta" current={sortKey} dir={sortDir} onClick={setSort} align="right" />
            <SortHeader label="Posts Views" col="posts_views_sum" current={sortKey} dir={sortDir} onClick={setSort} align="right" />
            <SortHeader label="Studio Views" col="studio_views_sum" current={sortKey} dir={sortDir} onClick={setSort} align="right" />
            <SortHeader label="Status" col="status" current={sortKey} dir={sortDir} onClick={setSort} align="right" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgba(247,231,206,0.04)]">
          {sorted.map(r => (
            <tr key={r.clip_details_code} className="hover:bg-[rgba(247,231,206,0.02)] transition-colors">
              <td className="py-2 font-mono text-[var(--text-2)]">{r.clip_details_code}</td>
              <td className="py-2 text-right font-mono text-[var(--text-2)]">{r.days_with_drift}</td>
              <td className="py-2 text-right font-mono text-[var(--text-2)]">{r.max_pct_delta.toFixed(2)}%</td>
              <td className="py-2 text-right font-mono text-[var(--text-2)]">{fmtNumber(r.posts_views_sum)}</td>
              <td className="py-2 text-right font-mono text-[var(--text-2)]">{fmtNumber(r.studio_views_sum)}</td>
              <td className="py-2 text-right"><StatusDot status={r.status} size="sm" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SortHeader({
  label,
  col,
  current,
  dir,
  onClick,
  align,
}: {
  label: string;
  col: DriftSortKey;
  current: DriftSortKey;
  dir: 'asc' | 'desc';
  onClick: (k: DriftSortKey) => void;
  align: 'left' | 'right';
}) {
  const arrow = current === col ? (dir === 'asc' ? '↑' : '↓') : '';
  return (
    <th className={`py-2 ${align === 'right' ? 'text-right' : 'text-left'} text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-wider`}>
      <button type="button" onClick={() => onClick(col)} className="hover:text-[var(--gold)] transition-colors">
        {label} {arrow}
      </button>
    </th>
  );
}

function worstFreshness(c: DiagnosticsData['cron_health']): Status {
  return worstOf(c.last_youtube_sync_short.status, c.last_youtube_sync_longform.status);
}

function worstStatDate(c: DiagnosticsData['data_freshness']): Status {
  return worstOf(c.posts_short_latest_stat.status, c.posts_longform_latest_stat.status);
}

function worstOf(...statuses: Status[]): Status {
  if (statuses.includes('red')) return 'red';
  if (statuses.includes('yellow')) return 'yellow';
  return 'green';
}
