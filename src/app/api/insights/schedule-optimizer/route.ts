import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { analyzeScheduleSlots, buildRecommendedSchedule } from '@/lib/schedule-analyzer';

export const maxDuration = 60;

interface AnthropicContent  { type: string; text: string; }
interface AnthropicUsage    { input_tokens: number; output_tokens: number; }
interface AnthropicResponse { content: AnthropicContent[]; usage: AnthropicUsage; }

const NARRATIVE_SYSTEM_PROMPT = `You are a YouTube Shorts posting strategy analyst. Given slot performance data and a recommended schedule, write a 2-paragraph markdown narrative explaining WHY this schedule is recommended, what the data shows, and what the confidence levels mean. Be direct. Cite specific numbers.`;

export async function POST(request: Request): Promise<NextResponse> {
  const dashSecret   = process.env.DASHBOARD_SECRET;
  const secretHeader = request.headers.get('x-dashboard-secret');

  if (!dashSecret) {
    return NextResponse.json({ error: 'DASHBOARD_SECRET not configured' }, { status: 500 });
  }
  if (secretHeader !== dashSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    const windowDays = 60;
    const cutoff = new Date(Date.now() - windowDays * 86_400_000).toISOString().split('T')[0];

    // 1. Pull scheduled posts (last 60 days) + all-time posts for lifetime view totals
    const [scheduledRes, postsRes] = await Promise.all([
      supabase
        .from('scheduled_posts')
        .select('clip_code, platform, scheduled_date, post_time, status')
        .eq('platform', 'yt')
        .gte('scheduled_date', cutoff),
      supabase
        .from('posts')
        .select('clip_details_code, views, watch_time_hours')
        .eq('platform', 'youtube'),
    ]);

    if (scheduledRes.error) throw scheduledRes.error;
    if (postsRes.error)     throw postsRes.error;

    const scheduledPosts = (scheduledRes.data ?? []) as Record<string, unknown>[];
    const posts          = (postsRes.data       ?? []) as Record<string, unknown>[];

    if (scheduledPosts.length === 0) {
      return NextResponse.json(
        { error: 'No scheduled posts found in the last 60 days' },
        { status: 400 },
      );
    }

    // 2. Pure-function analytics
    const slotAnalysis        = analyzeScheduleSlots(scheduledPosts, posts);
    const recommendedSchedule = buildRecommendedSchedule(slotAnalysis);

    // 3. Claude narrative (non-fatal — proceed even if Anthropic fails)
    let narrativeMarkdown = '';
    let tokensUsed = 0;

    const narrativeUserPrompt = `Here is the slot performance data and recommended schedule:

<slot_analysis>
${JSON.stringify(slotAnalysis, null, 2)}
</slot_analysis>

<recommended_schedule>
${JSON.stringify(recommendedSchedule, null, 2)}
</recommended_schedule>

Write the 2-paragraph narrative.`;

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system:     NARRATIVE_SYSTEM_PROMPT,
        messages:   [{ role: 'user', content: narrativeUserPrompt }],
      }),
    });

    if (anthropicRes.ok) {
      const anthropicData = await anthropicRes.json() as AnthropicResponse;
      narrativeMarkdown   = anthropicData.content[0]?.text ?? '';
      tokensUsed          = (anthropicData.usage?.input_tokens ?? 0) + (anthropicData.usage?.output_tokens ?? 0);
    } else {
      console.warn(`[schedule-optimizer] Anthropic ${anthropicRes.status} — proceeding without narrative`);
    }

    // 4. Persist
    const { data: inserted, error: insertError } = await supabase
      .from('schedule_recommendations')
      .insert({
        platform:             'youtube',
        analysis_window_days: windowDays,
        slot_analysis:        slotAnalysis,
        recommended_schedule: recommendedSchedule,
        narrative_markdown:   narrativeMarkdown || null,
        tokens_used:          tokensUsed || null,
      })
      .select('id')
      .single();

    if (insertError) console.error('Failed to save schedule recommendation:', insertError);

    return NextResponse.json({
      recommendationId:    (inserted as { id: number } | null)?.id ?? null,
      slotAnalysis,
      recommendedSchedule,
      narrativeMarkdown,
      tokensUsed,
    });

  } catch (err) {
    console.error('schedule-optimizer error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
