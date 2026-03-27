'use client';

import { PlatformScore } from '@/types/scriptAnalyzer';

const PLATFORM_NAMES: Record<string, string> = {
  youtube_shorts: 'YouTube Shorts',
  instagram_reels: 'Instagram Reels',
};

interface Props {
  data: PlatformScore;
  color: string;
}

export default function ScoreBreakdown({ data, color }: Props) {
  return (
    <div className="mt-3 pt-4 border-t border-[rgba(247,231,206,0.06)] space-y-4">
      {/* Sub-score bars */}
      <div className="space-y-3">
        {data.breakdown.map((item) => (
          <div key={item.label}>
            <div className="flex items-center gap-3">
              <div className="w-[160px] shrink-0">
                <p className="text-[12px] font-medium text-[var(--text-1)] leading-tight">{item.label}</p>
                <p className="text-[10px] text-[var(--text-3)] mt-0.5">{item.weight}% weight</p>
              </div>
              <div className="flex-1 bg-[rgba(247,231,206,0.06)] rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${item.score}%`, backgroundColor: color }}
                />
              </div>
              <span className="text-[12px] font-semibold text-[var(--text-1)] tabular-nums w-7 text-right shrink-0">
                {item.score}
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-3)] mt-1 ml-[172px] leading-relaxed">{item.note}</p>
          </div>
        ))}
      </div>

      {/* Strength / Weakness */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <span className="text-[11px] font-semibold text-[var(--gold)] shrink-0">Top Strength:</span>
          <span className="text-[11px] text-[var(--text-2)] leading-relaxed">{data.topStrength}</span>
        </div>
        <div className="flex gap-2">
          <span className="text-[11px] font-semibold text-[var(--text-2)] shrink-0">Top Weakness:</span>
          <span className="text-[11px] text-[var(--text-2)] leading-relaxed">{data.topWeakness}</span>
        </div>
      </div>

      {/* Recommendation */}
      <div
        className="rounded-lg px-3 py-2.5"
        style={{ backgroundColor: `${color}14`, borderLeft: `2px solid ${color}60` }}
      >
        <p className="text-[11px] font-semibold mb-1" style={{ color }}>
          Recommendation for {PLATFORM_NAMES[data.platform]}:
        </p>
        <p className="text-[11px] text-[var(--text-2)] leading-relaxed">{data.recommendation}</p>
      </div>
    </div>
  );
}
