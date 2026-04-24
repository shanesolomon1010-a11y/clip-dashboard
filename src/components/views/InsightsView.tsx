'use client';

import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  getRecentAnalyses,
  PerformanceAnalysis,
  getLatestWeeklyReport,
  getRecentWeeklyReports,
  WeeklyReport,
  getLatestScheduleRecommendation,
  ScheduleRecommendation,
} from '@/lib/insights-db';
import { formatNum } from '@/lib/utils';

function Spinner({ color = '#FF4444' }: { color?: string }) {
  return (
    <div
      className="w-4 h-4 border-2 rounded-full animate-spin shrink-0"
      style={{ borderColor: 'rgba(255,68,68,0.3)', borderTopColor: color }}
    />
  );
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        h2: ({ children }) => (
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-3)] mt-6 mb-2 pb-1.5 border-b border-[rgba(247,231,206,0.06)]">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-[13px] font-semibold text-[var(--text-1)] mt-3 mb-1">{children}</h3>
        ),
        p: ({ children }) => (
          <p className="text-[13px] text-[var(--text-2)] leading-relaxed mb-3">{children}</p>
        ),
        ul: ({ children }) => (
          <ul className="mb-3 pl-1 space-y-1">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-3 pl-4 space-y-1 list-decimal">{children}</ol>
        ),
        li: ({ children }) => (
          <li className="text-[13px] text-[var(--text-2)] leading-relaxed flex gap-2">
            <span className="text-[var(--text-3)] shrink-0 mt-0.5">–</span>
            <span>{children}</span>
          </li>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-[var(--text-1)]">{children}</strong>
        ),
        code: ({ children }) => (
          <code
            className="text-[11px] px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(247,231,206,0.06)', color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}
          >
            {children}
          </code>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function relativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const hours = diffMs / 3_600_000;
  if (hours < 1) return 'just now';
  if (hours < 24) return `${Math.floor(hours)} hours ago`;
  const days = diffMs / 86_400_000;
  if (days < 7) return `${Math.floor(days)} days ago`;
  return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function AnalysisCard({
  analysis,
  defaultOpen = false,
}: {
  analysis: PerformanceAnalysis;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const date = new Date(analysis.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <div className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-[rgba(247,231,206,0.02)] transition-colors text-left gap-4"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-[13px] font-semibold text-[var(--text-1)] shrink-0">{date}</span>
          {analysis.tokens_used != null && (
            <span
              className="text-[10px] text-[var(--text-3)] px-2 py-0.5 rounded-full shrink-0"
              style={{ background: 'rgba(247,231,206,0.05)' }}
            >
              {formatNum(analysis.tokens_used)} tokens
            </span>
          )}
          {analysis.input_summary && (
            <span className="text-[10px] text-[var(--text-3)] truncate">
              {(analysis.input_summary as { total_clips?: number; total_views?: number }).total_clips} clips ·{' '}
              {formatNum((analysis.input_summary as { total_clips?: number; total_views?: number }).total_views ?? 0)} views
            </span>
          )}
        </div>
        <svg
          className="w-4 h-4 text-[var(--text-3)] transition-transform shrink-0"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-5 pb-6 border-t border-[rgba(247,231,206,0.04)]">
          <div className="mt-4">
            <MarkdownContent content={analysis.analysis_markdown} />
          </div>
        </div>
      )}
    </div>
  );
}

function WeeklyReportCard({ report }: { report: WeeklyReport }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-[rgba(247,231,206,0.02)] transition-colors text-left gap-4"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-[13px] font-semibold text-[var(--text-1)] shrink-0">
            Week of {report.week_start} – {report.week_end}
          </span>
          {report.tokens_used != null && (
            <span
              className="text-[10px] text-[var(--text-3)] px-2 py-0.5 rounded-full shrink-0"
              style={{ background: 'rgba(247,231,206,0.05)' }}
            >
              {formatNum(report.tokens_used)} tokens
            </span>
          )}
          <span className="text-[10px] text-[var(--text-3)] shrink-0">
            {relativeTime(report.created_at)}
          </span>
        </div>
        <svg
          className="w-4 h-4 text-[var(--text-3)] transition-transform shrink-0"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-5 pb-6 border-t border-[rgba(247,231,206,0.04)]">
          <div className="mt-4">
            <MarkdownContent content={report.report_markdown} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function InsightsView() {
  const [loading, setLoading]               = useState(false);
  const [currentMarkdown, setCurrentMarkdown] = useState<string | null>(null);
  const [recentAnalyses, setRecentAnalyses]   = useState<PerformanceAnalysis[]>([]);
  const [analysesLoading, setAnalysesLoading] = useState(true);
  const [error, setError]                     = useState<string | null>(null);

  const [latestWeeklyReport, setLatestWeeklyReport]   = useState<WeeklyReport | null>(null);
  const [recentWeeklyReports, setRecentWeeklyReports] = useState<WeeklyReport[]>([]);
  const [weeklyLoading, setWeeklyLoading]             = useState(true);
  const [weeklyGenerating, setWeeklyGenerating]       = useState(false);
  const [weeklyError, setWeeklyError]                 = useState<string | null>(null);

  const [scheduleRec, setScheduleRec]               = useState<ScheduleRecommendation | null>(null);
  const [scheduleLoading, setScheduleLoading]       = useState(true);
  const [scheduleGenerating, setScheduleGenerating] = useState(false);
  const [scheduleError, setScheduleError]           = useState<string | null>(null);
  const [slotDetailOpen, setSlotDetailOpen]         = useState(false);

  useEffect(() => {
    Promise.all([
      getRecentAnalyses(10),
      getLatestWeeklyReport(),
      getRecentWeeklyReports(8),
      getLatestScheduleRecommendation(),
    ])
      .then(([analyses, latest, recent, schedule]) => {
        setRecentAnalyses(analyses);
        setLatestWeeklyReport(latest);
        setRecentWeeklyReports(recent);
        setScheduleRec(schedule);
      })
      .catch(() => {})
      .finally(() => {
        setAnalysesLoading(false);
        setWeeklyLoading(false);
        setScheduleLoading(false);
      });
  }, []);

  async function handleAnalyze() {
    setLoading(true);
    setError(null);
    setCurrentMarkdown(null);

    try {
      const res = await fetch('/api/insights/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dashboard-secret': process.env.NEXT_PUBLIC_DASHBOARD_SECRET ?? '',
        },
      });

      const data = await res.json() as {
        markdown?: string;
        error?: string;
        analysisId?: number;
        tokensUsed?: number;
      };

      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      setCurrentMarkdown(data.markdown ?? '');

      if (data.analysisId) {
        const fresh: PerformanceAnalysis = {
          id:                data.analysisId,
          platform:          'youtube',
          date_range_start:  '',
          date_range_end:    '',
          analysis_markdown: data.markdown ?? '',
          input_summary:     null,
          model_used:        'claude-sonnet-4-20250514',
          tokens_used:       data.tokensUsed ?? null,
          created_at:        new Date().toISOString(),
        };
        setRecentAnalyses(prev => [fresh, ...prev]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateWeekly() {
    setWeeklyGenerating(true);
    setWeeklyError(null);
    try {
      const res = await fetch('/api/insights/weekly-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dashboard-secret': process.env.NEXT_PUBLIC_DASHBOARD_SECRET ?? '',
        },
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const [latest, recent] = await Promise.all([
        getLatestWeeklyReport(),
        getRecentWeeklyReports(8),
      ]);
      setLatestWeeklyReport(latest);
      setRecentWeeklyReports(recent);
    } catch (err) {
      setWeeklyError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setWeeklyGenerating(false);
    }
  }

  async function handleAnalyzeSchedule() {
    setScheduleGenerating(true);
    setScheduleError(null);
    try {
      const res = await fetch('/api/insights/schedule-optimizer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dashboard-secret': process.env.NEXT_PUBLIC_DASHBOARD_SECRET ?? '',
        },
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const fresh = await getLatestScheduleRecommendation();
      setScheduleRec(fresh);
      setSlotDetailOpen(false);
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setScheduleGenerating(false);
    }
  }

  return (
    <div className="p-5 space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-bold text-[var(--text-1)]">Performance Analyst</h1>
        <p className="text-[13px] text-[var(--text-3)] mt-1">
          AI-powered analysis of your YouTube Shorts — top clips, underperformers, traffic sources, audience insights, and actionable recommendations.
        </p>
      </div>

      {/* Weekly Report */}
      {weeklyLoading ? (
        <div className="flex items-center gap-2 py-4 text-[12px] text-[var(--text-3)]">
          <Spinner />
          <span>Loading weekly report…</span>
        </div>
      ) : latestWeeklyReport ? (
        <>
          <div
            className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl px-6 py-5"
            style={{ borderLeft: '3px solid #4AA3DF' }}
          >
            <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
              <div>
                <p className="text-[13px] font-semibold text-[var(--text-1)]">Weekly Report</p>
                <p className="text-[11px] text-[var(--text-3)] mt-0.5">
                  Week of {latestWeeklyReport.week_start} to {latestWeeklyReport.week_end}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-[11px] text-[var(--text-3)]">
                  Generated {relativeTime(latestWeeklyReport.created_at)}
                  {latestWeeklyReport.triggered_by ? ` via ${latestWeeklyReport.triggered_by}` : ''}
                </span>
                <button
                  onClick={handleGenerateWeekly}
                  disabled={weeklyGenerating}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{ background: 'rgba(74,163,223,0.15)', color: '#4AA3DF', border: '1px solid rgba(74,163,223,0.3)' }}
                >
                  {weeklyGenerating && <Spinner color="#4AA3DF" />}
                  {weeklyGenerating ? 'Generating…' : 'Generate new'}
                </button>
              </div>
            </div>
            <MarkdownContent content={latestWeeklyReport.report_markdown} />
            {weeklyError && (
              <div
                className="mt-4 px-4 py-3 rounded-xl text-[12px]"
                style={{ background: 'rgba(255,68,68,0.08)', color: '#FF6B6B', border: '1px solid rgba(255,68,68,0.2)' }}
              >
                {weeklyError}
              </div>
            )}
          </div>

          {recentWeeklyReports.length > 1 && (
            <div>
              <h2 className="text-[13px] font-semibold text-[var(--text-1)] mb-3">Previous Weekly Reports</h2>
              <div className="space-y-2">
                {recentWeeklyReports.slice(1).map(r => (
                  <WeeklyReportCard key={r.id} report={r} />
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div
          className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl px-6 py-5"
          style={{ borderLeft: '3px solid #4AA3DF' }}
        >
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[13px] font-semibold text-[var(--text-1)] mb-1">Weekly Report</p>
              <p className="text-[12px] text-[var(--text-3)]">
                No weekly report yet. The first one will generate Monday morning, or click Generate to create one now.
              </p>
            </div>
            <button
              onClick={handleGenerateWeekly}
              disabled={weeklyGenerating}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-semibold transition-all shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ background: 'rgba(74,163,223,0.15)', color: '#4AA3DF', border: '1px solid rgba(74,163,223,0.3)' }}
            >
              {weeklyGenerating && <Spinner color="#4AA3DF" />}
              {weeklyGenerating ? 'Generating…' : 'Generate'}
            </button>
          </div>
          {weeklyError && (
            <div
              className="mt-4 px-4 py-3 rounded-xl text-[12px]"
              style={{ background: 'rgba(255,68,68,0.08)', color: '#FF6B6B', border: '1px solid rgba(255,68,68,0.2)' }}
            >
              {weeklyError}
            </div>
          )}
        </div>
      )}

      {/* Schedule Optimizer */}
      <div
        className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl"
        style={{ borderLeft: '3px solid #4ADE80' }}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap px-6 py-5">
          <div>
            <p className="text-[13px] font-semibold text-[var(--text-1)]">Posting Schedule Optimizer</p>
            <p className="text-[12px] text-[var(--text-3)] mt-0.5">
              Data-driven recommendation based on historical slot performance
            </p>
          </div>
          <button
            onClick={handleAnalyzeSchedule}
            disabled={scheduleGenerating}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-semibold transition-all shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: 'rgba(74,222,128,0.15)', color: '#4ADE80', border: '1px solid rgba(74,222,128,0.3)' }}
          >
            {scheduleGenerating && <Spinner color="#4ADE80" />}
            {scheduleGenerating ? 'Analyzing ~60 days of posts…' : 'Analyze Schedule'}
          </button>
        </div>

        {scheduleError && (
          <div
            className="mx-6 mb-4 px-4 py-3 rounded-xl text-[12px]"
            style={{ background: 'rgba(255,68,68,0.08)', color: '#FF6B6B', border: '1px solid rgba(255,68,68,0.2)' }}
          >
            {scheduleError}
          </div>
        )}

        {scheduleLoading ? (
          <div className="flex items-center gap-2 px-6 pb-5 text-[12px] text-[var(--text-3)]">
            <Spinner />
            <span>Loading…</span>
          </div>
        ) : scheduleRec ? (
          <>
            {/* Recommended schedule */}
            <div className="px-6 pb-5 border-t border-[rgba(247,231,206,0.04)] pt-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-3)] mb-3">
                Recommended Schedule
              </p>
              <div className="space-y-1">
                {scheduleRec.recommended_schedule.map(row => {
                  const conf =
                    row.reason.includes('strong')   ? 'high'   :
                    row.reason.includes('moderate') ? 'medium' :
                    row.reason.includes('limited')  ? 'low'    : null;
                  const dotColor =
                    conf === 'high'   ? '#4ADE80' :
                    conf === 'medium' ? '#FACC15' : '#6B7280';
                  return (
                    <div
                      key={row.day}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg"
                      style={{ background: 'rgba(247,231,206,0.03)' }}
                    >
                      <span className="text-[12px] font-semibold text-[var(--text-1)] w-9 shrink-0">{row.day}</span>
                      {row.hour_bucket !== '—' ? (
                        <>
                          <span
                            className="text-[11px] font-medium px-2 py-0.5 rounded shrink-0"
                            style={{ background: 'rgba(74,222,128,0.1)', color: '#4ADE80' }}
                          >
                            {row.hour_bucket}
                          </span>
                          <span className="text-[11px] text-[var(--text-3)] flex-1 min-w-0">{row.reason}</span>
                        </>
                      ) : (
                        <span className="text-[11px] text-[var(--text-3)] italic flex-1">{row.reason}</span>
                      )}
                      {conf && (
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Collapsible detailed slot table */}
            <div className="border-t border-[rgba(247,231,206,0.04)]">
              <button
                onClick={() => setSlotDetailOpen(v => !v)}
                className="w-full flex items-center justify-between px-6 py-3 hover:bg-[rgba(247,231,206,0.02)] transition-colors text-left"
              >
                <span className="text-[11px] text-[var(--text-3)]">
                  Detailed slot performance ({scheduleRec.slot_analysis.length} slots)
                </span>
                <svg
                  className="w-4 h-4 text-[var(--text-3)] transition-transform shrink-0"
                  style={{ transform: slotDetailOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {slotDetailOpen && (
                <div className="px-6 pb-5 overflow-x-auto">
                  <div className="min-w-[480px] space-y-1">
                    <div className="grid grid-cols-[64px_90px_48px_80px_80px_64px] gap-2 px-2 pb-1">
                      {['Day', 'Slot', 'Posts', 'Avg Views', 'Med Views', 'Confidence'].map(h => (
                        <span key={h} className="text-[10px] text-[var(--text-3)] uppercase tracking-wider">{h}</span>
                      ))}
                    </div>
                    {(scheduleRec.slot_analysis as Array<{
                      day_of_week: string;
                      hour_bucket: string;
                      post_count: number;
                      avg_views: number;
                      median_views: number;
                      confidence: string;
                    }>).map((slot, i) => (
                      <div
                        key={i}
                        className="grid grid-cols-[64px_90px_48px_80px_80px_64px] gap-2 items-center px-2 py-1.5 rounded"
                        style={{ background: 'rgba(247,231,206,0.02)' }}
                      >
                        <span className="text-[11px] text-[var(--text-2)]">{slot.day_of_week}</span>
                        <span className="text-[11px] text-[var(--text-2)]">{slot.hour_bucket}</span>
                        <span className="text-[11px] text-[var(--text-2)]">{slot.post_count}</span>
                        <span className="text-[11px] font-medium text-[var(--text-1)]">{slot.avg_views.toLocaleString()}</span>
                        <span className="text-[11px] text-[var(--text-2)]">{slot.median_views.toLocaleString()}</span>
                        <span
                          className="text-[11px] font-medium"
                          style={{
                            color: slot.confidence === 'high'   ? '#4ADE80' :
                                   slot.confidence === 'medium' ? '#FACC15' : '#6B7280',
                          }}
                        >
                          {slot.confidence}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Claude narrative */}
            {scheduleRec.narrative_markdown && (
              <div className="px-6 pb-6 pt-4 border-t border-[rgba(247,231,206,0.04)]">
                <MarkdownContent content={scheduleRec.narrative_markdown} />
              </div>
            )}
          </>
        ) : (
          <div className="px-6 pb-5">
            <p className="text-[12px] text-[var(--text-3)]">
              No schedule analysis yet. Click Analyze Schedule to see your optimal posting times.
            </p>
          </div>
        )}
      </div>

      {/* Trigger card */}
      <div className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-[var(--text-1)] mb-1">Run New Analysis</p>
            <p className="text-[12px] text-[var(--text-3)]">
              Pulls the last 30 days of posts, breakdowns, and posting schedule. Usually takes 20–30 seconds.
            </p>
          </div>
          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold transition-all shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: '#FF4444', color: '#fff' }}
          >
            {loading && <Spinner />}
            {loading ? 'Analyzing…' : 'Analyze My Performance'}
          </button>
        </div>

        {loading && (
          <div className="mt-4 space-y-2">
            <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(247,231,206,0.06)' }}>
              <div
                className="h-full rounded-full"
                style={{ width: '65%', background: 'linear-gradient(90deg, #FF4444, #FF8C42)', opacity: 0.6 }}
              />
            </div>
            <p className="text-[11px] text-[var(--text-3)]">Contacting Claude… this usually takes 20–30 seconds.</p>
          </div>
        )}

        {error && (
          <div
            className="mt-4 px-4 py-3 rounded-xl text-[12px]"
            style={{ background: 'rgba(255,68,68,0.08)', color: '#FF6B6B', border: '1px solid rgba(255,68,68,0.2)' }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Current analysis result */}
      {currentMarkdown && (
        <div
          className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl px-6 py-5"
          style={{ borderLeft: '3px solid #FF4444' }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-3)] mb-4">
            Latest Analysis
          </p>
          <MarkdownContent content={currentMarkdown} />
        </div>
      )}

      {/* Recent analyses */}
      <div>
        <h2 className="text-[13px] font-semibold text-[var(--text-1)] mb-3">Recent Analyses</h2>
        {analysesLoading ? (
          <div className="flex items-center gap-2 py-4 text-[12px] text-[var(--text-3)]">
            <Spinner />
            <span>Loading…</span>
          </div>
        ) : recentAnalyses.length === 0 ? (
          <p className="text-[12px] text-[var(--text-3)] py-4">
            No analyses yet. Run your first one above.
          </p>
        ) : (
          <div className="space-y-2">
            {recentAnalyses.map((a) => (
              <AnalysisCard key={a.id} analysis={a} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
