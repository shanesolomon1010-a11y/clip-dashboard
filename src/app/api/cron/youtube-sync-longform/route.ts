import { NextResponse } from 'next/server';
import { syncLongFormVideos } from '@/lib/youtube-longform-sync';

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
    const summary = await syncLongFormVideos();
    return NextResponse.json(summary);
  } catch (err) {
    const e = err as { message?: string; code?: string; details?: string; hint?: string; stack?: string };
    console.error('cron youtube-sync-longform error:', {
      message: e.message,
      code: e.code,
      details: e.details,
      hint: e.hint,
      stack: e.stack,
    });
    return NextResponse.json({ error: e.message ?? String(err) }, { status: 500 });
  }
}
