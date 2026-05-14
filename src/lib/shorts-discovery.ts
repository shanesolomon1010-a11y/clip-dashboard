/**
 * Shorts auto-discovery orchestrator (Phase 3b — see
 * docs/superpowers/plans/2026-05-14-shorts-auto-discovery.md).
 *
 * On each cron tick:
 *   1. Enumerate every video on the authenticated channel via the uploads playlist.
 *   2. Fetch snippet.tags + status + duration + publishedAt for each (batched 50).
 *   3. Skip videos that are too long, not public, pre-2023, or already in the
 *      clip_details registry.
 *   4. For each remaining video:
 *        - If any tag matches /^(MBM\d{3})-(CLIP-\d{3})$/, attempt to auto-map
 *          to that clip_details row (only updates rows where content_id IS NULL).
 *        - Otherwise (or if no matching clip_details row exists), register a
 *          PENDING row so daily stats still flow.
 */

import {
  fetchVideoDiscoveryDetails,
  listChannelVideoIds,
} from './youtube';
import {
  getShortsRegistry,
  registerPendingShort,
  setClipDetailContentIdIfNull,
} from './db';

const TAG_REGEX = /^(MBM\d{3})-(CLIP-\d{3})$/;
const MAX_DURATION_SECONDS = 180;
const MIN_PUBLISHED_AT = '2023-01-01';
const BATCH_SIZE = 50;

export interface DiscoveryResult {
  matched: number;
  pending: number;
  skipped: number;
}

export async function discoverShorts(accessToken: string): Promise<DiscoveryResult> {
  const result: DiscoveryResult = { matched: 0, pending: 0, skipped: 0 };

  const videoIds = await listChannelVideoIds(accessToken);
  const registry = await getShortsRegistry();
  const registeredContentIds = new Set(registry.map((r) => r.content_id));

  for (let i = 0; i < videoIds.length; i += BATCH_SIZE) {
    const batch = videoIds.slice(i, i + BATCH_SIZE);
    const details = await fetchVideoDiscoveryDetails(batch, accessToken);

    for (const videoId of batch) {
      if (registeredContentIds.has(videoId)) {
        result.skipped++;
        continue;
      }

      const meta = details.get(videoId);
      if (!meta) {
        result.skipped++;
        continue;
      }

      if (
        meta.durationSeconds > MAX_DURATION_SECONDS ||
        meta.privacyStatus !== 'public' ||
        meta.publishedAt < MIN_PUBLISHED_AT
      ) {
        result.skipped++;
        continue;
      }

      let mapped = false;
      for (const tag of meta.tags) {
        const m = tag.match(TAG_REGEX);
        if (!m) continue;
        const clipCode = m[1];
        const clipDetailsCode = `${clipCode}-${m[2]}`;
        const updated = await setClipDetailContentIdIfNull(videoId, clipDetailsCode);
        if (updated) {
          console.log(`[shorts-discovery] matched ${videoId} → ${clipDetailsCode} via tag`);
          result.matched++;
          mapped = true;
        } else {
          console.warn(`[shorts-discovery] ${videoId} tagged ${clipDetailsCode} but no matching clip_details row (or content_id already set) — falling back to PENDING`);
        }
        break;
      }
      if (mapped) continue;

      await registerPendingShort(videoId);
      console.log(`[shorts-discovery] registered PENDING for ${videoId}`);
      result.pending++;
    }
  }

  console.log(`[shorts-discovery] scanned ${videoIds.length}, matched ${result.matched}, pending ${result.pending}, skipped ${result.skipped}`);
  return result;
}
