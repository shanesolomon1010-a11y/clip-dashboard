import { NextResponse } from 'next/server';
import mammoth from 'mammoth';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '@/lib/supabase';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY,
});

interface ClipExtracted {
  clip_details_code: string;
  headline: string;
  banner: string;
  youtube_title: string;
  youtube_caption: string;
  instagram_caption: string;
}

const SYSTEM_PROMPT = 'You are a data extraction assistant. Extract clip data from this document. For each clip, return a JSON array where each object has these exact keys: clip_details_code, headline, banner, youtube_title, youtube_caption, instagram_caption. The clip_details_code is the clip identifier like MBM016-CLIP-001. The headline is the HEADLINE BANNER value. The banner is the QUESTION BANNER value. The youtube_title is the YOUTUBE SHORTS TITLE value. The youtube_caption is the YOUTUBE SHORTS DESCRIPTION value (exclude hashtags). The instagram_caption is the INSTAGRAM REELS CAPTION value. Return ONLY the JSON array, no other text.';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { file: string };
    const { file: base64 } = body;

    // Extract text from docx
    const buffer = Buffer.from(base64, 'base64');
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value;

    // Split into individual clip sections
    const sections = text.split(/(?=MBM\d{3}-CLIP-\d{3})/).filter(s => s.trim().length > 0);

    // Group into batches of 10
    const batches: string[] = [];
    for (let i = 0; i < sections.length; i += 10) {
      batches.push(sections.slice(i, i + 10).join('\n\n'));
    }

    console.log('sections.length:', sections.length);
    console.log('batches.length:', batches.length);

    // Extract clips from each batch
    const allClips: ClipExtracted[] = [];
    for (const batchText of batches) {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: batchText }],
      });

      const responseText = (message.content[0] as { type: string; text: string }).text.trim();
      console.log('Anthropic raw response:', responseText);

      const match = responseText.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('No JSON array found in response');
      const clips = JSON.parse(match[0]) as ClipExtracted[];
      allClips.push(...clips);
    }

    // Check which clip_details_codes already exist
    const codes = allClips.map(c => c.clip_details_code);
    const { data: existing } = await supabase
      .from('clip_details')
      .select('clip_details_code')
      .in('clip_details_code', codes);

    const existingCodes = new Set((existing ?? []).map((r: { clip_details_code: string }) => r.clip_details_code));

    // Build rows to upsert
    const rows = allClips.map(clip => ({
      clip_details_code: clip.clip_details_code,
      clip_code: clip.clip_details_code.split('-')[0],
      headline_banner: clip.headline || null,
      question_banner: clip.banner || null,
      caption_youtube_title: clip.youtube_title || null,
      caption_youtube: clip.youtube_caption || null,
      caption_instagram: clip.instagram_caption || null,
    }));

    const { error: upsertError } = await supabase
      .from('clip_details')
      .upsert(rows, { onConflict: 'clip_details_code', ignoreDuplicates: false });

    if (upsertError) {
      console.error('Upsert error:', JSON.stringify(upsertError));
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    const inserted = allClips.filter(c => !existingCodes.has(c.clip_details_code)).length;
    const updated = allClips.filter(c => existingCodes.has(c.clip_details_code)).length;

    return NextResponse.json({
      inserted,
      updated,
      clips: allClips.map(c => ({
        clip_details_code: c.clip_details_code,
        headline: c.headline,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
