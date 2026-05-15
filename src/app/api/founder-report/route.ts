import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function logSupabaseError(label: string, error: { message: string; code?: string; details?: string; hint?: string }): void {
  console.error(`[founder-report] ${label} Supabase error:`, {
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
  });
}

export async function GET(request: Request): Promise<NextResponse> {
  const dashboardSecret = process.env.DASHBOARD_SECRET;
  if (!dashboardSecret) {
    return NextResponse.json({ error: 'DASHBOARD_SECRET not configured' }, { status: 500 });
  }
  if (request.headers.get('x-dashboard-secret') !== dashboardSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);

  let startDate = searchParams.get('startDate');
  let endDate = searchParams.get('endDate');

  // Backwards-compatible window aliases — compute relative to today.
  const windowParam = searchParams.get('window');
  if ((!startDate || !endDate) && (windowParam === '7' || windowParam === '30')) {
    const days = windowParam === '30' ? 30 : 7;
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - days);
    startDate = toYMD(start);
    endDate = toYMD(now);
  }

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: 'startDate and endDate are required (YYYY-MM-DD), or pass window=7|30' },
      { status: 400 },
    );
  }

  const now = new Date();
  const windowDays = Math.max(1, Math.round(
    (new Date(endDate).getTime() - new Date(startDate).getTime()) / (24 * 60 * 60 * 1000)
  ));

  try {
    // Daily metric rows in range — drives views, watch time, subs delta, lastDataDate.
    type StatRow = {
      content_type: string | null;
      stat_date: string | null;
      views: number | null;
      watch_time_hours: number | null;
      subscribers_gained: number | null;
      subscribers_lost: number | null;
    };
    const statRows: StatRow[] = [];
    {
      const PAGE = 1000;
      let from = 0;
      for (;;) {
        const { data, error } = await supabase
          .from('posts')
          .select('content_type, stat_date, views, watch_time_hours, subscribers_gained, subscribers_lost')
          .eq('platform', 'youtube')
          .gte('stat_date', startDate)
          .lte('stat_date', endDate)
          .or('clip_details_code.is.null,clip_details_code.not.like.PENDING-%')
          .range(from, from + PAGE - 1);
        if (error) {
          logSupabaseError('statRows', error);
          throw error;
        }
        if (!data || data.length === 0) break;
        statRows.push(...(data as StatRow[]));
        if (data.length < PAGE) break;
        from += PAGE;
      }
    }

    // Posted-in-range rows — drives published counts (distinct content_id per content_type).
    type PostedRow = {
      content_id: string | null;
      content_type: string | null;
      posted_at: string | null;
    };
    const postedRows: PostedRow[] = [];
    {
      // JS-side filter on content_id != null — defensive transform per
      // 2026-05-15 incident on the IG registry (88d6a92): the supabase-js
      // .not('col', 'is', null) filter returned [] from the Vercel runtime
      // even though raw curl against the same PostgREST URL returned the
      // rows. Pagination still uses the server-returned page size so
      // termination is correct; the JS filter runs after the server has
      // already given us the page.
      const PAGE = 1000;
      let from = 0;
      for (;;) {
        const { data, error } = await supabase
          .from('posts')
          .select('content_id, content_type, posted_at')
          .eq('platform', 'youtube')
          .gte('posted_at', startDate)
          .lte('posted_at', `${endDate}T23:59:59.999Z`)
          .or('clip_details_code.is.null,clip_details_code.not.like.PENDING-%')
          .range(from, from + PAGE - 1);
        if (error) {
          logSupabaseError('postedRows', error);
          throw error;
        }
        if (!data || data.length === 0) break;
        const page = (data as PostedRow[]).filter((row) => row.content_id != null);
        postedRows.push(...page);
        if (data.length < PAGE) break;
        from += PAGE;
      }
    }

    let longFormViews = 0;
    let shortsViews = 0;
    let longFormWatchHours = 0;
    let shortsWatchHours = 0;
    let subsGained = 0;
    let subsLost = 0;
    let lastDataDate: string | null = null;

    for (const row of statRows ?? []) {
      const v = Number(row.views ?? 0);
      const w = Number(row.watch_time_hours ?? 0);
      if (row.content_type === 'long_form') {
        longFormViews += v;
        longFormWatchHours += w;
      } else if (row.content_type === 'short') {
        shortsViews += v;
        shortsWatchHours += w;
      }
      subsGained += Number(row.subscribers_gained ?? 0);
      subsLost += Number(row.subscribers_lost ?? 0);
      if (row.stat_date && (!lastDataDate || row.stat_date > lastDataDate)) {
        lastDataDate = row.stat_date as string;
      }
    }

    const longFormIds = new Set<string>();
    const shortIds = new Set<string>();
    for (const row of postedRows ?? []) {
      const id = row.content_id as string | null;
      if (!id) continue;
      if (row.content_type === 'long_form') longFormIds.add(id);
      else if (row.content_type === 'short') shortIds.add(id);
    }

    const result = {
      longFormsPublished: longFormIds.size,
      shortsPublished: shortIds.size,
      newSubscribers: subsGained - subsLost,
      longFormViews,
      shortsViews,
      longFormWatchTimeHours: Math.round(longFormWatchHours * 10) / 10,
      shortsWatchTimeHours: Math.round(shortsWatchHours * 10) / 10,
      windowDays,
      lastDataDate,
      generatedAt: now.toISOString(),
    };

    const warnings: string[] = [];
    if (result.longFormsPublished > 0 && result.longFormWatchTimeHours === 0 && result.longFormViews === 0) {
      warnings.push('Long forms published but zero engagement — possible parser failure');
    }
    if (result.shortsPublished > 0 && result.shortsWatchTimeHours === 0 && result.shortsViews === 0) {
      warnings.push('Shorts published but zero engagement — possible parser failure');
    }
    if ((statRows ?? []).length === 0) {
      warnings.push(`No daily stat rows found between ${startDate} and ${endDate}`);
    }

    if (warnings.length > 0) {
      return NextResponse.json({ ...result, _validation: { warnings } });
    }
    return NextResponse.json(result);
  } catch (err) {
    const e = err as { message?: string; code?: string; details?: string; hint?: string; stack?: string };
    console.error('[founder-report]', {
      message: e.message,
      code: e.code,
      details: e.details,
      hint: e.hint,
      stack: e.stack,
    });
    return NextResponse.json({ error: 'founder-report failed' }, { status: 500 });
  }
}
