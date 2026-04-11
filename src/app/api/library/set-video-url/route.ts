import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  const body = await request.json() as { clip_details_code?: string; video_url?: string };
  const { clip_details_code, video_url } = body;

  if (!clip_details_code || !video_url) {
    return NextResponse.json({ error: 'clip_details_code and video_url are required' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await supabase
    .from('clip_details')
    .update({ video_url })
    .eq('clip_details_code', clip_details_code);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
