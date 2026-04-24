'use client';

import { useState, useEffect } from 'react';
import { getBreakdownTotals } from '@/lib/breakdowns-db';

export default function DemographicsNotice() {
  const [hasData, setHasData] = useState<boolean | null>(null);

  useEffect(() => {
    getBreakdownTotals('ageGroupGender', 'youtube', undefined, undefined, true)
      .then(rows => setHasData(rows.length > 0))
      .catch(() => setHasData(false));
  }, []);

  if (!hasData) return null;

  return (
    <div
      className="flex items-center justify-between gap-4 rounded-xl px-4 py-3"
      style={{
        background: 'rgba(6,214,160,0.07)',
        border: '1px solid rgba(6,214,160,0.2)',
      }}
    >
      <div className="flex items-center gap-2.5">
        <span style={{ color: '#06D6A0', fontSize: 14 }}>◆</span>
        <span className="text-[12px] text-[var(--text-2)]">
          Demographics data available — your channel has crossed YouTube&apos;s privacy threshold.
        </span>
      </div>
      <button
        className="text-[11px] font-semibold shrink-0 px-3 py-1 rounded-lg transition-colors"
        style={{
          color: '#06D6A0',
          border: '1px solid rgba(6,214,160,0.3)',
          background: 'rgba(6,214,160,0.08)',
        }}
      >
        View demographics
      </button>
    </div>
  );
}
