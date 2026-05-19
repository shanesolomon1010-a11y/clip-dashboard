import { NextResponse } from 'next/server';
import { syncLongFormVideos } from '@/lib/youtube-longform-sync';
import { startCronRun, finishCronRun } from '@/lib/cron-runs';

export async function GET(request: Request): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const runId = await startCronRun('youtube-sync-longform');
  try {
    const summary = await syncLongFormVideos();
    const status = summary.errors > 0 ? 'partial' : 'success';
    await finishCronRun(runId, status, {
      rows_processed: summary.synced,
      errors: summary.errors,
      error_message:
        summary.errors > 0
          ? JSON.stringify(summary.errorDetails).slice(0, 1000)
          : undefined,
      metadata: { discovered: summary.discovered },
    });
    return NextResponse.json(summary);
  } catch (err) {
    const e = err as { message?: string; code?: string; details?: string; hint?: string; stack?: string };
    await finishCronRun(runId, 'failed', { error_message: e.message ?? String(err) });
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
