import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/instagram';
import { buildFounderReport } from '@/lib/founder-report';
import {
  freshnessStatus,
  driftStatus,
  statFreshnessStatus,
  nullCountStatus,
  scraperRunStatus,
  tokenExpiryStatus,
  aggregateStatus,
  type StatusLevel,
} from '@/lib/diagnostics-status';

// IG cron runs 4×/day (every 6h via vercel.json); use tighter thresholds than
// the YT defaults so an 8h gap is yellow, 16h is red. Hardcoded — not exposed
// as query params.
const IG_FRESHNESS_YELLOW_HOURS = 8;
const IG_FRESHNESS_RED_HOURS = 16;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FreshnessCheck {
  timestamp: string | null;
  hours_ago: number | null;
  status: StatusLevel;
}

export interface StatDateCheck {
  date: string | null;
  days_ago: number | null;
  status: StatusLevel;
}

export interface ConsistencyCheck {
  longform_views_displayed: number;
  longform_views_recomputed: number;
  longform_views_delta: number;
  shorts_views_displayed: number;
  shorts_views_recomputed: number;
  shorts_views_delta: number;
  longform_watch_displayed: number;
  longform_watch_recomputed: number;
  longform_watch_delta: number;
  shorts_watch_displayed: number;
  shorts_watch_recomputed: number;
  shorts_watch_delta: number;
  status: StatusLevel;
  error?: string;
}

export interface DriftPerClip {
  clip_details_code: string;
  days_with_drift: number;
  max_pct_delta: number;
  posts_views_sum: number;
  studio_views_sum: number;
  status: StatusLevel;
}

export interface DriftCheck {
  window_days: number;
  total_rows_compared: number;
  rows_with_drift: number;
  drift_pct_overall: number;
  by_clip: DriftPerClip[];
  status: StatusLevel;
}

export interface CoverageCheck {
  posts_distinct_clips_7d: number;
  studio_snapshots_distinct_clips_7d: number;
  clips_in_posts_missing_from_studio: string[];
  clips_in_studio_missing_from_posts: string[];
  status: StatusLevel;
}

export interface ScraperHistoryCheck {
  last_run_at: string | null;
  last_run_rows_written: number;
  runs_last_7_days: number;
  expected_runs_last_7_days: number;
  status: StatusLevel;
}

export interface AuthHealthCheck {
  token_expiry: string | null;
  days_remaining: number | null;
  status: StatusLevel;
  error?: string;
}

export interface DiagnosticsResponse {
  thresholds: {
    drift_pct_red: number;
    drift_pct_yellow: number;
    freshness_hours_red: number;
    freshness_hours_yellow: number;
    drift_window_days: number;
  };
  cron_health: {
    last_youtube_sync_short: FreshnessCheck;
    last_youtube_sync_longform: FreshnessCheck;
    last_instagram_sync: FreshnessCheck;
    last_scraper_run: FreshnessCheck;
  };
  data_freshness: {
    posts_short_latest_stat: StatDateCheck;
    posts_longform_latest_stat: StatDateCheck;
    posts_instagram_latest_stat: StatDateCheck;
    studio_snapshots_latest_stat: StatDateCheck;
  };
  schema_integrity: {
    posts_null_content_id_count: number;
    posts_null_clip_details_code_short_count: number;
    posts_instagram_null_content_id_count: number;
    studio_snapshots_null_clip_details_code_count: number;
    posts_orphaned_rows: number;
    status: StatusLevel;
  };
  auth_health: {
    instagram: AuthHealthCheck;
  };
  internal_consistency: ConsistencyCheck;
  drift_check: DriftCheck;
  coverage: CoverageCheck;
  scraper_history: ScraperHistoryCheck;
  generated_at: string;
}

export interface BuildDiagnosticsOptions {
  driftPctRed?: number;
  driftPctYellow?: number;
  freshnessHoursRed?: number;
  freshnessHoursYellow?: number;
  driftWindowDays?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hoursBetween(a: Date, b: Date): number {
  return (a.getTime() - b.getTime()) / (1000 * 60 * 60);
}

function daysBetween(today: Date, dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// supabase-js doesn't expose count-only queries through the typed API in a way
// that's portable across versions. Use head:true + count:'exact' which is supported.
async function countRows(
  table: string,
  build: (q: ReturnType<typeof supabase.from>) => unknown,
): Promise<number> {
  const baseQuery = supabase.from(table).select('*', { count: 'exact', head: true });
  const finalQuery = build(baseQuery as unknown as ReturnType<typeof supabase.from>) as {
    then?: (resolve: (v: { count: number | null; error: unknown }) => void) => void;
  };
  const { count } = (await (finalQuery as unknown as Promise<{ count: number | null; error: unknown }>));
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Individual check builders
// ---------------------------------------------------------------------------

async function buildCronHealth(
  now: Date,
  yellowHours: number,
  redHours: number,
): Promise<DiagnosticsResponse['cron_health']> {
  const { data: shortRow } = await supabase
    .from('posts')
    .select('updated_at')
    .eq('platform', 'youtube')
    .eq('content_type', 'short')
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const { data: longRow } = await supabase
    .from('posts')
    .select('updated_at')
    .eq('platform', 'youtube')
    .eq('content_type', 'long_form')
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const { data: igRow } = await supabase
    .from('posts')
    .select('updated_at')
    .eq('platform', 'instagram')
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const { data: scraperRow } = await supabase
    .from('studio_snapshots')
    .select('scraped_at')
    .order('scraped_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  function toCheck(
    timestamp: string | null | undefined,
    yellow: number,
    red: number,
  ): FreshnessCheck {
    if (!timestamp) return { timestamp: null, hours_ago: null, status: 'red' };
    const ts = new Date(timestamp);
    const hoursAgo = hoursBetween(now, ts);
    return {
      timestamp,
      hours_ago: Math.round(hoursAgo * 10) / 10,
      status: freshnessStatus(hoursAgo, yellow, red),
    };
  }

  return {
    last_youtube_sync_short: toCheck(shortRow?.updated_at as string | undefined, yellowHours, redHours),
    last_youtube_sync_longform: toCheck(longRow?.updated_at as string | undefined, yellowHours, redHours),
    last_instagram_sync: toCheck(igRow?.updated_at as string | undefined, IG_FRESHNESS_YELLOW_HOURS, IG_FRESHNESS_RED_HOURS),
    last_scraper_run: toCheck(scraperRow?.scraped_at as string | undefined, yellowHours, redHours),
  };
}

async function buildDataFreshness(now: Date): Promise<DiagnosticsResponse['data_freshness']> {
  const { data: shortRow } = await supabase
    .from('posts')
    .select('stat_date')
    .eq('platform', 'youtube')
    .eq('content_type', 'short')
    .not('stat_date', 'is', null)
    .order('stat_date', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const { data: longRow } = await supabase
    .from('posts')
    .select('stat_date')
    .eq('platform', 'youtube')
    .eq('content_type', 'long_form')
    .not('stat_date', 'is', null)
    .order('stat_date', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const { data: igStatRow } = await supabase
    .from('posts')
    .select('stat_date')
    .eq('platform', 'instagram')
    .not('stat_date', 'is', null)
    .order('stat_date', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const { data: studioRow } = await supabase
    .from('studio_snapshots')
    .select('stat_date')
    .not('stat_date', 'is', null)
    .order('stat_date', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  function toCheck(date: string | null | undefined): StatDateCheck {
    if (!date) return { date: null, days_ago: null, status: 'red' };
    const daysAgo = daysBetween(now, date);
    return { date, days_ago: daysAgo, status: statFreshnessStatus(daysAgo) };
  }

  return {
    posts_short_latest_stat: toCheck(shortRow?.stat_date as string | undefined),
    posts_longform_latest_stat: toCheck(longRow?.stat_date as string | undefined),
    posts_instagram_latest_stat: toCheck(igStatRow?.stat_date as string | undefined),
    studio_snapshots_latest_stat: toCheck(studioRow?.stat_date as string | undefined),
  };
}

async function buildSchemaIntegrity(): Promise<DiagnosticsResponse['schema_integrity']> {
  const postsNullContentId = await countRows('posts', q =>
    (q as unknown as { is: (col: string, value: null) => unknown })
      .is('content_id', null),
  );

  const postsNullClipDetailsCodeShort = await countRows('posts', q => {
    const tq = q as unknown as {
      eq: (col: string, value: string) => typeof tq;
      is: (col: string, value: null) => unknown;
    };
    return tq.eq('content_type', 'short').is('clip_details_code', null);
  });

  const postsInstagramNullContentId = await countRows('posts', q => {
    const tq = q as unknown as {
      eq: (col: string, value: string) => typeof tq;
      is: (col: string, value: null) => unknown;
    };
    return tq.eq('platform', 'instagram').is('content_id', null);
  });

  const studioNullClipDetailsCode = await countRows('studio_snapshots', q =>
    (q as unknown as { is: (col: string, value: null) => unknown })
      .is('clip_details_code', null),
  );

  // Orphaned posts rows: clip_details_code is set but doesn't match clip_details.
  const { data: postsCodes } = await supabase
    .from('posts')
    .select('clip_details_code')
    .not('clip_details_code', 'is', null);
  const { data: knownCodes } = await supabase
    .from('clip_details')
    .select('clip_details_code')
    .not('clip_details_code', 'is', null);

  const known = new Set<string>();
  for (const row of knownCodes ?? []) {
    const c = row.clip_details_code as string | null;
    if (c) known.add(c);
  }
  let orphaned = 0;
  for (const row of postsCodes ?? []) {
    const c = row.clip_details_code as string | null;
    if (c && !known.has(c)) orphaned++;
  }

  const status = aggregateStatus(
    nullCountStatus(postsNullContentId),
    nullCountStatus(postsNullClipDetailsCodeShort),
    nullCountStatus(postsInstagramNullContentId),
    nullCountStatus(studioNullClipDetailsCode),
    nullCountStatus(orphaned),
  );

  return {
    posts_null_content_id_count: postsNullContentId,
    posts_null_clip_details_code_short_count: postsNullClipDetailsCodeShort,
    posts_instagram_null_content_id_count: postsInstagramNullContentId,
    studio_snapshots_null_clip_details_code_count: studioNullClipDetailsCode,
    posts_orphaned_rows: orphaned,
    status,
  };
}

async function buildAuthHealth(now: Date): Promise<DiagnosticsResponse['auth_health']> {
  try {
    const { data, error } = await supabaseAdmin
      .from('instagram_auth')
      .select('token_expiry')
      .maybeSingle();

    if (error) {
      return {
        instagram: {
          token_expiry: null,
          days_remaining: null,
          status: 'red',
          error: error.message,
        },
      };
    }
    if (!data) {
      return {
        instagram: {
          token_expiry: null,
          days_remaining: null,
          status: 'red',
          error: 'no instagram_auth row',
        },
      };
    }

    const expiry = (data as { token_expiry: string }).token_expiry;
    const expiryDate = new Date(expiry);
    const daysRemaining = Math.floor(
      (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );
    return {
      instagram: {
        token_expiry: expiry,
        days_remaining: daysRemaining,
        status: tokenExpiryStatus(daysRemaining),
      },
    };
  } catch (err) {
    return {
      instagram: {
        token_expiry: null,
        days_remaining: null,
        status: 'red',
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

async function buildInternalConsistency(
  now: Date,
): Promise<ConsistencyCheck> {
  const empty: ConsistencyCheck = {
    longform_views_displayed: 0,
    longform_views_recomputed: 0,
    longform_views_delta: 0,
    shorts_views_displayed: 0,
    shorts_views_recomputed: 0,
    shorts_views_delta: 0,
    longform_watch_displayed: 0,
    longform_watch_recomputed: 0,
    longform_watch_delta: 0,
    shorts_watch_displayed: 0,
    shorts_watch_recomputed: 0,
    shorts_watch_delta: 0,
    status: 'red',
  };

  let displayed: {
    longFormViews: number;
    shortsViews: number;
    longFormWatchTimeHours: number;
    shortsWatchTimeHours: number;
  };
  try {
    const report = await buildFounderReport({ window: 30 });
    displayed = {
      longFormViews: report.longFormViews,
      shortsViews: report.shortsViews,
      longFormWatchTimeHours: report.longFormWatchTimeHours,
      shortsWatchTimeHours: report.shortsWatchTimeHours,
    };
  } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : String(err) };
  }

  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - 30);

  // Mirror founder-report's PENDING-shorts exclusion (946ece4). If this
  // recomputation doesn't apply the same filter as the query it's verifying,
  // the consistency check measures filter-mismatch noise instead of real drift.
  const { data: rows, error } = await supabase
    .from('posts')
    .select('content_type, views, watch_time_hours')
    .eq('platform', 'youtube')
    .gte('stat_date', toYMD(startDate))
    .lte('stat_date', toYMD(now))
    .or('clip_details_code.is.null,clip_details_code.not.like.PENDING-%');
  if (error) {
    return { ...empty, error: error.message };
  }

  let longformViewsRecomputed = 0;
  let shortsViewsRecomputed = 0;
  let longformWatchRecomputed = 0;
  let shortsWatchRecomputed = 0;
  for (const r of rows ?? []) {
    const v = Number(r.views ?? 0);
    const w = Number(r.watch_time_hours ?? 0);
    if (r.content_type === 'long_form') {
      longformViewsRecomputed += v;
      longformWatchRecomputed += w;
    } else if (r.content_type === 'short') {
      shortsViewsRecomputed += v;
      shortsWatchRecomputed += w;
    }
  }

  // Founder report rounds watch hours to 1 decimal — match that here so the
  // delta represents real disagreement, not rounding.
  longformWatchRecomputed = Math.round(longformWatchRecomputed * 10) / 10;
  shortsWatchRecomputed = Math.round(shortsWatchRecomputed * 10) / 10;

  const longformViewsDisplayed = displayed.longFormViews;
  const shortsViewsDisplayed = displayed.shortsViews;
  const longformWatchDisplayed = displayed.longFormWatchTimeHours;
  const shortsWatchDisplayed = displayed.shortsWatchTimeHours;

  const deltas = [
    longformViewsDisplayed - longformViewsRecomputed,
    shortsViewsDisplayed - shortsViewsRecomputed,
    longformWatchDisplayed - longformWatchRecomputed,
    shortsWatchDisplayed - shortsWatchRecomputed,
  ];
  const anyDelta = deltas.some(d => Math.abs(d) > 0.0001);

  return {
    longform_views_displayed: longformViewsDisplayed,
    longform_views_recomputed: longformViewsRecomputed,
    longform_views_delta: longformViewsDisplayed - longformViewsRecomputed,
    shorts_views_displayed: shortsViewsDisplayed,
    shorts_views_recomputed: shortsViewsRecomputed,
    shorts_views_delta: shortsViewsDisplayed - shortsViewsRecomputed,
    longform_watch_displayed: longformWatchDisplayed,
    longform_watch_recomputed: longformWatchRecomputed,
    longform_watch_delta: longformWatchDisplayed - longformWatchRecomputed,
    shorts_watch_displayed: shortsWatchDisplayed,
    shorts_watch_recomputed: shortsWatchRecomputed,
    shorts_watch_delta: shortsWatchDisplayed - shortsWatchRecomputed,
    status: anyDelta ? 'red' : 'green',
  };
}

interface PostsRow {
  clip_details_code: string | null;
  platform: string | null;
  stat_date: string | null;
  views: number | null;
}
interface StudioRow {
  clip_details_code: string;
  platform: string;
  stat_date: string;
  views: number | null;
}

async function buildDriftCheck(
  now: Date,
  windowDays: number,
  yellowPct: number,
  redPct: number,
): Promise<DriftCheck> {
  const start = new Date(now);
  start.setDate(start.getDate() - windowDays);
  const startYMD = toYMD(start);
  const endYMD = toYMD(now);

  const { data: postsRows } = await supabase
    .from('posts')
    .select('clip_details_code, platform, stat_date, views')
    .eq('platform', 'youtube')
    .eq('content_type', 'short')
    .gte('stat_date', startYMD)
    .lte('stat_date', endYMD)
    .not('clip_details_code', 'is', null);

  const { data: studioRows } = await supabase
    .from('studio_snapshots')
    .select('clip_details_code, platform, stat_date, views')
    .eq('platform', 'youtube')
    .gte('stat_date', startYMD)
    .lte('stat_date', endYMD);

  const postsByKey = new Map<string, PostsRow>();
  for (const r of (postsRows ?? []) as PostsRow[]) {
    if (!r.clip_details_code || !r.stat_date) continue;
    postsByKey.set(`${r.clip_details_code}|${r.platform}|${r.stat_date}`, r);
  }

  type ClipAgg = {
    days_with_drift: number;
    max_pct_delta: number;
    posts_views_sum: number;
    studio_views_sum: number;
  };
  const byClip = new Map<string, ClipAgg>();

  let totalCompared = 0;
  let rowsWithDrift = 0;
  let totalPctSum = 0;

  for (const s of (studioRows ?? []) as StudioRow[]) {
    const key = `${s.clip_details_code}|${s.platform}|${s.stat_date}`;
    const p = postsByKey.get(key);
    if (!p) continue;

    totalCompared++;
    const pv = Number(p.views ?? 0);
    const sv = Number(s.views ?? 0);
    const denom = Math.max(pv, 1);
    const pctDelta = (Math.abs(pv - sv) / denom) * 100;

    if (pctDelta >= yellowPct) rowsWithDrift++;
    totalPctSum += pctDelta;

    const code = s.clip_details_code;
    const agg = byClip.get(code) ?? {
      days_with_drift: 0,
      max_pct_delta: 0,
      posts_views_sum: 0,
      studio_views_sum: 0,
    };
    agg.posts_views_sum += pv;
    agg.studio_views_sum += sv;
    if (pctDelta >= yellowPct) agg.days_with_drift++;
    if (pctDelta > agg.max_pct_delta) agg.max_pct_delta = pctDelta;
    byClip.set(code, agg);
  }

  const by_clip: DriftPerClip[] = Array.from(byClip.entries())
    .map(([clip_details_code, agg]) => ({
      clip_details_code,
      days_with_drift: agg.days_with_drift,
      max_pct_delta: Math.round(agg.max_pct_delta * 100) / 100,
      posts_views_sum: agg.posts_views_sum,
      studio_views_sum: agg.studio_views_sum,
      status: driftStatus(agg.max_pct_delta, yellowPct, redPct),
    }))
    .sort((a, b) => b.max_pct_delta - a.max_pct_delta);

  const driftPctOverall = totalCompared > 0 ? totalPctSum / totalCompared : 0;
  const overallStatus = aggregateStatus(...by_clip.map(c => c.status));

  return {
    window_days: windowDays,
    total_rows_compared: totalCompared,
    rows_with_drift: rowsWithDrift,
    drift_pct_overall: Math.round(driftPctOverall * 100) / 100,
    by_clip,
    status: overallStatus,
  };
}

async function buildCoverage(now: Date): Promise<CoverageCheck> {
  const start = new Date(now);
  start.setDate(start.getDate() - 7);
  const startYMD = toYMD(start);
  const endYMD = toYMD(now);

  const { data: postsRows } = await supabase
    .from('posts')
    .select('clip_details_code')
    .eq('platform', 'youtube')
    .eq('content_type', 'short')
    .gte('stat_date', startYMD)
    .lte('stat_date', endYMD)
    .not('clip_details_code', 'is', null);

  const { data: studioRows } = await supabase
    .from('studio_snapshots')
    .select('clip_details_code')
    .gte('stat_date', startYMD)
    .lte('stat_date', endYMD);

  const postsClips = new Set<string>();
  for (const r of postsRows ?? []) {
    const c = r.clip_details_code as string | null;
    if (c) postsClips.add(c);
  }
  const studioClips = new Set<string>();
  for (const r of studioRows ?? []) {
    const c = r.clip_details_code as string | null;
    if (c) studioClips.add(c);
  }

  const missingFromStudio = Array.from(postsClips).filter(c => !studioClips.has(c)).sort();
  const missingFromPosts = Array.from(studioClips).filter(c => !postsClips.has(c)).sort();

  const status = aggregateStatus(
    nullCountStatus(missingFromStudio.length),
    nullCountStatus(missingFromPosts.length),
  );

  return {
    posts_distinct_clips_7d: postsClips.size,
    studio_snapshots_distinct_clips_7d: studioClips.size,
    clips_in_posts_missing_from_studio: missingFromStudio,
    clips_in_studio_missing_from_posts: missingFromPosts,
    status,
  };
}

async function buildScraperHistory(now: Date): Promise<ScraperHistoryCheck> {
  const start = new Date(now);
  start.setDate(start.getDate() - 7);

  const { data: rows } = await supabase
    .from('studio_snapshots')
    .select('scraped_at')
    .gte('scraped_at', start.toISOString())
    .order('scraped_at', { ascending: false, nullsFirst: false });

  const distinctDates = new Set<string>();
  let mostRecent: string | null = null;
  for (const r of rows ?? []) {
    const ts = r.scraped_at as string | null;
    if (!ts) continue;
    distinctDates.add(ts.slice(0, 10));
    if (!mostRecent || ts > mostRecent) mostRecent = ts;
  }

  let lastRunRows = 0;
  if (mostRecent) {
    const { count } = await supabase
      .from('studio_snapshots')
      .select('*', { count: 'exact', head: true })
      .eq('scraped_at', mostRecent);
    lastRunRows = count ?? 0;
  }

  return {
    last_run_at: mostRecent,
    last_run_rows_written: lastRunRows,
    runs_last_7_days: distinctDates.size,
    expected_runs_last_7_days: 7,
    status: scraperRunStatus(distinctDates.size),
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function buildDiagnostics(
  options: BuildDiagnosticsOptions = {},
): Promise<DiagnosticsResponse> {
  const driftPctRed = options.driftPctRed ?? 10;
  const driftPctYellow = options.driftPctYellow ?? 5;
  const freshnessHoursRed = options.freshnessHoursRed ?? 24;
  const freshnessHoursYellow = options.freshnessHoursYellow ?? 12;
  const driftWindowDays = options.driftWindowDays ?? 7;

  const now = new Date();

  const [
    cron_health,
    data_freshness,
    schema_integrity,
    auth_health,
    internal_consistency,
    drift_check,
    coverage,
    scraper_history,
  ] = await Promise.all([
    buildCronHealth(now, freshnessHoursYellow, freshnessHoursRed),
    buildDataFreshness(now),
    buildSchemaIntegrity(),
    buildAuthHealth(now),
    buildInternalConsistency(now),
    buildDriftCheck(now, driftWindowDays, driftPctYellow, driftPctRed),
    buildCoverage(now),
    buildScraperHistory(now),
  ]);

  return {
    thresholds: {
      drift_pct_red: driftPctRed,
      drift_pct_yellow: driftPctYellow,
      freshness_hours_red: freshnessHoursRed,
      freshness_hours_yellow: freshnessHoursYellow,
      drift_window_days: driftWindowDays,
    },
    cron_health,
    data_freshness,
    schema_integrity,
    auth_health,
    internal_consistency,
    drift_check,
    coverage,
    scraper_history,
    generated_at: now.toISOString(),
  };
}
