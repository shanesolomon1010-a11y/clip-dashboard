'use client';

import { useState } from 'react';
import { ScriptAnalysis } from '@/types/scriptAnalyzer';
import { saveScriptAnalysis } from '@/lib/db';
import ScriptInput from '@/components/ScriptAnalyzer/ScriptInput';
import PlatformScoreCard from '@/components/ScriptAnalyzer/PlatformScoreCard';

// SVG ring for overall score
function ScoreRing({ score }: { score: number }) {
  const r = 46;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <div className="relative flex items-center justify-center">
      <svg width="120" height="120" viewBox="0 0 120 120" className="-rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
        <circle
          cx="60" cy="60" r={r} fill="none"
          stroke="var(--gold)" strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-[28px] font-black text-[var(--gold)] tabular-nums leading-none">{score}</span>
        <span className="text-[9px] text-[var(--text-3)] uppercase tracking-widest mt-0.5">/ 100</span>
      </div>
    </div>
  );
}

const HOOK_COLORS: Record<string, string> = {
  weak:      'bg-red-500/15 text-red-400 border-red-500/25',
  moderate:  'bg-orange-500/10 text-orange-400 border-orange-500/20',
  strong:    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  excellent: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
};

const LENGTH_COLORS: Record<string, string> = {
  too_short: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  ideal:     'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  too_long:  'bg-orange-500/10 text-orange-400 border-orange-500/20',
};

const LENGTH_LABELS: Record<string, string> = {
  too_short: 'Too Short',
  ideal: 'Ideal Length',
  too_long: 'Too Long',
};

export default function ScriptAnalyzerView() {
  const [scriptText, setScriptText] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<ScriptAnalysis | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  async function handleAnalyze() {
    if (!scriptText.trim()) return;
    setLoading(true);
    setAnalysis(null);
    setSaved(false);
    setSaveError('');
    try {
      const res = await fetch('/api/analyze-script', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ script: scriptText }),
      });
      const data: ScriptAnalysis = await res.json();
      setAnalysis(data);
    } catch {
      // TODO: surface error state
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!analysis) return;
    setSaving(true);
    setSaveError('');
    try {
      await saveScriptAnalysis({
        script_text: scriptText,
        overall_score: analysis.overallScore,
        platform_scores: analysis.platformScores,
        platform_breakdowns: analysis.platformScores.map((p) => ({
          platform: p.platform,
          breakdown: p.breakdown,
        })),
        recommendations: analysis.platformScores.map((p) => ({
          platform: p.platform,
          recommendation: p.recommendation,
        })),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setSaveError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-8">
      {/* Page heading */}
      <div>
        <h1 className="text-[22px] font-bold text-[var(--text-1)] tracking-tight">Script Analyzer</h1>
        <p className="text-[13px] text-[var(--text-3)] mt-1">
          Paste your script or upload a video to get platform-specific scores based on each algorithm.
        </p>
      </div>

      {/* Script input */}
      <ScriptInput
        value={scriptText}
        onChange={setScriptText}
        onAnalyze={handleAnalyze}
        loading={loading}
      />

      {/* Analysis results */}
      {analysis && (
        <div className="space-y-8">
          {/* Overall score */}
          <div className="bg-[var(--bg-elevated)] border border-white/[0.06] rounded-xl p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
              <ScoreRing score={analysis.overallScore} />
              <div className="flex-1 space-y-3">
                <div>
                  <p className="text-[15px] font-bold text-[var(--text-1)]">Content Quality Score</p>
                  <p className="text-[11px] font-semibold text-[var(--gold)] uppercase tracking-widest mt-0.5">
                    Platform Independent
                  </p>
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-2">
                  <span className={`text-[11px] font-semibold px-2 py-1 rounded border ${HOOK_COLORS[analysis.hookRating]}`}>
                    Hook: {analysis.hookRating.charAt(0).toUpperCase() + analysis.hookRating.slice(1)}
                  </span>
                  <span className="text-[11px] font-semibold px-2 py-1 rounded border bg-white/[0.05] text-[var(--text-2)] border-white/10">
                    {analysis.estimatedDuration}
                  </span>
                  <span className={`text-[11px] font-semibold px-2 py-1 rounded border ${LENGTH_COLORS[analysis.scriptLength]}`}>
                    {LENGTH_LABELS[analysis.scriptLength]}
                  </span>
                  <span className={`text-[11px] font-semibold px-2 py-1 rounded border ${
                    analysis.ctaPresent
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-red-500/10 text-red-400 border-red-500/20'
                  }`}>
                    CTA: {analysis.ctaPresent ? 'Present' : 'Missing'}
                  </span>
                </div>

                <p className="text-[11px] text-[var(--text-3)] leading-relaxed">
                  This score reflects the quality of the content itself, not platform performance. See platform scores below.
                </p>
              </div>
            </div>
          </div>

          {/* Platform scores */}
          <div>
            <div className="mb-4">
              <h2 className="text-[15px] font-bold text-[var(--text-1)]">Platform Algorithm Scores</h2>
              <p className="text-[12px] text-[var(--text-3)] mt-0.5">
                Each score is calculated independently using that platform&apos;s specific algorithm signals.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
              {analysis.platformScores.map((ps) => (
                <PlatformScoreCard
                  key={ps.platform}
                  data={ps}
                />
              ))}
            </div>
          </div>

          {/* Save button */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving || saved}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-white/[0.10] bg-white/[0.04] text-[13px] font-semibold text-[var(--text-2)] hover:bg-white/[0.07] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {saving && <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />}
              {saved ? '✓ Analysis Saved' : saving ? 'Saving…' : 'Save Analysis'}
            </button>
            {saved && <span className="text-[12px] text-emerald-400">Saved to your history.</span>}
            {saveError && <span className="text-[12px] text-red-400">{saveError}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
