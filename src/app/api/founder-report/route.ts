import { NextResponse } from 'next/server';
import { buildFounderReport, FounderReportInputError } from '@/lib/founder-report';

export async function GET(request: Request): Promise<NextResponse> {
  const dashboardSecret = process.env.DASHBOARD_SECRET;
  if (!dashboardSecret) {
    return NextResponse.json({ error: 'DASHBOARD_SECRET not configured' }, { status: 500 });
  }
  if (request.headers.get('x-dashboard-secret') !== dashboardSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate') ?? undefined;
  const endDate = searchParams.get('endDate') ?? undefined;
  const windowParam = searchParams.get('window');
  const windowDays = windowParam === '7' ? 7 : windowParam === '30' ? 30 : undefined;

  try {
    const result = await buildFounderReport({ startDate, endDate, window: windowDays });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof FounderReportInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const e = err as { message?: string; code?: string; details?: string; hint?: string; stack?: string };
    console.error('[founder-report]', {
      message: e.message,
      code: e.code,
      details: e.details,
      hint: e.hint,
      stack: e.stack,
    });
    return NextResponse.json({ error: 'founder-report failed' }, { status: 500 });
  }
}
