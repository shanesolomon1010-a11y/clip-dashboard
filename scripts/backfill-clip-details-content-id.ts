/**
 * Phase 2 backfill: populate clip_details.content_id for every entry in the
 * live VIDEO_MAP (src/lib/youtube-sync.ts).
 *
 * For each (videoId, clipDetailsCode) in VIDEO_MAP:
 *   1. Fetches fileDetails.fileName via YouTube Data API v3 (requires force-ssl scope).
 *   2. Verifies the filename matches /^(MBM\d{3})-(CLIP-\d{3})/ and that the derived
 *      code matches the hardcoded clipDetailsCode — warns on drift but does not block.
 *   3. UPDATEs clip_details.content_id (skips rows that already have a value unless --force).
 *
 * Idempotent. Run --dry-run first to preview UPDATEs without writing.
 *
 * Run:
 *   npx tsx scripts/backfill-clip-details-content-id.ts --dry-run
 *   npx tsx scripts/backfill-clip-details-content-id.ts
 *   npx tsx scripts/backfill-clip-details-content-id.ts --force
 *
 * Env (from .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (required — UPDATEs go through service role to skip RLS)
 *   YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET  (used by getAccessToken via the youtube_auth row)
 */

import { config as dotenvConfig } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenvConfig({ path: '.env.local' });

const FILENAME_REGEX = /^(MBM\d{3})-(CLIP-\d{3})/;
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');
const BATCH_SIZE = 50;

interface VideosListItem {
  id: string;
  fileDetails?: { fileName?: string };
}

interface VideosListResponse {
  items?: VideosListItem[];
  error?: { message: string };
}

interface FileDetailsMeta {
  fileName: string | null;
}

interface Stats {
  matched: number;
  skipped: number;
  regexMismatch: number;
  mapDrift: number;
  missingRow: number;
  missingFromApi: number;
}

async function fetchFileDetails(
  videoIds: string[],
  accessToken: string
): Promise<Map<string, FileDetailsMeta>> {
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('id', videoIds.join(','));
  url.searchParams.set('part', 'fileDetails');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = (await res.json()) as VideosListResponse;
  if (!res.ok) {
    throw new Error(`YouTube Data API error: ${data.error?.message ?? res.status}`);
  }

  const result = new Map<string, FileDetailsMeta>();
  for (const item of data.items ?? []) {
    result.set(item.id, { fileName: item.fileDetails?.fileName ?? null });
  }
  return result;
}

async function main(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  }

  // Dynamic imports so dotenv.config() runs before src/lib/supabase.ts initializes
  // (it reads process.env.NEXT_PUBLIC_SUPABASE_URL at module load time).
  const { VIDEO_MAP } = await import('../src/lib/youtube-sync');
  const { getAccessToken } = await import('../src/lib/youtube');

  const writeClient = createClient(supabaseUrl, serviceRoleKey);

  const entries = Object.entries(VIDEO_MAP);
  const mode = DRY_RUN ? ' (DRY RUN — no writes)' : FORCE ? ' (FORCE — overwrites existing)' : '';
  console.log(`[backfill] Processing ${entries.length} videos${mode}`);

  const accessToken = await getAccessToken();
  console.log('[backfill] Got YouTube access token');

  const videoIds = entries.map(([id]) => id);
  const fileDetailsMap = new Map<string, FileDetailsMeta>();
  for (let i = 0; i < videoIds.length; i += BATCH_SIZE) {
    const batch = videoIds.slice(i, i + BATCH_SIZE);
    console.log(`[backfill] Fetching fileDetails batch ${i / BATCH_SIZE + 1} (${batch.length} videos)`);
    const result = await fetchFileDetails(batch, accessToken);
    result.forEach((meta, id) => fileDetailsMap.set(id, meta));
  }

  const stats: Stats = {
    matched: 0,
    skipped: 0,
    regexMismatch: 0,
    mapDrift: 0,
    missingRow: 0,
    missingFromApi: 0,
  };

  for (const [videoId, clipDetailsCode] of entries) {
    const meta = fileDetailsMap.get(videoId);
    if (!meta) {
      console.warn(`[missing-from-api] ${videoId} → ${clipDetailsCode}: not returned by videos.list (private/deleted?)`);
      stats.missingFromApi++;
      continue;
    }

    if (meta.fileName) {
      const m = meta.fileName.match(FILENAME_REGEX);
      if (m) {
        const derived = `${m[1]}-${m[2]}`;
        if (derived !== clipDetailsCode) {
          console.warn(`[map-drift] ${videoId}: hardcoded=${clipDetailsCode}, filename-derived=${derived} (fileName="${meta.fileName}")`);
          stats.mapDrift++;
        }
      } else {
        console.warn(`[regex-mismatch] ${videoId} → ${clipDetailsCode}: fileName="${meta.fileName}" doesn't match regex`);
        stats.regexMismatch++;
      }
    } else {
      console.warn(`[no-filename] ${videoId} → ${clipDetailsCode}: no fileDetails.fileName returned`);
    }

    const { data: existing, error: readErr } = await writeClient
      .from('clip_details')
      .select('content_id')
      .eq('clip_details_code', clipDetailsCode)
      .maybeSingle();

    if (readErr) {
      console.error(`[read-error] ${clipDetailsCode}: ${readErr.message}`);
      continue;
    }

    if (!existing) {
      console.warn(`[missing-row] ${clipDetailsCode}: no clip_details row found — VIDEO_MAP references a code not in DB`);
      stats.missingRow++;
      continue;
    }

    const currentContentId = (existing as { content_id: string | null }).content_id;
    if (currentContentId && !FORCE) {
      console.log(`[skip] ${clipDetailsCode}: content_id already set to ${currentContentId}`);
      stats.skipped++;
      continue;
    }

    if (DRY_RUN) {
      const verb = currentContentId ? `overwrite ${currentContentId} →` : 'set';
      console.log(`[DRY] ${clipDetailsCode}: would ${verb} content_id=${videoId}`);
      stats.matched++;
      continue;
    }

    const { error: writeErr } = await writeClient
      .from('clip_details')
      .update({ content_id: videoId })
      .eq('clip_details_code', clipDetailsCode);

    if (writeErr) {
      console.error(`[write-error] ${clipDetailsCode}: ${writeErr.message}`);
      continue;
    }

    console.log(`[updated] ${clipDetailsCode} → content_id=${videoId}`);
    stats.matched++;
  }

  console.log('\n=== Summary ===');
  console.log(`total entries:           ${entries.length}`);
  console.log(`matched / ${DRY_RUN ? 'would update' : 'updated'}:    ${stats.matched}`);
  console.log(`skipped (already set):   ${stats.skipped}`);
  console.log(`regex mismatches:        ${stats.regexMismatch}`);
  console.log(`map drift (warn only):   ${stats.mapDrift}`);
  console.log(`missing clip_details:    ${stats.missingRow}`);
  console.log(`missing from API:        ${stats.missingFromApi}`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
