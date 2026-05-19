import { NextResponse } from 'next/server';
import { buildDiagnostics } from '@/lib/diagnostics';

function parseNumberParam(v: string | null, fallback: number): number {
  if (v === null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);

  try {
    const body = await buildDiagnostics({
      driftPctRed: parseNumberParam(searchParams.get('drift_pct_red'), 10),
      driftPctYellow: parseNumberParam(searchParams.get('drift_pct_yellow'), 5),
      freshnessHoursRed: parseNumberParam(searchParams.get('freshness_hours_red'), 24),
      freshnessHoursYellow: parseNumberParam(searchParams.get('freshness_hours_yellow'), 12),
      driftWindowDays: parseNumberParam(searchParams.get('drift_window_days'), 7),
    });

    return new NextResponse(JSON.stringify(body), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
      },
    });
  } catch (err) {
    console.error('[diagnostics] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
