'use client';

import { useEffect, useState } from 'react';
import { IconSparkles } from '@/components/Icons';

interface ClipRef {
  clip_details_code: string;
  reason: string;
}

interface InsightsReport {
  summary: string;
  topPerformers: ClipRef[];
  underperformers: ClipRef[];
  retentionInsights: string;
  timingInsights: string;
  hookAnalysis: string;
  recommendations: string[];
}

const STORAGE_KEY = 'clip_studio_insights_report_v1';

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[rgba(247,231,206,0.05)]">
        <h3 className="text-[13px] font-semibold text-[var(--text-1)]">{title}</h3>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function ClipList({ items }: { items: ClipRef[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.clip_details_code} className="flex flex-col gap-0.5">
          <span className="text-[12px] font-semibold text-[var(--gold)] font-mono">
            {item.clip_details_code}
          </span>
          <span className="text-[12px] text-[var(--text-2)] leading-relaxed">{item.reason}</span>
        </li>
      ))}
    </ul>
  );
}

export default function InsightsView() {
  const [report, setReport] = useState<InsightsReport | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as { report: InsightsReport; generatedAt: string };
        setReport(parsed.report);
        setGeneratedAt(parsed.generatedAt);
      }
    } catch {
      // ignore corrupt localStorage
    }
  }, []);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/insights', { method: 'POST' });
      const data = await res.json() as InsightsReport & { error?: string };
      if (data.error) throw new Error(data.error);
      const ts = new Date().toISOString();
      setReport(data);
      setGeneratedAt(ts);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ report: data, generatedAt: ts }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  const formattedDate = generatedAt
    ? new Date(generatedAt).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold text-[var(--text-1)] leading-tight">Insights</h1>
          <p className="text-[13px] text-[var(--text-3)] mt-1">
            AI-powered video analysis and channel performance report
          </p>
          {formattedDate && !loading && (
            <p className="text-[11px] text-[var(--text-3)] mt-1">
              Last generated {formattedDate}
            </p>
          )}
        </div>
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="shrink-0 flex items-center gap-2 px-4 py-2 text-[13px] font-semibold text-[var(--gold)] border border-[var(--gold-border)] bg-[var(--gold-dim)] hover:bg-[rgba(212,146,42,0.12)] rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <IconSparkles className="w-4 h-4" />
          {loading ? 'Analyzing…' : report ? 'Regenerate Report' : 'Generate Insights Report'}
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl p-8 flex flex-col items-center gap-4">
          <div className="w-7 h-7 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
          <p className="text-[13px] text-[var(--text-2)]">
            Analyzing videos and data… this may take 1–2 minutes
          </p>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="bg-[rgba(239,68,68,0.06)] border border-[rgba(239,68,68,0.15)] rounded-2xl px-5 py-4">
          <p className="text-[13px] text-red-400">{error}</p>
        </div>
      )}

      {/* Report */}
      {report && !loading && (
        <div className="space-y-4">
          <Card title="Overview">
            <p className="text-[13px] text-[var(--text-2)] leading-relaxed">{report.summary}</p>
          </Card>

          <div className="grid grid-cols-2 gap-4">
            <Card title="Top Performers">
              <ClipList items={report.topPerformers} />
            </Card>
            <Card title="Underperformers">
              <ClipList items={report.underperformers} />
            </Card>
          </div>

          <Card title="Retention Insights">
            <p className="text-[13px] text-[var(--text-2)] leading-relaxed">{report.retentionInsights}</p>
          </Card>

          <Card title="Timing Insights">
            <p className="text-[13px] text-[var(--text-2)] leading-relaxed">{report.timingInsights}</p>
          </Card>

          <Card title="Hook Analysis">
            <p className="text-[13px] text-[var(--text-2)] leading-relaxed">{report.hookAnalysis}</p>
          </Card>

          <Card title="Recommendations">
            <ol className="space-y-2 list-none">
              {report.recommendations.map((rec, i) => (
                <li key={i} className="flex gap-3 items-start">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-[var(--gold-dim)] border border-[var(--gold-border)] text-[10px] font-bold text-[var(--gold)] flex items-center justify-center mt-px">
                    {i + 1}
                  </span>
                  <span className="text-[13px] text-[var(--text-2)] leading-relaxed">{rec}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      )}

      {/* Empty state */}
      {!report && !loading && !error && (
        <div className="bg-[var(--bg-card)] border border-[rgba(247,231,206,0.06)] rounded-2xl p-12 flex flex-col items-center gap-3 text-center">
          <IconSparkles className="w-8 h-8 text-[var(--text-3)]" />
          <p className="text-[14px] font-medium text-[var(--text-2)]">No report yet</p>
          <p className="text-[12px] text-[var(--text-3)] max-w-sm">
            Click &quot;Generate Insights Report&quot; to analyze your videos with Gemini and get a full performance breakdown from Claude.
          </p>
        </div>
      )}
    </div>
  );
}
