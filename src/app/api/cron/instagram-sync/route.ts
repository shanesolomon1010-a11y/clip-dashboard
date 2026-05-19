import { NextResponse } from 'next/server';
import { runInstagramSync } from '@/lib/instagram-sync';
import { startCronRun, finishCronRun } from '@/lib/cron-runs';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const runId = await startCronRun('instagram-sync');
  try {
    const result = await runInstagramSync();
    await finishCronRun(runId, 'success', {
      rows_processed: result.rowsProcessed,
      metadata: {
        mediaProcessed: result.mediaProcessed,
        commentsIngested: result.commentsIngested,
        repliesIngested: result.repliesIngested,
        tokenRefreshed: result.tokenRefreshed,
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    const msg = (err as Error).message;
    await finishCronRun(runId, 'failed', { error_message: msg });
    console.error('cron instagram-sync error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
