import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Paths into the diagnostics response that read RED by design and should not
// alert. The Playwright LaunchAgent scraper was deleted 2026-05-18 (per
// CLAUDE.md); last_scraper_run + scraper_history + studio_snapshots_latest_stat
// are all downstream of that deletion and will read RED forever.
const KNOWN_RED_PATHS = new Set([
  'cron_health.last_scraper_run.status',
  'scraper_history.status',
  'data_freshness.studio_snapshots_latest_stat.status',
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
  const diagRes = await fetch(`${origin}/api/diagnostics`, { cache: 'no-store' });
  if (!diagRes.ok) {
    const body = await diagRes.text();
    await postToSlack(
      webhook,
      `:warning: diagnostics-alert cron: /api/diagnostics returned ${diagRes.status}. Body: ${body.slice(0, 300)}`,
    );
    return NextResponse.json({ alerted: true, reason: 'diagnostics fetch failed' });
  }

  const data: unknown = await diagRes.json();
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
