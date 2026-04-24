import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { gatherWeeklyData } from '@/lib/insights-db';
import {
  aggregatePostsByClip,
  buildDailyPerformance,
  buildBreakdowns,
  summarizeSchedule,
} from '@/lib/insights-helpers';

export const maxDuration = 120;

interface AnthropicContent { type: string; text: string; }
interface AnthropicUsage   { input_tokens: number; output_tokens: number; }
interface AnthropicResponse { content: AnthropicContent[]; usage: AnthropicUsage; }

function describeChange(current: number, previous: number, unit = ''): {
  current: number;
  previous: number;
  absolute_delta: number;
  percent_delta: number | null;
  direction: 'rose' | 'fell' | 'held steady';
  arrow: '↑' | '↓' | '→';
  formatted_sentence: string;
} {
  const delta = current - previous;
  const pct = previous === 0 ? null : (delta / previous) * 100;
  const direction = delta > 0 ? 'rose' : delta < 0 ? 'fell' : 'held steady';
  const arrow     = delta > 0 ? '↑'    : delta < 0 ? '↓'    : '→';
  const pctStr    = pct === null ? 'n/a' : `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
  const deltaStr  = `${delta >= 0 ? '+' : ''}${delta.toFixed(unit === 's' ? 1 : 1)}${unit}`;
  const formatted_sentence = `${direction} from ${previous.toFixed(1)}${unit} to ${current.toFixed(1)}${unit} (${deltaStr}, ${pctStr})`;
  return { current, previous, absolute_delta: delta, percent_delta: pct, direction, arrow, formatted_sentence };
}

function buildWeekPayload(
  week: {
    start: string; end: string;
    posts: Record<string, unknown>[];
    breakdowns: Record<string, unknown>[];
    scheduledPosts: Record<string, unknown>[];
  },
  endDateForBreakdowns: string,
) {
  const posts = week.posts as Record<string, unknown>[];
  return {
    start:             week.start,
    end:               week.end,
    days_count:        7,
    clips_summary:     aggregatePostsByClip(posts),
    daily_performance: buildDailyPerformance(posts),
    breakdowns:        buildBreakdowns(week.breakdowns as Record<string, unknown>[], endDateForBreakdowns),
    posting_schedule:  summarizeSchedule(week.scheduledPosts as Record<string, unknown>[]),
  };
}

const SYSTEM_PROMPT = `You are a performance marketing analyst producing a weekly report for a YouTube Shorts channel (MediaBuying.com). This is a WEEKLY report focused on what CHANGED between the previous week and the current week — not a comprehensive analysis.

Produce a structured report with exactly these 6 sections using H2 markdown headers:

## The Week in Numbers
Use the pre-computed week_comparison data. For each metric, write a single sentence using the exact formatted_sentence value provided in the data. Append the arrow character after the sentence. Do NOT recompute direction — the direction, delta, and percent are already calculated for you. Your job is only to present them readably.

Example format: "Total views fell from 923.0 to 592.0 (-331.0, -35.9%) ↓"

## What Changed
Specific shifts between the two weeks. Focus on behavioral and distributional shifts, not just metric movement. Examples of good shifts: traffic source mix shifting, device mix shifting, subscribed share changing, average view duration drifting. Cite specific numbers from both weeks.

## This Week's Wins
2-3 clips that meaningfully outperformed. Rank by how much they exceeded expectations (a clip with 200 views might be a bigger win than one with 400, depending on context). For each: clip code, views, what made it work.

## This Week's Drags
2-3 clips that meaningfully underperformed expectations. For each: clip code, views, specific hypothesis for why. Do not list every low-view clip — only ones where underperformance is notable given their context.

## Emerging Patterns
Early signals from this week worth watching. Not yet confirmed trends. Frame as "X happened N times this week that didn't happen last week" or "Y is starting to show up." Keep each signal to 1-2 sentences.

## The One Thing
ONE specific, highest-leverage action to take next week. Not a list. Not 5 recommendations. The single most important move. Force prioritization. Start with a verb.

Rules:
- Use concrete numbers from both weeks — comparisons require numbers from each side
- Be direct. No hedging language
- Clip codes like MBM016-CLIP-004 are identifiers — use them
- The channel is MediaBuying.com, focused on performance marketing education for media buyers
- This report is read by the channel manager on Monday morning for the previous week — write it for that audience
- Anomalies (like 100%+ retention) are data quirks, not insights — do not treat them as meaningful signal
- Each section should be concise: this is a weekly check-in, not a deep dive
- The One Thing must be a singular action, not a list
- Flag data anomalies, do not treat them as insights. Retention percentages above 100%, negative counts, or other impossible values are data artifacts (typically from viewer rewatches). Call them out as anomalies if relevant, but never use them as evidence of content quality.
- For the "Week in Numbers" section, use the pre-computed formatted_sentence values from week_comparison. For all other comparisons (in What Changed, Wins, Drags sections), follow this rule: direction verb must match the sign of the delta. Positive delta uses rose/grew/increased; negative delta uses fell/dropped/declined. No exceptions.`;

export async function POST(request: Request): Promise<NextResponse> {
  // Dual auth: cron bearer OR dashboard secret
  let triggeredBy: string | null = null;

  const authHeader   = request.headers.get('authorization');
  const secretHeader = request.headers.get('x-dashboard-secret');
  const cronSecret   = process.env.CRON_SECRET;
  const dashSecret   = process.env.DASHBOARD_SECRET;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    triggeredBy = 'cron';
  } else if (dashSecret && secretHeader === dashSecret) {
    triggeredBy = 'manual';
  } else {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }

  try {
    // 1. Gather two weeks of data
    const raw = await gatherWeeklyData('youtube');

    if (raw.currentWeek.posts.length === 0 && raw.previousWeek.posts.length === 0) {
      return NextResponse.json({ error: 'No data to generate report' }, { status: 400 });
    }

    // 2. Build payload — use current week's end date as the breakdowns reference
    const clipTitles = Object.fromEntries(
      (raw.clipDetails as Record<string, unknown>[]).map(r => [
        r.clip_details_code as string,
        (r.title ?? r.caption_youtube_title ?? r.clip_details_code) as string,
      ])
    );

    const payload = {
      platform:      'YouTube Shorts',
      current_week:  buildWeekPayload(raw.currentWeek,  raw.currentWeek.end),
      previous_week: buildWeekPayload(raw.previousWeek, raw.currentWeek.end),
      clip_titles:   clipTitles,
    };

    // Pre-compute headline comparisons so Claude receives exact direction labels
    const curCS  = payload.current_week.clips_summary;
    const prevCS = payload.previous_week.clips_summary;
    const durAvg = (cs: typeof curCS) => {
      const d = cs.filter(c => c.avg_view_duration_s !== null);
      return d.length ? d.reduce((s, c) => s + (c.avg_view_duration_s ?? 0), 0) / d.length : 0;
    };
    const payloadFull = {
      ...payload,
      week_comparison: {
        total_views:               describeChange(
          curCS.reduce((s, c)  => s + c.total_views, 0),
          prevCS.reduce((s, c) => s + c.total_views, 0),
        ),
        total_watch_time_hours:    describeChange(
          curCS.reduce((s, c)  => s + c.total_watch_time_hours, 0),
          prevCS.reduce((s, c) => s + c.total_watch_time_hours, 0),
          'h',
        ),
        avg_view_duration_seconds: describeChange(durAvg(curCS), durAvg(prevCS), 's'),
        new_clips_posted:          describeChange(curCS.length, prevCS.length),
      },
    };

    // 3. Estimate token size
    const payloadJson           = JSON.stringify(payloadFull);
    const estimatedInputTokens  = Math.round(payloadJson.length / 4);
    console.log(`[weekly-report] payload: ${payloadJson.length} chars, ~${estimatedInputTokens} estimated tokens, triggered_by=${triggeredBy}`);
    if (estimatedInputTokens > 150000) {
      console.warn(`[weekly-report] WARNING: estimated input tokens (${estimatedInputTokens}) exceeds 150k — proceeding anyway`);
    }

    // 4. Call Anthropic
    const userPrompt = `Generate the weekly report based on the following two weeks of data:

<data>
${JSON.stringify(payloadFull, null, 2)}
</data>

Produce the 6-section weekly report as specified.`;

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:       'claude-sonnet-4-20250514',
        max_tokens:  3000,
        temperature: 0.7,
        system:      SYSTEM_PROMPT,
        messages:    [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      throw new Error(`Anthropic API error ${anthropicRes.status}: ${errText}`);
    }

    const anthropicData = await anthropicRes.json() as AnthropicResponse;
    const markdown       = anthropicData.content[0]?.text ?? '';
    const tokensUsed     = (anthropicData.usage?.input_tokens ?? 0) + (anthropicData.usage?.output_tokens ?? 0);

    // 5. Persist
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: inserted, error: insertError } = await supabase
      .from('weekly_reports')
      .insert({
        platform:        'youtube',
        week_start:      raw.currentWeek.start,
        week_end:        raw.currentWeek.end,
        report_markdown: markdown,
        input_summary: {
          current_week_clips:  (payload.current_week.clips_summary as unknown[]).length,
          previous_week_clips: (payload.previous_week.clips_summary as unknown[]).length,
          current_week_views:  (payload.current_week.clips_summary as { total_views: number }[])
            .reduce((s, c) => s + c.total_views, 0),
        },
        model_used:   'claude-sonnet-4-20250514',
        tokens_used:  tokensUsed,
        triggered_by: triggeredBy,
      })
      .select('id')
      .single();

    if (insertError) console.error('Failed to save weekly report:', insertError);

    return NextResponse.json({
      reportId:   (inserted as { id: number } | null)?.id ?? null,
      markdown,
      tokensUsed,
      weekStart:  raw.currentWeek.start,
      weekEnd:    raw.currentWeek.end,
    });

  } catch (err) {
    console.error('weekly-report error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
