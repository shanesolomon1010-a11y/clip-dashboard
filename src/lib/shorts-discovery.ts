/**
 * Shorts auto-discovery orchestrator (Phase 3b — see
 * docs/superpowers/plans/2026-05-14-shorts-auto-discovery.md).
 *
 * On each cron tick:
 *   1. Enumerate every video on the authenticated channel via the uploads playlist.
 *   2. Fetch snippet.tags + description + status + duration + publishedAt (batched 50).
 *   3. Skip videos already MAPPED to a real MBM code. Videos never seen before,
 *      AND those currently only PENDING, are (re-)evaluated — so a tag added
 *      AFTER a short first went PENDING still maps it. This removes the
 *      upload-time race (the cron used to skip anything already registered, so a
 *      tag only worked if present on the very first tick) and lets the existing
 *      PENDING backlog be cleared just by tagging in Studio.
 *   4. For each evaluated video:
 *        - If a tag OR the description carries an MBM###-CLIP-### code whose
 *          clip_details row exists, map it: never-seen videos via setContentId,
 *          already-PENDING videos via the atomic map_clip RPC (which frees the
 *          PENDING row's content_id and re-keys its posts, guarding collisions).
 *        - Otherwise register/keep a PENDING row so daily stats still flow.
 */

import {
  fetchVideoDiscoveryDetails,
  listChannelVideoIds,
} from './youtube';
import {
  getShortsRegistry,
  registerPendingShort,
  setClipDetailContentIdIfNull,
  rekeyPendingPostsToMappedCode,
  promotePendingShort,
} from './db';

// Unanchored so the code is matched whether it is the whole tag or embedded in a
// tag / the description. Tags are hidden from viewers, so they are the intended
// slot; the description is a fallback for flexibility.
const CODE_REGEX = /\bMBM\d{3}-CLIP-\d{3}\b/;
const MAX_DURATION_SECONDS = 180;
const MIN_PUBLISHED_AT = '2023-01-01';
const BATCH_SIZE = 50;

export interface DiscoveryResult {
  matched: number;
  pending: number;
  skipped: number;
}

// First MBM code found across the video's tags, then its description; else null.
function findClipCode(tags: string[], description: string): string | null {
  for (const tag of tags) {
    const m = tag.match(CODE_REGEX);
    if (m) return m[0];
  }
  const dm = description.match(CODE_REGEX);
  return dm ? dm[0] : null;
}

export async function discoverShorts(accessToken: string): Promise<DiscoveryResult> {
  const result: DiscoveryResult = { matched: 0, pending: 0, skipped: 0 };

  const videoIds = await listChannelVideoIds(accessToken);
  const registry = await getShortsRegistry();
  // content_id -> clip_details_code: lets us tell a real mapping (skip) from a
  // PENDING placeholder (re-evaluate for a newly-added tag).
  const registeredCode = new Map(registry.map((r) => [r.content_id, r.clip_details_code]));

  for (let i = 0; i < videoIds.length; i += BATCH_SIZE) {
    const batch = videoIds.slice(i, i + BATCH_SIZE);
    const details = await fetchVideoDiscoveryDetails(batch, accessToken);

    for (const videoId of batch) {
      const existing = registeredCode.get(videoId);
      const isMapped = existing != null && !existing.startsWith('PENDING-');
      if (isMapped) {
        result.skipped++;
        continue;
      }
      const isPending = existing != null; // registered but only as PENDING-*

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

      const clipDetailsCode = findClipCode(meta.tags, meta.description);

      if (clipDetailsCode) {
        if (isPending) {
          // Atomic promote: map_clip frees the PENDING content_id + re-keys posts
          // and raises on any collision, so a bad tag can never corrupt data.
          const promoted = await promotePendingShort(videoId, clipDetailsCode);
          if (promoted) {
            console.log(`[shorts-discovery] promoted PENDING ${videoId} → ${clipDetailsCode}`);
            result.matched++;
            continue;
          }
          console.warn(`[shorts-discovery] ${videoId} tagged ${clipDetailsCode} but promote failed (unknown clip or collision) — left PENDING`);
          result.skipped++;
          continue;
        }

        const updated = await setClipDetailContentIdIfNull(videoId, clipDetailsCode);
        if (updated) {
          console.log(`[shorts-discovery] matched ${videoId} → ${clipDetailsCode} via tag/description`);
          const rekeyed = await rekeyPendingPostsToMappedCode(videoId, clipDetailsCode);
          console.log(`[shorts-discovery] re-keyed ${rekeyed} posts row(s) from PENDING-${videoId} to ${clipDetailsCode}`);
          result.matched++;
          continue;
        }
        console.warn(`[shorts-discovery] ${videoId} tagged ${clipDetailsCode} but no matching clip_details row (or content_id already set) — falling back to PENDING`);
      }

      if (isPending) {
        // Already PENDING and still carries no code — nothing to do this tick.
        result.skipped++;
        continue;
      }

      await registerPendingShort(videoId);
      console.log(`[shorts-discovery] registered PENDING for ${videoId}`);
      result.pending++;
    }
  }

  console.log(`[shorts-discovery] scanned ${videoIds.length}, matched ${result.matched}, pending ${result.pending}, skipped ${result.skipped}`);
  return result;
}
