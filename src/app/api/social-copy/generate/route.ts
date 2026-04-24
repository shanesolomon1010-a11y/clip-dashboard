import { NextResponse } from 'next/server';
import { CREATIVELAUNCH_FRAMEWORK } from '@/lib/creativelaunch-framework';
import { saveSocialCopyGeneration } from '@/lib/social-copy-db';

export const maxDuration = 120;

interface AnthropicContent { type: string; text: string; }
interface AnthropicUsage   { input_tokens: number; output_tokens: number; }
interface AnthropicResponse { content: AnthropicContent[]; usage: AnthropicUsage; }

function buildSystemPrompt(): string {
  return `You are a direct response copywriter creating social copy for MediaBuying.com, a YouTube Shorts channel focused on performance marketing education for media buyers and D2C performance marketers.

Your job is to generate 5 pieces of social copy from a podcast transcript, following the CreativeLaunch Edition framework below.

IMPORTANT: The CreativeLaunch framework is your SOLE source of truth for tone, principles, and structure. Follow it with precision. Every piece of copy you produce must embody its 9 principles: specific over vague, show don't tell, emotional truth, follow the template, sell the outcome, kill assumptions, cut ruthlessly, real numbers, lead with transformation.

<creativelaunch_framework>
${CREATIVELAUNCH_FRAMEWORK}
</creativelaunch_framework>

YOUR OUTPUT MUST BE STRICTLY FORMATTED AS FOLLOWS — use these exact section markers so the parser can extract each piece:

===HEADLINE_BANNER===
[A short, punchy overlay text that would appear as a graphic on the video. Maximum 8-12 words. This is the visual headline viewers see first.]

===QUESTION_BANNER===
[A question or provocation that frames the clip's angle. Different from the headline — this is the hook the content answers. Maximum 10-15 words.]

===YOUTUBE_TITLE===
[YouTube Shorts title, maximum 60 characters. Must be specific, not vague. Should pass the "would someone click this?" test.]

===YOUTUBE_DESCRIPTION===
[2-3 sentences for the YouTube Shorts description. Include one key insight and one reason to watch the full episode. No hashtags in YouTube description.]

===INSTAGRAM_CAPTION===
[Instagram Reels caption in native line-break style. One thought per line. Empty lines between beats. Close with "Full ep link in bio" on its own line. Single hashtag at the end: #metaads]

Rules specific to this format:
- Do NOT include any preamble, explanation, or commentary before or after the sections
- Do NOT include the === markers as part of the content (they are delimiters only)
- The Instagram caption must use real line breaks between thoughts, not dashes or bullets
- No emojis anywhere unless the transcript itself heavily uses them
- No clichéd phrases like "game-changer," "deep dive," or "let's talk about" — these violate CreativeLaunch Principle 3 (emotional truth)
- Clip codes like MBM018-CLIP-004 are for internal reference — never include them in the copy itself`;
}

function buildUserPrompt(
  clip_code: string,
  transcript: string,
  episode_context?: string,
  additional_notes?: string,
): string {
  return `Generate social copy for the following podcast clip.

Clip code: ${clip_code}
${episode_context ? `Episode context: ${episode_context}` : ''}

Transcript:
${transcript}

${additional_notes ? `Additional notes: ${additional_notes}` : ''}

Produce all 5 copy pieces following the exact format specified in the system prompt.`;
}

function parseSections(raw: string): {
  headline_banner: string;
  question_banner: string;
  youtube_title: string;
  youtube_description: string;
  instagram_caption: string;
} | null {
  const MARKERS = [
    'HEADLINE_BANNER',
    'QUESTION_BANNER',
    'YOUTUBE_TITLE',
    'YOUTUBE_DESCRIPTION',
    'INSTAGRAM_CAPTION',
  ] as const;

  const extracted: Record<string, string> = {};

  for (let i = 0; i < MARKERS.length; i++) {
    const marker = MARKERS[i];
    const start = raw.indexOf(`===${marker}===`);
    if (start === -1) return null;

    const contentStart = start + `===${marker}===`.length;
    const nextMarkerIdx = i + 1 < MARKERS.length
      ? raw.indexOf(`===${MARKERS[i + 1]}===`, contentStart)
      : raw.length;

    if (nextMarkerIdx === -1) return null;

    const content = raw.slice(contentStart, nextMarkerIdx).trim();
    if (!content) return null;

    extracted[marker] = content;
  }

  return {
    headline_banner:    extracted['HEADLINE_BANNER'],
    question_banner:    extracted['QUESTION_BANNER'],
    youtube_title:      extracted['YOUTUBE_TITLE'],
    youtube_description: extracted['YOUTUBE_DESCRIPTION'],
    instagram_caption:  extracted['INSTAGRAM_CAPTION'],
  };
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

  const body = await request.json() as {
    clip_code?: string;
    episode_context?: string;
    transcript?: string;
    additional_notes?: string;
  };

  const { clip_code, episode_context, transcript, additional_notes } = body;

  if (!clip_code?.trim()) {
    return NextResponse.json({ error: 'clip_code is required' }, { status: 400 });
  }
  if (!transcript?.trim()) {
    return NextResponse.json({ error: 'transcript is required' }, { status: 400 });
  }

  const systemPrompt = buildSystemPrompt();
  const userPrompt   = buildUserPrompt(clip_code, transcript, episode_context, additional_notes);

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      temperature: 0.8,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!anthropicRes.ok) {
    const err = await anthropicRes.text();
    return NextResponse.json({ error: `Anthropic API error: ${err}` }, { status: 502 });
  }

  const anthropicData = await anthropicRes.json() as AnthropicResponse;
  const rawText = anthropicData.content.find(c => c.type === 'text')?.text ?? '';
  const tokensUsed = (anthropicData.usage.input_tokens ?? 0) + (anthropicData.usage.output_tokens ?? 0);

  const sections = parseSections(rawText);
  if (!sections) {
    return NextResponse.json({ error: 'Incomplete response from Claude' }, { status: 500 });
  }

  const id = await saveSocialCopyGeneration({
    clip_code,
    episode_context: episode_context ?? null,
    transcript,
    additional_notes: additional_notes ?? null,
    headline_banner:    sections.headline_banner,
    question_banner:    sections.question_banner,
    youtube_title:      sections.youtube_title,
    youtube_description: sections.youtube_description,
    instagram_caption:  sections.instagram_caption,
    raw_response: rawText,
    model_used: 'claude-sonnet-4-20250514',
    tokens_used: tokensUsed,
  });

  return NextResponse.json({
    id,
    headline_banner:    sections.headline_banner,
    question_banner:    sections.question_banner,
    youtube_title:      sections.youtube_title,
    youtube_description: sections.youtube_description,
    instagram_caption:  sections.instagram_caption,
    tokens_used: tokensUsed,
  });
}
