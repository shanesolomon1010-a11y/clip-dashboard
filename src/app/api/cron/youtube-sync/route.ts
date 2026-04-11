import { NextResponse } from 'next/server';
import { runYouTubeSync } from '@/lib/youtube-sync';

export async function GET(request: Request): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const rowsProcessed = await runYouTubeSync();
    return NextResponse.json({ rowsProcessed });
  } catch (err) {
    console.error('cron youtube-sync error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
