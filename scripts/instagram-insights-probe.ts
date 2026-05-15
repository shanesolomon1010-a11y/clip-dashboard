/**
 * Validates the lifetime-cumulative assumption for Instagram Reels Insights
 * (Q1 lock in docs/superpowers/plans/2026-05-15-instagram-pipeline.md).
 *
 * What it does:
 *   1. Reads access_token + ig_user_id from instagram_auth via Supabase.
 *   2. Fetches /me/media and filters strictly to media_product_type === 'REELS'.
 *   3. Takes the first 3 Reels and pulls /insights for each.
 *   4. Pretty-prints a flat key/value table per media to stdout.
 *   5. Writes the full raw response to scripts/probe-output/instagram-insights-{ISO}.json
 *      so two runs can be diffed after the fact.
 *
 * Usage:
 *   npx tsx scripts/instagram-insights-probe.ts
 *
 * Validation protocol:
 *   - Run once today.
 *   - Run again 24h later.
 *   - Diff the two JSON outputs. If Day 2 values are >= Day 1 across every
 *     metric on every media, lifetime-cumulative is confirmed and Phase 2/3
 *     can proceed with diff-against-SUM(posts.views) logic. If any value
 *     resets to 0 or shows daily-shaped numbers, pivot.
 *
 * Read-only — does not write to instagram_auth or posts.
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

config({ path: '.env.local' });

const IG_GRAPH_VERSION = 'v21.0';
const IG_GRAPH_BASE = `https://graph.instagram.com/${IG_GRAPH_VERSION}`;
const REELS_METRICS = ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions'];

interface InstagramAuthRow {
  access_token: string;
  ig_user_id: string;
  token_expiry: string;
}

interface MediaListItem {
  id: string;
  caption: string | null;
  media_type: string;
  media_product_type: string;
  permalink: string;
  timestamp: string;
}

interface MediaListResponse {
  data?: MediaListItem[];
  paging?: { next?: string };
  error?: { message: string };
}

interface InsightsValue {
  value: number;
}

interface InsightsEntry {
  name: string;
  period: string;
  values: InsightsValue[];
}

interface InsightsResponse {
  data?: InsightsEntry[];
  error?: { message: string };
}

interface ProbeResult {
  mediaId: string;
  permalink: string;
  caption: string | null;
  publishedAt: string;
  insights: Record<string, number>;
}

async function getAuth(): Promise<InstagramAuthRow> {
  // Service-role client (mirrors src/app/api/library/sync-urls/route.ts:15-18
  // and scripts/youtube-studio-sync.ts:722-724). RLS blocks anon reads of
  // instagram_auth — token rows are server-side only.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  }
  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from('instagram_auth')
    .select('access_token, ig_user_id, token_expiry')
    .maybeSingle();
  if (error || !data) {
    throw new Error(`Failed to read instagram_auth: ${error?.message ?? 'no row'}`);
  }
  const row = data as Record<string, unknown>;
  return {
    access_token: row.access_token as string,
    ig_user_id: row.ig_user_id as string,
    token_expiry: row.token_expiry as string,
  };
}

async function fetchAllMedia(igUserId: string, accessToken: string): Promise<MediaListItem[]> {
  const result: MediaListItem[] = [];
  const initial = new URL(`${IG_GRAPH_BASE}/${igUserId}/media`);
  initial.searchParams.set('fields', 'id,caption,media_type,media_product_type,permalink,timestamp');
  initial.searchParams.set('access_token', accessToken);
  let nextUrl: string | undefined = initial.toString();
  while (nextUrl) {
    const res = await fetch(nextUrl);
    const data = await res.json() as MediaListResponse;
    if (!res.ok) throw new Error(`/media error: ${data.error?.message ?? res.status}`);
    for (const m of data.data ?? []) result.push(m);
    nextUrl = data.paging?.next;
  }
  return result;
}

async function fetchInsights(mediaId: string, accessToken: string): Promise<Record<string, number>> {
  const url = new URL(`${IG_GRAPH_BASE}/${mediaId}/insights`);
  url.searchParams.set('metric', REELS_METRICS.join(','));
  url.searchParams.set('access_token', accessToken);
  const res = await fetch(url.toString());
  const data = await res.json() as InsightsResponse;
  if (!res.ok) throw new Error(`/insights error for ${mediaId}: ${data.error?.message ?? res.status}`);
  const out: Record<string, number> = {};
  for (const entry of data.data ?? []) {
    out[entry.name] = entry.values[0]?.value ?? 0;
  }
  return out;
}

function truncatePermalink(p: string, max = 60): string {
  return p.length > max ? p.slice(0, max - 3) + '...' : p;
}

function printResult(r: ProbeResult): void {
  console.log(`\n  media_id:    ${r.mediaId}`);
  console.log(`  permalink:   ${truncatePermalink(r.permalink)}`);
  console.log(`  published:   ${r.publishedAt}`);
  if (r.caption) {
    const firstLine = r.caption.split('\n')[0];
    console.log(`  caption[0]:  ${firstLine.slice(0, 80)}${firstLine.length > 80 ? '...' : ''}`);
  }
  console.log('  insights:');
  for (const metric of REELS_METRICS) {
    const v = r.insights[metric];
    const display = typeof v === 'number' ? v.toLocaleString() : '(missing)';
    console.log(`    ${metric.padEnd(20)} ${display}`);
  }
}

async function main(): Promise<void> {
  const runStartedAt = new Date().toISOString();
  console.log('═'.repeat(72));
  console.log(`Instagram Insights probe — ${runStartedAt}`);
  console.log('═'.repeat(72));

  const auth = await getAuth();
  console.log(`auth: ig_user_id=${auth.ig_user_id}, token_expiry=${auth.token_expiry}`);

  console.log('\nFetching /me/media (all pages)...');
  const allMedia = await fetchAllMedia(auth.ig_user_id, auth.access_token);
  console.log(`  → ${allMedia.length} media items total across all product types`);

  const reels = allMedia.filter((m) => m.media_product_type === 'REELS');
  console.log(`  → ${reels.length} REELS after strict media_product_type filter`);

  if (reels.length === 0) {
    console.error('\nERROR: no REELS found. Probe cannot proceed.');
    process.exit(1);
  }

  const sample = reels.slice(0, 3);
  console.log(`\nProbing first ${sample.length} Reels for /insights...`);

  const results: ProbeResult[] = [];
  for (const m of sample) {
    const insights = await fetchInsights(m.id, auth.access_token);
    const result: ProbeResult = {
      mediaId: m.id,
      permalink: m.permalink,
      caption: m.caption,
      publishedAt: m.timestamp,
      insights,
    };
    results.push(result);
    printResult(result);
  }

  // Persist raw output for cross-run diffing.
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const outDir = join(scriptDir, 'probe-output');
  mkdirSync(outDir, { recursive: true });
  const safeTs = runStartedAt.replace(/[:.]/g, '-');
  const outPath = join(outDir, `instagram-insights-${safeTs}.json`);
  writeFileSync(outPath, JSON.stringify({
    runStartedAt,
    igUserId: auth.ig_user_id,
    totalMediaCount: allMedia.length,
    reelsCount: reels.length,
    results,
  }, null, 2));

  console.log('\n' + '─'.repeat(72));
  console.log(`Raw output written: ${outPath}`);
  console.log('Run again 24h+ later, then diff the two JSON files.');
  console.log('─'.repeat(72));
}

main().catch((err) => {
  console.error('\nProbe failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
