import { NextResponse } from 'next/server';
import { buildDiagnostics, type DiagnosticsResponse, type AnomalyRow } from '@/lib/diagnostics';

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

function countStatuses(obj: unknown, counts = { green: 0, yellow: 0, red: 0 }): { green: number; yellow: number; red: number } {
  if (obj === null || typeof obj !== 'object') return counts;
  for (const [k, v] of Object.entries(obj as AnyObject)) {
    if (k === 'status' && (v === 'green' || v === 'yellow' || v === 'red')) {
      counts[v as 'green' | 'yellow' | 'red']++;
    } else if (typeof v === 'object' && v !== null) {
      countStatuses(v, counts);
    }
  }
  return counts;
}

function formatHours(h: number | null): string {
  if (h == null) return 'n/a';
  if (h < 1) return `${Math.round(h * 60)}m ago`;
  return `${Math.round(h * 10) / 10}h ago`;
}

function formatAnomalyLines(anomalies: AnomalyRow[]): string {
  if (anomalies.length === 0) return '';
  const lines = anomalies.map((a) => {
    const kind = a.kind.replace(/_/g, ' ');
    return `  • [${a.platform}] \`${a.content_id}\` — ${kind}: ${a.detail}`;
  });
  return `\n*Top anomalies:*\n${lines.join('\n')}`;
}

async function postToSlack(webhook: string, text: string): Promise<void> {
  const res = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Slack ${res.status}: ${body.slice(0, 200)}`);
  }
}

async function trySlackPost(webhook: string, text: string): Promise<void> {
  try {
    await postToSlack(webhook, text);
  } catch (err) {
    console.error('[diagnostics-alert] postToSlack failed:', {
      message: err instanceof Error ? err.message : String(err),
      payload_preview: text.slice(0, 200),
    });
  }
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

  let data: DiagnosticsResponse;
  try {
    data = await buildDiagnostics();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await trySlackPost(
      webhook,
      `:warning: diagnostics-alert cron: buildDiagnostics threw. ${msg.slice(0, 300)}`,
    );
    return NextResponse.json({ alerted: true, reason: 'buildDiagnostics threw', error: msg });
  }

  const redPaths = collectRedPaths(data);
  const isHeartbeatTick = new Date().getUTCHours() === 0;

  // Daily heartbeat at 00:00 UTC, regardless of red_paths.
  if (isHeartbeatTick) {
    const counts = countStatuses(data);
    const ytShort = data.cron_health.last_youtube_sync_short.hours_ago;
    const ytLong = data.cron_health.last_youtube_sync_longform.hours_ago;
    const ig = data.cron_health.last_instagram_sync.hours_ago;
    await trySlackPost(
      webhook,
      `:bar_chart: *Clip Dashboard daily heartbeat* — ${counts.green} green, ${counts.yellow} yellow, ${counts.red} red.\n` +
        `Last syncs: YT shorts ${formatHours(ytShort)}, YT longform ${formatHours(ytLong)}, IG ${formatHours(ig)}.`,
    );
  }

  if (redPaths.length === 0) {
    return NextResponse.json({ alerted: isHeartbeatTick, red_paths: [], heartbeat: isHeartbeatTick });
  }

  const lines = redPaths.map((p) => `• \`${p}\``).join('\n');
  const anomalyDetail = redPaths.includes('anomaly_check.status')
    ? formatAnomalyLines(data.anomaly_check.top_anomalies)
    : '';
  await trySlackPost(
    webhook,
    `:rotating_light: *Clip Dashboard diagnostics RED* (${redPaths.length})\n${lines}${anomalyDetail}\n\nDetails: ${origin}/api/diagnostics`,
  );

  return NextResponse.json({ alerted: true, red_paths: redPaths, heartbeat: isHeartbeatTick });
}
