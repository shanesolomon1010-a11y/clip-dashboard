'use client';

interface MetricCardProps {
  label: string;
  value: string;
  sub?: string;
  delta?: { value: string; positive: boolean };
  icon: React.ReactNode;
  accent?: string;
}

export default function MetricCard({ label, value, sub, delta, icon, accent = '#d4922a' }: MetricCardProps) {
  return (
    <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl p-5 flex flex-col gap-4 hover:bg-[var(--bg-hover)] hover:border-white/[0.09] transition-all duration-200 group">
      {/* Label + icon */}
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[var(--text-3)] leading-none mt-0.5">
          {label}
        </span>
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 opacity-70 group-hover:opacity-100 transition-opacity"
          style={{ background: `${accent}12`, color: accent }}
        >
          {icon}
        </span>
      </div>

      {/* Value — Instrument Serif italic, the editorial signature */}
      <div>
        <p
          className="text-[2.15rem] text-[var(--text-1)] leading-none tracking-tight"
          style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}
        >
          {value}
        </p>
        {sub && (
          <p
            className="text-[10px] text-[var(--text-3)] mt-2 truncate"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {sub}
          </p>
        )}
      </div>

      {/* Delta */}
      {delta && (
        <div
          className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded w-fit ${
            delta.positive
              ? 'text-emerald-400 bg-emerald-500/08'
              : 'text-red-400 bg-red-500/08'
          }`}
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          <span>{delta.positive ? '↑' : '↓'}</span>
          {delta.value}
        </div>
      )}
    </div>
  );
}
