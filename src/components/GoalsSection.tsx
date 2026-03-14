'use client';

import { useEffect, useMemo, useState } from 'react';
import { GoalMetric, GOAL_METRIC_LABELS, Platform, PLATFORM_COLORS, PLATFORM_LABELS, UnifiedPost } from '@/types';
import { GoalRow, fetchGoals, saveGoal } from '@/lib/db';

const ALL_PLATFORMS: Platform[] = ['tiktok', 'instagram', 'linkedin', 'twitter', 'youtube'];
const ALL_METRICS: GoalMetric[] = ['views', 'likes', 'engagement_rate', 'followers'];

function fmtGoal(metric: GoalMetric, value: number): string {
  if (metric === 'engagement_rate') return `${value.toFixed(1)}%`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return String(value);
}

interface Props {
  posts: UnifiedPost[];
}

export default function GoalsSection({ posts }: Props) {
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Record<string, Record<string, string>>>({});

  useEffect(() => {
    fetchGoals().then(setGoals).catch(() => {});
  }, []);

  const goalsMap = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const g of goals) {
      if (!map[g.platform]) map[g.platform] = {};
      map[g.platform][g.metric] = g.target;
    }
    return map;
  }, [goals]);

  const currentValues = useMemo(() => {
    const cv: Record<Platform, Record<GoalMetric, number>> = {} as Record<Platform, Record<GoalMetric, number>>;
    for (const pl of ALL_PLATFORMS) {
      const pp = posts.filter((p) => p.platform === pl);
      const totalInter = pp.reduce((s, p) => s + p.likes + p.comments + p.shares + p.saves, 0);
      const totalViews = pp.reduce((s, p) => s + p.views, 0);
      cv[pl] = {
        views: totalViews,
        likes: pp.reduce((s, p) => s + p.likes, 0),
        engagement_rate: totalViews > 0 ? (totalInter / totalViews) * 100 : 0,
        followers: 0,
      };
    }
    return cv;
  }, [posts]);

  function openEdit() {
    const d: Record<string, Record<string, string>> = {};
    for (const pl of ALL_PLATFORMS) {
      d[pl] = {};
      for (const m of ALL_METRICS) {
        d[pl][m] = goalsMap[pl]?.[m] != null ? String(goalsMap[pl][m]) : '';
      }
    }
    setDraft(d);
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      for (const pl of ALL_PLATFORMS) {
        for (const m of ALL_METRICS) {
          const val = parseFloat(draft[pl]?.[m] ?? '');
          if (!isNaN(val) && val > 0) {
            await saveGoal(pl, m, val);
          }
        }
      }
      const updated = await fetchGoals();
      setGoals(updated);
      setEditing(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  const hasAnyGoal = goals.length > 0;

  return (
    <div className="bg-[var(--bg-card)] border border-white/[0.06] rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-white/[0.05] flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-semibold text-[var(--text-1)]">Goals</h3>
          <p className="text-[11px] text-[var(--text-3)] mt-0.5">Track progress toward your targets</p>
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button
                onClick={() => setEditing(false)}
                className="text-[11px] text-[var(--text-2)] border border-white/[0.08] px-3 py-1.5 rounded-lg hover:border-white/[0.14] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="text-[11px] font-semibold text-[var(--bg-base)] bg-[var(--gold)] px-3 py-1.5 rounded-lg hover:bg-[var(--gold-hi)] transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save Goals'}
              </button>
            </>
          ) : (
            <button
              onClick={openEdit}
              className="text-[11px] text-[var(--text-2)] border border-white/[0.08] px-3 py-1.5 rounded-lg hover:text-[var(--text-1)] hover:border-white/[0.14] transition-colors"
            >
              {hasAnyGoal ? 'Edit Goals' : 'Set Goals'}
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="p-5 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-[0.16em] pb-3 pr-4 whitespace-nowrap">
                  Platform
                </th>
                {ALL_METRICS.map((m) => (
                  <th
                    key={m}
                    className="text-left text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-[0.16em] pb-3 pr-4 whitespace-nowrap"
                  >
                    {GOAL_METRIC_LABELS[m]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {ALL_PLATFORMS.map((pl) => (
                <tr key={pl}>
                  <td className="py-3 pr-4">
                    <span
                      className="text-[11px] font-semibold px-2 py-1 rounded-lg whitespace-nowrap"
                      style={{ background: `${PLATFORM_COLORS[pl]}15`, color: PLATFORM_COLORS[pl] }}
                    >
                      {PLATFORM_LABELS[pl]}
                    </span>
                  </td>
                  {ALL_METRICS.map((m) => (
                    <td key={m} className="py-3 pr-4">
                      <input
                        type="number"
                        min="0"
                        value={draft[pl]?.[m] ?? ''}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, [pl]: { ...d[pl], [m]: e.target.value } }))
                        }
                        placeholder="—"
                        className="w-28 bg-[var(--bg-elevated)] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-[12px] text-[var(--text-1)] focus:outline-none focus:border-[var(--gold-border)] placeholder:text-[var(--text-3)] tabular-nums"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] text-[var(--text-3)] mt-3">
            Raw numbers: e.g. 1000000 for 1M views, 5.5 for 5.5% engagement rate
          </p>
        </div>
      ) : !hasAnyGoal ? (
        <div className="px-5 py-8 text-center">
          <p className="text-[var(--text-2)] text-sm mb-1">No goals set yet</p>
          <p className="text-[var(--text-3)] text-xs">
            Click &quot;Set Goals&quot; to define targets per platform
          </p>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {ALL_PLATFORMS.map((pl) => {
            const platformGoals = goalsMap[pl];
            if (!platformGoals || Object.keys(platformGoals).length === 0) return null;
            const color = PLATFORM_COLORS[pl];
            return (
              <div key={pl} className="px-5 py-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                  <span className="text-[13px] font-semibold text-[var(--text-1)]">
                    {PLATFORM_LABELS[pl]}
                  </span>
                </div>
                <div className="space-y-3">
                  {ALL_METRICS.map((m) => {
                    const target = platformGoals[m];
                    if (!target) return null;
                    const current = currentValues[pl][m];
                    const isFollowers = m === 'followers';
                    const pct = isFollowers ? 0 : Math.min((current / target) * 100, 100);
                    const barColor =
                      pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
                    return (
                      <div key={m}>
                        <div className="flex items-center justify-between mb-1.5 text-[11px]">
                          <span className="text-[var(--text-3)] font-medium">
                            {GOAL_METRIC_LABELS[m]}
                          </span>
                          <span
                            className="text-[var(--text-2)] tabular-nums"
                            style={{ fontFamily: 'var(--font-mono)' }}
                          >
                            {isFollowers ? '— / ' : `${fmtGoal(m, current)} / `}
                            {fmtGoal(m, target)}
                            {!isFollowers && (
                              <span className="ml-1.5 font-semibold" style={{ color: barColor }}>
                                {pct.toFixed(0)}%
                              </span>
                            )}
                          </span>
                        </div>
                        {isFollowers ? (
                          <p className="text-[10px] text-[var(--text-3)]">
                            Follower data unavailable from CSV imports
                          </p>
                        ) : (
                          <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${pct}%`, background: barColor }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
