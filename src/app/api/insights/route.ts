import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 120;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const GEMINI_KEY = process.env.GEMINI_API_KEY!;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY!;

interface PostRow {
  clip_details_code: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  avg_view_percentage: number | null;
  avg_view_duration_seconds: number | null;
  stat_date: string | null;
  posted_at: string | null;
}

interface AggBuilder {
  clip_details_code: string;
  total_views: number;
  total_likes: number;
  total_comments: number;
  total_shares: number;
  pct_sum: number;
  pct_count: number;
  dur_sum: number;
  dur_count: number;
  latest_stat_date: string | null;
  posted_at: string | null;
}

interface ClipAggregate {
  clip_details_code: string;
  total_views: number;
  total_likes: number;
  total_comments: number;
  total_shares: number;
  avg_view_percentage: number | null;
  avg_view_duration_seconds: number | null;
  latest_stat_date: string | null;
  posted_at: string | null;
  video_url: string;
}

interface GeminiCandidate {
  content?: {
    parts?: Array<{ text?: string }>;
  };
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
}

interface AnthropicContent {
  type: string;
  text: string;
}

interface AnthropicResponse {
  content: AnthropicContent[];
}

interface BatchSummary {
  batch: string;
  total_views: number;
  avg_retention: number | null;
  top_clip: string;
  clip_count: number;
  assessment: string;
}

interface ClaudeBatchItem {
  batch: string;
  assessment: string;
}

function getBatchName(code: string): string {
  const idx = code.indexOf('-CLIP-');
  return idx >= 0 ? code.slice(0, idx) : code;
}

async function analyzeWithGemini(clipCode: string, videoUrl: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                fileData: {
                  mimeType: 'video/mp4',
                  fileUri: videoUrl,
                },
              },
              {
                text: `Analyze this video clip (${clipCode}) and provide a brief assessment of:
1. Hook strength in the first 3 seconds
2. Where viewer attention likely drops
3. Pacing quality
4. One sentence on overall content quality
Keep your response under 200 words.`,
              },
            ],
          },
        ],
        generationConfig: { maxOutputTokens: 400 },
      }),
    }
  );

  if (!res.ok) throw new Error(`Gemini ${res.status}`);

  const data = await res.json() as GeminiResponse;
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

export async function POST(request: Request) {
  const dashboardSecret = process.env.DASHBOARD_SECRET;
  if (!dashboardSecret || request.headers.get('x-dashboard-secret') !== dashboardSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1. Fetch all posts with a clip_details_code
    const { data: posts, error } = await supabase
      .from('posts')
      .select('clip_details_code, views, likes, comments, shares, avg_view_percentage, avg_view_duration_seconds, stat_date, posted_at')
      .not('clip_details_code', 'is', null);

    if (error) throw error;

    // 2. Aggregate per clip_details_code
    const aggMap = new Map<string, AggBuilder>();

    for (const row of (posts ?? []) as PostRow[]) {
      const code = row.clip_details_code;
      const ex = aggMap.get(code);

      if (!ex) {
        aggMap.set(code, {
          clip_details_code: code,
          total_views: Number(row.views ?? 0),
          total_likes: Number(row.likes ?? 0),
          total_comments: Number(row.comments ?? 0),
          total_shares: Number(row.shares ?? 0),
          pct_sum: row.avg_view_percentage != null ? Number(row.avg_view_percentage) : 0,
          pct_count: row.avg_view_percentage != null ? 1 : 0,
          dur_sum: row.avg_view_duration_seconds != null ? Number(row.avg_view_duration_seconds) : 0,
          dur_count: row.avg_view_duration_seconds != null ? 1 : 0,
          latest_stat_date: row.stat_date,
          posted_at: row.posted_at,
        });
      } else {
        ex.total_views += Number(row.views ?? 0);
        ex.total_likes += Number(row.likes ?? 0);
        ex.total_comments += Number(row.comments ?? 0);
        ex.total_shares += Number(row.shares ?? 0);
        if (row.avg_view_percentage != null) {
          ex.pct_sum += Number(row.avg_view_percentage);
          ex.pct_count += 1;
        }
        if (row.avg_view_duration_seconds != null) {
          ex.dur_sum += Number(row.avg_view_duration_seconds);
          ex.dur_count += 1;
        }
        if (row.stat_date && (!ex.latest_stat_date || row.stat_date > ex.latest_stat_date)) {
          ex.latest_stat_date = row.stat_date;
        }
      }
    }

    // Fetch actual video_url values from clip_details
    const allCodes = Array.from(aggMap.keys());
    const { data: clipDetailRows } = await supabase
      .from('clip_details')
      .select('clip_details_code, video_url')
      .in('clip_details_code', allCodes);
    const videoUrlMap = new Map<string, string>(
      ((clipDetailRows ?? []) as { clip_details_code: string; video_url: string | null }[])
        .filter((r) => r.video_url)
        .map((r) => [r.clip_details_code, r.video_url!])
    );

    const clips: ClipAggregate[] = Array.from(aggMap.values()).map((agg) => ({
      clip_details_code: agg.clip_details_code,
      total_views: agg.total_views,
      total_likes: agg.total_likes,
      total_comments: agg.total_comments,
      total_shares: agg.total_shares,
      avg_view_percentage: agg.pct_count > 0 ? agg.pct_sum / agg.pct_count : null,
      avg_view_duration_seconds: agg.dur_count > 0 ? agg.dur_sum / agg.dur_count : null,
      latest_stat_date: agg.latest_stat_date,
      posted_at: agg.posted_at,
      video_url: videoUrlMap.get(agg.clip_details_code) ?? '',
    }));

    // 3. Compute per-batch summaries from clip aggregates
    interface BatchAgg {
      batch: string;
      total_views: number;
      pct_sum: number;
      pct_count: number;
      clips: ClipAggregate[];
    }

    const batchMap = new Map<string, BatchAgg>();
    for (const clip of clips) {
      const batch = getBatchName(clip.clip_details_code);
      const ex = batchMap.get(batch);
      if (!ex) {
        batchMap.set(batch, {
          batch,
          total_views: clip.total_views,
          pct_sum: clip.avg_view_percentage ?? 0,
          pct_count: clip.avg_view_percentage != null ? 1 : 0,
          clips: [clip],
        });
      } else {
        ex.total_views += clip.total_views;
        if (clip.avg_view_percentage != null) {
          ex.pct_sum += clip.avg_view_percentage;
          ex.pct_count += 1;
        }
        ex.clips.push(clip);
      }
    }

    const batchSummaries: Omit<BatchSummary, 'assessment'>[] = Array.from(batchMap.values()).map((b) => ({
      batch: b.batch,
      total_views: b.total_views,
      avg_retention: b.pct_count > 0 ? b.pct_sum / b.pct_count : null,
      top_clip: b.clips.reduce((best, c) => c.total_views > best.total_views ? c : best).clip_details_code,
      clip_count: b.clips.length,
    }));

    // 4. Call Gemini for each clip in parallel
    const geminiSettled = await Promise.allSettled(
      clips.map((clip) =>
        analyzeWithGemini(clip.clip_details_code, clip.video_url).then((analysis) => ({
          clip_details_code: clip.clip_details_code,
          analysis,
        }))
      )
    );

    const geminiAnalyses = geminiSettled
      .filter(
        (r): r is PromiseFulfilledResult<{ clip_details_code: string; analysis: string }> =>
          r.status === 'fulfilled' && r.value.analysis.length > 0
      )
      .map((r) => r.value);

    // 4. Call Claude for the structured report
    const analyticsPayload = clips.map((c) => ({
      clip_details_code: c.clip_details_code,
      total_views: c.total_views,
      total_likes: c.total_likes,
      total_comments: c.total_comments,
      total_shares: c.total_shares,
      avg_view_percentage: c.avg_view_percentage,
      avg_view_duration_seconds: c.avg_view_duration_seconds,
      latest_stat_date: c.latest_stat_date,
      posted_at: c.posted_at,
    }));

    const claudePrompt = `You are a social media analytics expert. Analyze this YouTube channel's clip performance data and video analyses, then generate a structured insights report.

Analytics data (aggregated per clip):
${JSON.stringify(analyticsPayload, null, 2)}

Gemini video analyses:
${JSON.stringify(geminiAnalyses, null, 2)}

Batch performance data (clips grouped by batch prefix before -CLIP-):
${JSON.stringify(batchSummaries, null, 2)}

Return ONLY a valid JSON object with exactly these fields (no markdown, no explanation):
{
  "summary": "2-3 sentence overall channel performance overview",
  "topPerformers": [
    {"clip_details_code": "...", "reason": "..."},
    {"clip_details_code": "...", "reason": "..."},
    {"clip_details_code": "...", "reason": "..."}
  ],
  "underperformers": [
    {"clip_details_code": "...", "reason": "..."},
    {"clip_details_code": "...", "reason": "..."},
    {"clip_details_code": "...", "reason": "..."}
  ],
  "retentionInsights": "findings about where viewers drop off across clips based on avg_view_percentage and avg_view_duration data",
  "timingInsights": "best performing days/times based on posted_at dates and view velocity",
  "hookAnalysis": "which clips have strong vs weak hooks based on the Gemini video analysis data",
  "recommendations": [
    "actionable recommendation 1",
    "actionable recommendation 2",
    "actionable recommendation 3",
    "actionable recommendation 4",
    "actionable recommendation 5"
  ],
  "batchInsights": [
    {"batch": "BATCH_NAME", "assessment": "one sentence overall assessment of this batch's performance and what it tells you"}
  ]
}

topPerformers: top 3 clips by total_views. underperformers: bottom 3 clips by total_views. recommendations: exactly 5 items. batchInsights: one entry per batch in the batch data, assessment is one sentence only.`;

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 4096,
        messages: [{ role: 'user', content: claudePrompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      throw new Error(`Claude API error ${anthropicRes.status}: ${errText}`);
    }

    const anthropicData = await anthropicRes.json() as AnthropicResponse;
    const rawText = anthropicData.content[0]?.text ?? '{}';
    const cleaned = rawText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();

    const claudeReport = JSON.parse(cleaned) as { batchInsights?: ClaudeBatchItem[] } & Record<string, unknown>;

    // Merge computed batch facts with Claude's per-batch assessments
    const assessmentMap = new Map<string, string>(
      (claudeReport.batchInsights ?? []).map((b) => [b.batch, b.assessment])
    );
    const batchInsights: BatchSummary[] = batchSummaries.map((b) => ({
      ...b,
      assessment: assessmentMap.get(b.batch) ?? '',
    }));

    return NextResponse.json({ ...claudeReport, batchInsights });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
