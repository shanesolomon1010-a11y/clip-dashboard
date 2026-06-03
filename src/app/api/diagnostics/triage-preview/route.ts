import { NextResponse } from 'next/server';
import { buildDiagnostics } from '@/lib/diagnostics';
import { runDiagnosticsTriage } from '@/lib/diagnostics-triage';

export const dynamic = 'force-dynamic';
// The Anthropic triage call can take several seconds; give it headroom.
export const maxDuration = 60;

// On-demand validation of the AI triage output, without waiting for a real RED.
// Access model is identical to /api/diagnostics: no custom auth gate — Vercel
// deployment protection is the gate. Read-only: builds live diagnostics, reads
// cron_runs, makes ONE Anthropic call. Does NOT post to Slack and does NOT
// start/finish/write any cron_runs row.

// Canonical dropped-tick RED set, used when ?paths is not supplied.
const DEFAULT_RED_PATHS = [
  'cron_health.last_youtube_sync_short.status',
  'data_freshness.posts_short_latest_stat.status',
  'cron_completion.youtube_sync.status',
];

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);

  const pathsParam = searchParams.get('paths');
  const redPaths = pathsParam
    ? pathsParam.split(',').map((p) => p.trim()).filter((p) => p.length > 0)
    : DEFAULT_RED_PATHS;

  try {
    const diagnostics = await buildDiagnostics();
    const triage = await runDiagnosticsTriage(diagnostics, redPaths);
    return NextResponse.json({ redPaths, triage });
  } catch (err) {
    console.error('[diagnostics/triage-preview] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
