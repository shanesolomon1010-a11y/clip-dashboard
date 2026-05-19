import { NextResponse } from 'next/server';
import { runYouTubeSync } from '@/lib/youtube-sync';
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

  const runId = await startCronRun('youtube-sync');
  try {
    const { rowsProcessed, breakdownsProcessed } = await runYouTubeSync();
    await finishCronRun(runId, 'success', {
      rows_processed: rowsProcessed,
      metadata: { breakdownsProcessed },
    });
    return NextResponse.json({ rowsProcessed, breakdownsProcessed });
  } catch (err) {
    const msg = (err as Error).message;
    await finishCronRun(runId, 'failed', { error_message: msg });
    console.error('cron youtube-sync error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
