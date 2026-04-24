import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { gatherAnalysisData } from '@/lib/insights-db';

export const maxDuration = 120;

interface AnthropicContent { type: string; text: string; }
interface AnthropicUsage { input_tokens: number; output_tokens: number; }
interface AnthropicResponse {
  content: AnthropicContent[];
  usage: AnthropicUsage;
}

// Aggregate daily post rows into one summary per clip
function aggregatePostsByClip(posts: Record<string, unknown>[]) {
  const map = new Map<string, {
    clip_details_code: string;
    posted_at: string | null;
    total_views: number;
    total_likes: number;
    total_comments: number;
    total_shares: number;
    total_watch_time_hours: number;
    dur_sum: number; dur_count: number;
    pct_sum: number; pct_count: number;
  }>();

  for (const row of posts) {
    const code = row.clip_details_code as string;
    if (!code) continue;
    const prev = map.get(code);
    if (!prev) {
      map.set(code, {
        clip_details_code: code,
        posted_at: row.posted_at as string | null,
        total_views:          Number(row.views ?? 0),
        total_likes:          Number(row.likes ?? 0),
        total_comments:       Number(row.comments ?? 0),
        total_shares:         Number(row.shares ?? 0),
        total_watch_time_hours: Number(row.watch_time_hours ?? 0),
        dur_sum:   row.avg_view_duration_seconds != null ? Number(row.avg_view_duration_seconds) : 0,
        dur_count: row.avg_view_duration_seconds != null ? 1 : 0,
        pct_sum:   row.avg_view_percentage != null ? Number(row.avg_view_percentage) : 0,
        pct_count: row.avg_view_percentage != null ? 1 : 0,
      });
    } else {
      prev.total_views            += Number(row.views ?? 0);
      prev.total_likes            += Number(row.likes ?? 0);
      prev.total_comments         += Number(row.comments ?? 0);
      prev.total_shares           += Number(row.shares ?? 0);
      prev.total_watch_time_hours += Number(row.watch_time_hours ?? 0);
      if (row.avg_view_duration_seconds != null) { prev.dur_sum += Number(row.avg_view_duration_seconds); prev.dur_count++; }
      if (row.avg_view_percentage != null)        { prev.pct_sum += Number(row.avg_view_percentage);       prev.pct_count++; }
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

// Raw daily rows for the full window, one entry per (clip, stat_date), sorted date ASC
function buildDailyPerformance(posts: Record<string, unknown>[]) {
  return posts
    .filter(r => r.clip_details_code && r.stat_date)
    .map(r => ({
      clip_details_code:  r.clip_details_code as string,
      stat_date:          r.stat_date as string,
      views:              Number(r.views ?? 0),
      likes:              Number(r.likes ?? 0),
      comments:           Number(r.comments ?? 0),
      shares:             Number(r.shares ?? 0),
      watch_time_hours:   r.watch_time_hours != null ? Math.round(Number(r.watch_time_hours) * 100) / 100 : null,
      avg_view_duration_s: r.avg_view_duration_seconds != null ? Number(r.avg_view_duration_seconds) : null,
      avg_view_pct:       r.avg_view_percentage != null ? Number(r.avg_view_percentage) : null,
    }))
    .sort((a, b) => a.stat_date.localeCompare(b.stat_date) || a.clip_details_code.localeCompare(b.clip_details_code));
}

// Dims whose data is daily (can show variance); the rest are period aggregates
const DAILY_DIMS = new Set(['insightTrafficSourceType', 'deviceType', 'subscribedStatus']);

// Breakdowns: daily dims → { totals, daily_top3 }; aggregate dims → flat totals array
function buildBreakdowns(rows: Record<string, unknown>[], endDate: string, topN = 8) {
  const cutoff14 = new Date(new Date(endDate + 'T00:00:00').getTime() - 14 * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];

  // Accumulate totals and daily rows in one pass
  const byTypeTotals = new Map<string, Map<string, number>>();
  const byTypeDaily  = new Map<string, { date: string; value: string; views: number }[]>();

  for (const row of rows) {
    const type  = row.dimension_type as string;
    const value = row.dimension_value as string;
    const views = Number(row.views ?? 0);
    const date  = row.stat_date as string;

    if (!byTypeTotals.has(type)) byTypeTotals.set(type, new Map());
    const inner = byTypeTotals.get(type)!;
    inner.set(value, (inner.get(value) ?? 0) + views);

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
      const top3Values = new Set(totals.slice(0, 3).map(t => t.value));
      // Sum views per (date, value) for top-3 values
      const dailyAgg = new Map<string, number>();
      for (const r of (byTypeDaily.get(type) ?? [])) {
        if (!top3Values.has(r.value)) continue;
        const key = `${r.date}|${r.value}`;
        dailyAgg.set(key, (dailyAgg.get(key) ?? 0) + r.views);
      }
      const daily_top3 = Array.from(dailyAgg.entries())
        .map(([key, views]) => {
          const sep = key.indexOf('|');
          return { date: key.slice(0, sep), value: key.slice(sep + 1), views };
        })
        .sort((a, b) => a.date.localeCompare(b.date) || a.value.localeCompare(b.value));

      result[type] = { totals, daily_top3 };
    } else {
      result[type] = totals;
    }
  }

  return result;
}

// Schedule: day-of-week posting pattern
function summarizeSchedule(rows: Record<string, unknown>[]) {
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dayCounts: Record<string, number> = {};
  for (const row of rows) {
    const d = new Date((row.scheduled_date as string) + 'T00:00:00');
    const day = DAYS[d.getUTCDay()];
    dayCounts[day] = (dayCounts[day] ?? 0) + 1;
  }
  return rows.map(r => ({
    clip_code:      r.clip_code,
    scheduled_date: r.scheduled_date,
    post_time:      r.post_time,
    platform:       r.platform,
    day_of_week:    DAYS[new Date((r.scheduled_date as string) + 'T00:00:00').getUTCDay()],
  }));
}

export async function POST(request: Request): Promise<NextResponse> {
  const dashboardSecret = process.env.DASHBOARD_SECRET;
  if (!dashboardSecret) {
    return NextResponse.json({ error: 'DASHBOARD_SECRET not configured' }, { status: 500 });
  }
  if (request.headers.get('x-dashboard-secret') !== dashboardSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }

  try {
    // 1. Gather data
    const raw = await gatherAnalysisData('youtube', 30);

    if (raw.posts.length === 0) {
      return NextResponse.json({ error: 'No data to analyze' }, { status: 400 });
    }

    // 2. Build Claude-friendly payload
    const clipsSummary     = aggregatePostsByClip(raw.posts as Record<string, unknown>[]);
    const dailyPerformance = buildDailyPerformance(raw.posts as Record<string, unknown>[]);
    const breakdowns       = buildBreakdowns(raw.breakdowns as Record<string, unknown>[], raw.dateRangeEnd);
    const schedule         = summarizeSchedule(raw.scheduledPosts as Record<string, unknown>[]);
    const clipTitles       = Object.fromEntries(
      (raw.clipDetails as Record<string, unknown>[]).map(r => [
        r.clip_details_code as string,
        (r.title ?? r.caption_youtube_title ?? r.clip_details_code) as string,
      ])
    );

    const totalViews        = clipsSummary.reduce((s, c) => s + c.total_views, 0);
    const totalWatchTimeHrs = Math.round(clipsSummary.reduce((s, c) => s + c.total_watch_time_hours, 0) * 10) / 10;

    const analysisInput = {
      overview: {
        platform:               'YouTube Shorts',
        date_range:             `${raw.dateRangeStart} to ${raw.dateRangeEnd}`,
        total_clips:            clipsSummary.length,
        total_views:            totalViews,
        total_watch_time_hours: totalWatchTimeHrs,
      },
      clips_summary:     clipsSummary,
      daily_performance: dailyPerformance,
      clip_titles:       clipTitles,
      breakdowns,
      posting_schedule:  schedule,
    };

    // 3. Estimate input token size before sending
    const inputJson = JSON.stringify(analysisInput);
    const estimatedInputTokens = Math.round(inputJson.length / 4);
    console.log(`[insights/analyze] payload: ${inputJson.length} chars, ~${estimatedInputTokens} estimated tokens`);
    if (estimatedInputTokens > 150000) {
      console.warn(`[insights/analyze] WARNING: estimated input tokens (${estimatedInputTokens}) exceeds 150k — proceeding anyway`);
    }

    // 4. Call Anthropic
    const systemPrompt = `You are a performance marketing analyst specializing in YouTube Shorts strategy for B2B content channels. Your audience is media buyers and D2C performance marketers who care about data-driven decisions.

Produce a structured analysis with exactly these 8 sections using H2 markdown headers:

## Executive Summary
2-3 sentences covering the most important takeaway about overall channel health.

## Top Performers
List the top 3-5 clips with their clip codes, view counts, and a specific "why" — what made each one work (hook angle, topic, timing, format).

## Underperformers
List the bottom 3-5 clips with specific hypotheses for why each underperformed (not just low views — explain the probable cause).

## Trends
Identify week-over-week or month-over-month patterns. Are newer clips outperforming older ones? Is there a momentum shift?

## Traffic & Distribution
Analyze the traffic source and playback location data. Where is this audience coming from and what does that mean for strategy?

## Audience Insights
Analyze subscribed vs. unsubscribed split, device distribution, and geographic patterns. What does this audience profile tell us?

## Posting Schedule Analysis
Correlate posting days/times with performance. Are there patterns between when clips were posted and how they performed?

## Recommendations
Give 3-5 specific, actionable recommendations. Each must reference a specific data point from the analysis. Start each with a verb.

Rules:
- Use concrete numbers from the data — no generalities
- Call out anomalies and patterns the user might miss
- Be direct. No hedging language like "might", "could be", "possibly", or "it seems"
- Clip codes like MBM016-CLIP-004 are the identifiers — use them
- The channel is MediaBuying.com focused on performance marketing education for media buyers

You have access to both per-clip totals (clips_summary) and raw daily data (daily_performance). Use daily_performance to identify trends, momentum shifts, and day-level patterns that per-clip totals would hide. Use breakdowns.daily_top3 to spot shifts in traffic sources, devices, or subscriber mix over the last 14 days.`;

    const userPrompt = `Analyze the following data for my YouTube Shorts channel over the past 30 days:

<data>
${JSON.stringify(analysisInput, null, 2)}
</data>

Produce the structured analysis with all 8 sections requested in the system prompt.`;

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        temperature: 0.7,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      throw new Error(`Anthropic API error ${anthropicRes.status}: ${errText}`);
    }

    const anthropicData = await anthropicRes.json() as AnthropicResponse;
    const markdown  = anthropicData.content[0]?.text ?? '';
    const tokensUsed = (anthropicData.usage?.input_tokens ?? 0) + (anthropicData.usage?.output_tokens ?? 0);

    // 4. Persist
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: inserted, error: insertError } = await supabase
      .from('performance_analyses')
      .insert({
        platform:          'youtube',
        date_range_start:  raw.dateRangeStart,
        date_range_end:    raw.dateRangeEnd,
        analysis_markdown: markdown,
        input_summary:     { total_clips: clipsSummary.length, total_views: totalViews },
        model_used:        'claude-sonnet-4-20250514',
        tokens_used:       tokensUsed,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Failed to save analysis:', insertError);
    }

    return NextResponse.json({
      analysisId:  (inserted as { id: number } | null)?.id ?? null,
      markdown,
      tokensUsed,
    });

  } catch (err) {
    console.error('insights/analyze error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
