'use client';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onAnalyze: () => void;
  loading: boolean;
}

export default function ScriptInput({ value, onChange, onAnalyze, loading }: Props) {
  return (
    <div className="space-y-3">
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Paste your script here…"
          className="w-full min-h-[200px] bg-[var(--bg-elevated)] border border-[rgba(247,231,206,0.08)] rounded-xl px-4 py-3 text-[14px] text-[var(--text-1)] placeholder:text-[var(--text-3)] resize-y focus:outline-none focus:border-[rgba(247,231,206,0.40)] transition-colors leading-relaxed"
          disabled={loading}
        />
        <span className="absolute bottom-3 right-3 text-[11px] text-[var(--text-3)] tabular-nums pointer-events-none">
          {value.length.toLocaleString()} chars
        </span>
      </div>

      <button
        onClick={onAnalyze}
        disabled={loading || value.trim().length === 0}
        className="flex items-center gap-2.5 px-5 py-2.5 rounded-lg bg-[var(--gold)] text-[var(--bg-base)] text-[13px] font-semibold hover:bg-[var(--gold)]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
      >
        {loading ? (
          <>
            <span className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin shrink-0" />
            Analyzing across 5 platform algorithms…
          </>
        ) : (
          'Analyze Script'
        )}
      </button>
    </div>
  );
}
