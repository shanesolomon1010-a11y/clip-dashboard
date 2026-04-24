'use client';

import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { getRecentAnalyses, PerformanceAnalysis } from '@/lib/insights-db';
import { formatNum } from '@/lib/utils';

function Spinner() {
  return (
    <div
      className="w-4 h-4 border-2 rounded-full animate-spin shrink-0"
      style={{ borderColor: 'rgba(255,68,68,0.3)', borderTopColor: '#FF4444' }}
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

export default function InsightsView() {
  const [loading, setLoading]               = useState(false);
  const [currentMarkdown, setCurrentMarkdown] = useState<string | null>(null);
  const [recentAnalyses, setRecentAnalyses]   = useState<PerformanceAnalysis[]>([]);
  const [analysesLoading, setAnalysesLoading] = useState(true);
  const [error, setError]                     = useState<string | null>(null);

  useEffect(() => {
    getRecentAnalyses(10)
      .then(setRecentAnalyses)
      .catch(() => {})
      .finally(() => setAnalysesLoading(false));
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

  return (
    <div className="p-5 space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-bold text-[var(--text-1)]">Performance Analyst</h1>
        <p className="text-[13px] text-[var(--text-3)] mt-1">
          AI-powered analysis of your YouTube Shorts — top clips, underperformers, traffic sources, audience insights, and actionable recommendations.
        </p>
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
