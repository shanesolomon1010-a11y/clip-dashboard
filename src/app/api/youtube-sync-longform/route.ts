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
    console.error('youtube-sync-longform error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function GET(): Promise<NextResponse> {
  const { data, error } = await supabase
    .from('long_form_videos')
    .select('*')
    .order('published_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ videos: data ?? [] });
}
