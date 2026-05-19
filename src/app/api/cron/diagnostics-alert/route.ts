import { NextResponse } from 'next/server';
import { buildDiagnostics } from '@/lib/diagnostics';

export const dynamic = 'force-dynamic';

// Paths into the diagnostics response that read RED by design and should not
// alert. The Playwright LaunchAgent scraper was deleted 2026-05-18 (per
// CLAUDE.md). Four checks are downstream of that deletion and will read RED
// forever: last_scraper_run, scraper_history, studio_snapshots_latest_stat,
// and coverage (compares posts vs studio_snapshots clip sets — the latter
// stops growing, so missing-from-studio accumulates over time).
const KNOWN_RED_PATHS = new Set([
  'cron_health.last_scraper_run.status',
  'scraper_history.status',
  'data_freshness.studio_snapshots_latest_stat.status',
  'coverage.status',
]);

interface AnyObject { [k: string]: unknown }

function collectRedPaths(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj as AnyObject)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (k === 'status' && v === 'red' && !KNOWN_RED_PATHS.has(path)) {
      out.push(path);
    } else if (typeof v === 'object' && v !== null) {
      out.push(...collectRedPaths(v, path));
    }
  }
  return out;
}

async function postToSlack(webhook: string, text: string): Promise<void> {
  await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
}

export async function GET(request: Request): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const webhook = process.env.SLACK_DIAGNOSTICS_WEBHOOK;
  if (!webhook) {
    return NextResponse.json({ skipped: true, reason: 'webhook not configured' });
  }

  const origin = new URL(request.url).origin;

  // Direct in-process call — no HTTP hop. Prior approach (fetch ${origin}/api/diagnostics
  // with Bearer header) was blocked by Vercel deployment-protection on the cron-alias
  // domain regardless of the Bearer; 1 AM and 7 AM scheduled ticks both 401'd on
  // 2026-05-19 confirming the workaround doesn't hold. The internal_consistency check
  // still makes a sub-fetch to /api/founder-report and may hit the same 401 in cron
  // context — accept it for now, mute internal_consistency.status if it stays RED.
  let data: unknown;
  try {
    data = await buildDiagnostics({ origin });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await postToSlack(
      webhook,
      `:warning: diagnostics-alert cron: buildDiagnostics threw. ${msg.slice(0, 300)}`,
    );
    return NextResponse.json({ alerted: true, reason: 'buildDiagnostics threw', error: msg });
  }

  const redPaths = collectRedPaths(data);

  if (redPaths.length === 0) {
    return NextResponse.json({ alerted: false, red_paths: [] });
  }

  const lines = redPaths.map((p) => `• \`${p}\``).join('\n');
  await postToSlack(
    webhook,
    `:rotating_light: *Clip Dashboard diagnostics RED* (${redPaths.length})\n${lines}\n\nDetails: ${origin}/api/diagnostics`,
  );

  return NextResponse.json({ alerted: true, red_paths: redPaths });
}
