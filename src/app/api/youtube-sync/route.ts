import { NextResponse } from 'next/server';
import { runYouTubeSync } from '@/lib/youtube-sync';

export async function POST(request: Request): Promise<NextResponse> {
  const dashboardSecret = process.env.DASHBOARD_SECRET;
  if (!dashboardSecret) {
    return NextResponse.json({ error: 'DASHBOARD_SECRET not configured' }, { status: 500 });
  }
  if (request.headers.get('x-dashboard-secret') !== dashboardSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const rowsProcessed = await runYouTubeSync();
    return NextResponse.json({ rowsProcessed });
  } catch (err) {
    console.error('youtube-sync error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
