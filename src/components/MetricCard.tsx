'use client';

interface MetricCardProps {
  label: string;
  value: string;
  sub?: string;
  delta?: { value: string; positive: boolean };
  icon: React.ReactNode;
  accent?: string;
}

export default function MetricCard({ label, value, sub, delta, icon, accent = '#6366f1' }: MetricCardProps) {
  return (
    <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl p-5 flex flex-col gap-3 hover:border-white/[0.1] transition-colors">
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-gray-500 leading-none mt-0.5 tracking-wide uppercase">{label}</span>
        <span
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${accent}18`, color: accent }}
        >
          {icon}
        </span>
      </div>

      {/* Value */}
      <div>
        <p className="text-3xl font-bold text-white leading-none tracking-tight">{value}</p>
        {sub && <p className="text-[11px] text-gray-600 mt-1.5 truncate">{sub}</p>}
      </div>

      {/* Optional delta */}
      {delta && (
        <div className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-lg w-fit ${
          delta.positive
            ? 'text-emerald-400 bg-emerald-500/10'
            : 'text-red-400 bg-red-500/10'
        }`}>
          <span>{delta.positive ? '↑' : '↓'}</span>
          {delta.value}
        </div>
      )}
    </div>
  );
}
