'use client';

import { useMemo } from 'react';
import { Platform, PLATFORM_COLORS, PLATFORM_LABELS, UnifiedPost } from '@/types';

const ALL_PLATFORMS: Platform[] = ['tiktok', 'instagram', 'linkedin', 'twitter', 'youtube'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface DayBucket {
  interactions: number;
  views: number;
  count: number;
}

function computeDayStats(posts: UnifiedPost[]): Record<Platform, { rates: number[]; best: number; total: number }> {
  const result = {} as Record<Platform, { rates: number[]; best: number; total: number }>;

  for (const pl of ALL_PLATFORMS) {
    const buckets: DayBucket[] = Array.from({ length: 7 }, () => ({ interactions: 0, views: 0, count: 0 }));
    const pp = posts.filter((p) => p.platform === pl);

    for (const post of pp) {
      const day = new Date(post.date + 'T12:00:00').getDay();
      buckets[day].interactions += post.likes + post.comments + post.shares + post.saves;
      buckets[day].views += post.views;
      buckets[day].count += 1;
    }

    const rates = buckets.map((b) => (b.views > 0 ? (b.interactions / b.views) * 100 : 0));
    const best = rates.indexOf(Math.max(...rates));

    result[pl] = { rates, best, total: pp.length };
  }

  return result;
}

interface Props {
  posts: UnifiedPost[];
}

export default function BestTimeCard({ posts }: Props) {
  const stats = useMemo(() => computeDayStats(posts), [posts]);
  const activePlatforms = ALL_PLATFORMS.filter((pl) => stats[pl].total >= 3);

  return (
    <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-white/[0.05]">
        <h3 className="text-[15px] font-semibold text-[var(--text-1)]">Best Time to Post</h3>
        <p className="text-[11px] text-[var(--text-3)] mt-0.5">Avg engagement rate by day of week</p>
      </div>

      {activePlatforms.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-[var(--text-2)] text-sm mb-1">Not enough data</p>
          <p className="text-[var(--text-3)] text-xs">Import more posts to unlock timing insights</p>
        </div>
      ) : (
        <div className="p-5 space-y-4">
          {/* Day header */}
          <div className="grid gap-1" style={{ gridTemplateColumns: '72px repeat(7, 1fr)' }}>
            <div />
            {DAYS_SHORT.map((d) => (
              <div key={d} className="text-[10px] text-[var(--text-3)] text-center font-semibold">
                {d}
              </div>
            ))}
          </div>

          {/* Platform rows */}
          {activePlatforms.map((pl) => {
            const { rates, best } = stats[pl];
            const maxRate = Math.max(...rates, 0.001);
            const color = PLATFORM_COLORS[pl];

            return (
              <div key={pl} className="space-y-1">
                <div className="grid gap-1" style={{ gridTemplateColumns: '72px repeat(7, 1fr)' }}>
                  <span className="text-[11px] font-semibold self-center" style={{ color }}>
                    {PLATFORM_LABELS[pl]}
                  </span>
                  {rates.map((rate, i) => {
                    const intensity = rate / maxRate;
                    const isBest = i === best && rate > 0;
                    const hexOpacity = Math.round(intensity * 76 + 10)
                      .toString(16)
                      .padStart(2, '0');
                    return (
                      <div
                        key={i}
                        title={`${DAYS_FULL[i]}: ${rate.toFixed(2)}% avg eng. rate`}
                        className="h-8 rounded-md flex items-center justify-center relative"
                        style={{ background: `${color}${hexOpacity}` }}
                      >
                        {isBest && (
                          <div
                            className="absolute inset-0 rounded-md ring-1 ring-inset"
                            style={{ ringColor: color, outlineColor: color, boxShadow: `inset 0 0 0 1px ${color}` }}
                          />
                        )}
                        {rate > 0 && (
                          <span
                            className="text-[9px] tabular-nums leading-none"
                            style={{
                              fontFamily: 'var(--font-mono)',
                              color: intensity > 0.55 ? 'rgba(255,255,255,0.9)' : 'var(--text-3)',
                            }}
                          >
                            {rate.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-[var(--text-3)]" style={{ paddingLeft: 80 }}>
                  <span style={{ color }}>Best: </span>
                  {rates[best] > 0
                    ? `${DAYS_FULL[best]} — ${rates[best].toFixed(1)}% avg`
                    : 'Not enough data per day'}
                </p>
              </div>
            );
          })}

          <p className="text-[10px] text-[var(--text-3)] border-t border-white/[0.04] pt-3 mt-2">
            Based on day-of-week patterns. Time-of-day analysis requires platform API access.
          </p>
        </div>
      )}
    </div>
  );
}
