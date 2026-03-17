'use client';

import { useState } from 'react';
import { PlatformScore } from '@/types/scriptAnalyzer';
import ScoreBreakdown from './ScoreBreakdown';

const PLATFORM_META: Record<string, { name: string; emoji: string; color: string }> = {
  tiktok:          { name: 'TikTok',           emoji: '🎵', color: '#FF004F' },
  youtube_shorts:  { name: 'YouTube Shorts',    emoji: '📺', color: '#FF0000' },
  instagram_reels: { name: 'Instagram Reels',   emoji: '📸', color: '#C13584' },
  linkedin:        { name: 'LinkedIn',          emoji: '💼', color: '#0A66C2' },
  twitter:         { name: 'Twitter/X',         emoji: '🐦', color: '#1D9BF0' },
};

function deltaBg(delta: number): string {
  if (delta >= 10)  return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  if (delta >= 1)   return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
  if (delta === 0)  return 'bg-white/10 text-[var(--text-3)] border-white/10';
  if (delta >= -9)  return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
  return 'bg-red-500/15 text-red-400 border-red-500/25';
}

interface Props {
  data: PlatformScore;
}

export default function PlatformScoreCard({ data }: Props) {
  const [expanded, setExpanded] = useState(false);
  const meta = PLATFORM_META[data.platform];
  const { color, name, emoji } = meta;
  const deltaLabel = data.delta > 0 ? `+${data.delta}` : `${data.delta}`;

  return (
    <div
      className="bg-[var(--bg-elevated)] rounded-xl overflow-hidden flex flex-col border border-white/[0.06]"
      style={{ borderTop: `3px solid ${color}` }}
    >
      <div className="px-4 pt-4 pb-3 flex flex-col gap-3 flex-1">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg leading-none">{emoji}</span>
            <span className="text-[12px] font-semibold text-[var(--text-2)] leading-none">{name}</span>
          </div>
          {/* Delta badge */}
          <span
            title={data.summary}
            className={`text-[11px] font-bold px-1.5 py-0.5 rounded border tabular-nums cursor-help ${deltaBg(data.delta)}`}
          >
            {deltaLabel} vs baseline
          </span>
        </div>

        {/* Score number + bar */}
        <div>
          <div className="flex items-end gap-2 mb-2">
            <span className="text-[52px] font-black leading-none tabular-nums" style={{ color }}>
              {data.score}
            </span>
            <span className="text-[var(--text-3)] text-[13px] mb-2">/100</span>
          </div>
          <div className="bg-white/[0.06] rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${data.score}%`, backgroundColor: color }}
            />
          </div>
        </div>

        {/* Summary */}
        <p className="text-[11px] text-[var(--text-3)] leading-relaxed flex-1">{data.summary}</p>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-[11px] font-semibold text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors mt-auto pt-1 border-t border-white/[0.05] w-full"
          style={{ color: expanded ? color : undefined }}
        >
          {expanded ? 'Hide breakdown ↑' : 'See breakdown ↓'}
        </button>
      </div>

      {/* Breakdown panel */}
      {expanded && (
        <div className="px-4 pb-4">
          <ScoreBreakdown data={data} color={color} />
        </div>
      )}
    </div>
  );
}
