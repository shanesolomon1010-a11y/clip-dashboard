// Shared aggregation helpers used by both insights routes.
// The analyze route has its own inline copies (pre-dating this file);
// new routes import from here.

export function aggregatePostsByClip(posts: Record<string, unknown>[]) {
  const map = new Map<string, {
    clip_details_code: string;
    posted_at: string | null;
    total_views: number; total_likes: number;
    total_comments: number; total_shares: number;
    total_watch_time_hours: number;
    dur_sum: number; dur_count: number;
    pct_sum: number; pct_count: number;
  }>();

  for (const row of posts) {
    const code = row.clip_details_code as string;
    if (!code) continue;
    const p = map.get(code);
    if (!p) {
      map.set(code, {
        clip_details_code: code,
        posted_at: row.posted_at as string | null,
        total_views:            Number(row.views ?? 0),
        total_likes:            Number(row.likes ?? 0),
        total_comments:         Number(row.comments ?? 0),
        total_shares:           Number(row.shares ?? 0),
        total_watch_time_hours: Number(row.watch_time_hours ?? 0),
        dur_sum:   row.avg_view_duration_seconds != null ? Number(row.avg_view_duration_seconds) : 0,
        dur_count: row.avg_view_duration_seconds != null ? 1 : 0,
        pct_sum:   row.avg_view_percentage != null ? Number(row.avg_view_percentage) : 0,
        pct_count: row.avg_view_percentage != null ? 1 : 0,
      });
    } else {
      p.total_views            += Number(row.views ?? 0);
      p.total_likes            += Number(row.likes ?? 0);
      p.total_comments         += Number(row.comments ?? 0);
      p.total_shares           += Number(row.shares ?? 0);
      p.total_watch_time_hours += Number(row.watch_time_hours ?? 0);
      if (row.avg_view_duration_seconds != null) { p.dur_sum += Number(row.avg_view_duration_seconds); p.dur_count++; }
      if (row.avg_view_percentage != null)        { p.pct_sum += Number(row.avg_view_percentage);       p.pct_count++; }
    }
  }

  return Array.from(map.values()).map(p => ({
    clip_details_code:      p.clip_details_code,
    posted_at:              p.posted_at,
    total_views:            p.total_views,
    total_likes:            p.total_likes,
    total_comments:         p.total_comments,
    total_shares:           p.total_shares,
    total_watch_time_hours: Math.round(p.total_watch_time_hours * 100) / 100,
    avg_view_duration_s:    p.dur_count > 0 ? Math.round(p.dur_sum / p.dur_count) : null,
    avg_view_pct:           p.pct_count > 0 ? Math.round(p.pct_sum / p.pct_count * 10) / 10 : null,
  })).sort((a, b) => b.total_views - a.total_views);
}

export function buildDailyPerformance(posts: Record<string, unknown>[]) {
  return posts
    .filter(r => r.clip_details_code && r.stat_date)
    .map(r => ({
      clip_details_code:   r.clip_details_code as string,
      stat_date:           r.stat_date as string,
      views:               Number(r.views ?? 0),
      likes:               Number(r.likes ?? 0),
      comments:            Number(r.comments ?? 0),
      shares:              Number(r.shares ?? 0),
      watch_time_hours:    r.watch_time_hours != null ? Math.round(Number(r.watch_time_hours) * 100) / 100 : null,
      avg_view_duration_s: r.avg_view_duration_seconds != null ? Number(r.avg_view_duration_seconds) : null,
      avg_view_pct:        r.avg_view_percentage != null ? Number(r.avg_view_percentage) : null,
    }))
    .sort((a, b) => a.stat_date.localeCompare(b.stat_date) || a.clip_details_code.localeCompare(b.clip_details_code));
}

export const DAILY_DIMS = new Set(['insightTrafficSourceType', 'deviceType', 'subscribedStatus']);

export function buildBreakdowns(rows: Record<string, unknown>[], endDate: string, topN = 8) {
  const cutoff14 = new Date(new Date(endDate + 'T00:00:00').getTime() - 14 * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];

  const byTypeTotals = new Map<string, Map<string, number>>();
  const byTypeDaily  = new Map<string, { date: string; value: string; views: number }[]>();

  for (const row of rows) {
    const type  = row.dimension_type as string;
    const value = row.dimension_value as string;
    const views = Number(row.views ?? 0);
    const date  = row.stat_date as string;

    if (!byTypeTotals.has(type)) byTypeTotals.set(type, new Map());
    byTypeTotals.get(type)!.set(value, (byTypeTotals.get(type)!.get(value) ?? 0) + views);

    if (DAILY_DIMS.has(type) && date >= cutoff14) {
      if (!byTypeDaily.has(type)) byTypeDaily.set(type, []);
      byTypeDaily.get(type)!.push({ date, value, views });
    }
  }

  const result: Record<string, unknown> = {};

  for (const [type, inner] of Array.from(byTypeTotals.entries())) {
    const totals = Array.from(inner.entries())
      .map(([value, views]) => ({ value, views }))
      .sort((a, b) => b.views - a.views)
      .slice(0, topN);

    if (DAILY_DIMS.has(type)) {
      const top3 = new Set(totals.slice(0, 3).map(t => t.value));
      const dailyAgg = new Map<string, number>();
      for (const r of (byTypeDaily.get(type) ?? [])) {
        if (!top3.has(r.value)) continue;
        const key = `${r.date}|${r.value}`;
        dailyAgg.set(key, (dailyAgg.get(key) ?? 0) + r.views);
      }
      const daily_top3 = Array.from(dailyAgg.entries())
        .map(([key, views]) => { const s = key.indexOf('|'); return { date: key.slice(0, s), value: key.slice(s + 1), views }; })
        .sort((a, b) => a.date.localeCompare(b.date) || a.value.localeCompare(b.value));
      result[type] = { totals, daily_top3 };
    } else {
      result[type] = totals;
    }
  }
  return result;
}

export function summarizeSchedule(rows: Record<string, unknown>[]) {
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return rows.map(r => ({
    clip_code:      r.clip_code,
    scheduled_date: r.scheduled_date,
    post_time:      r.post_time,
    platform:       r.platform,
    day_of_week:    DAYS[new Date((r.scheduled_date as string) + 'T00:00:00').getUTCDay()],
  }));
}
