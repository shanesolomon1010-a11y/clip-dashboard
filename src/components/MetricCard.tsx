'use client';

interface MetricCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent?: string;
}

export default function MetricCard({ label, value, sub, icon, accent = '#6366f1' }: MetricCardProps) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-gray-500">{label}</span>
        <span
          className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
          style={{ background: `${accent}22`, color: accent }}
        >
          {icon}
        </span>
      </div>
      <p className="text-3xl font-bold text-white leading-none">{value}</p>
      {sub && <p className="text-xs text-gray-500 truncate">{sub}</p>}
    </div>
  );
}
