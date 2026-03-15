'use client';

import { useFilter } from '@/context/FilterContext';
import { DateRange, Platform, PLATFORM_LABELS } from '@/types';

const DATE_OPTIONS: { label: string; value: DateRange }[] = [
  { label: '1D',  value: '1d'  },
  { label: '7D',  value: '7d'  },
  { label: '30D', value: '30d' },
  { label: '90D', value: '90d' },
  { label: 'All', value: 'all' },
];

const ALL_PLATFORMS: Platform[] = ['tiktok', 'instagram', 'linkedin', 'twitter', 'youtube'];

interface Props {
  title: string;
  postCount: number;
}

export default function TopBar({ title, postCount }: Props) {
  const { dateRange, setDateRange, platform, setPlatform } = useFilter();

  return (
    <header className="h-14 shrink-0 bg-[var(--bg-base)] border-b border-white/[0.06] flex items-center gap-4 px-6">
      {/* Page title */}
      <h1 className="text-[17px] font-semibold text-[var(--text-1)] leading-none tracking-tight shrink-0">
        {title}
      </h1>

      {/* Date range pills */}
      <div className="flex items-center gap-1">
        {DATE_OPTIONS.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => setDateRange(value)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
              dateRange === value
                ? 'bg-[var(--gold)] text-black'
                : 'text-[var(--text-3)] hover:text-[var(--text-2)] hover:bg-white/[0.04]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Platform filter */}
      <select
        value={platform}
        onChange={(e) => setPlatform(e.target.value as Platform | 'all')}
        className="bg-white/[0.04] border border-white/[0.08] rounded-lg text-[11px] text-[var(--text-2)] px-2.5 py-1 outline-none hover:border-white/[0.14] focus:border-white/[0.18] transition-colors cursor-pointer"
      >
        <option value="all">All Platforms</option>
        {ALL_PLATFORMS.map((p) => (
          <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>
        ))}
      </select>

      <div className="ml-auto">
        <span className="text-[11px] text-[var(--text-3)] tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>
          {postCount} posts
        </span>
      </div>
    </header>
  );
}
