import { NextResponse } from 'next/server';
import { syncLongFormVideos } from '@/lib/youtube-longform-sync';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request): Promise<NextResponse> {
  const dashboardSecret = process.env.DASHBOARD_SECRET;
  if (!dashboardSecret) {
    return NextResponse.json({ error: 'DASHBOARD_SECRET not configured' }, { status: 500 });
  }
  if (request.headers.get('x-dashboard-secret') !== dashboardSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await syncLongFormVideos();
    return NextResponse.json(summary);
  } catch (err) {
    const e = err as { message?: string; code?: string; details?: string; hint?: string; stack?: string };
    console.error('youtube-sync-longform error:', {
      message: e.message,
      code: e.code,
      details: e.details,
      hint: e.hint,
      stack: e.stack,
    });
    return NextResponse.json({ error: e.message ?? String(err) }, { status: 500 });
  }
}

export async function GET(): Promise<NextResponse> {
  const { data, error } = await supabase
    .from('long_form_videos')
    .select('*')
    .order('published_at', { ascending: false });

  if (error) {
    console.error('youtube-sync-longform GET Supabase error:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ videos: data ?? [] });
}
