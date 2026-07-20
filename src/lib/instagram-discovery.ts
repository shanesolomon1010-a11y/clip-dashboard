/**
 * Instagram auto-discovery orchestrator (Phase 2 — see
 * docs/superpowers/plans/2026-05-15-instagram-pipeline.md).
 *
 * Mirrors src/lib/shorts-discovery.ts in shape. On each cron tick:
 *   1. Fetch every media on the authenticated IG account (all pages).
 *   2. For each media:
 *        - If media_product_type !== 'REELS', log to instagram_discovery_audit
 *          and skip (Q6 audit-first: spot-check before locking the strict rule).
 *        - If already MAPPED to a real MBM code, skip — daily stats handle it.
 *        - If only PENDING-IG (registered but unmapped), re-check the caption:
 *          promote via the atomic map_clip path if it now carries a code. This
 *          removes the post-time race and lets the backlog clear by caption edit.
 *        - If new and the caption matches /MBM\d{3}-CLIP-\d{3}/, auto-map to that
 *          clip_details row (only where instagram_content_id IS NULL).
 *        - Otherwise (or if no matching clip_details row exists), register a
 *          PENDING-IG- row so daily stats still flow.
 */

import { fetchMediaList, InstagramMedia } from './instagram';
import {
  getInstagramRegistry,
  InstagramRegistryRow,
  logSkippedMediaToAudit,
  registerInstagramPending,
  setClipDetailInstagramContentIdIfNull,
  promotePendingReel,
} from './db';

// Capture-grouped variant of the locked caption regex. Word-boundaried (not
// string-anchored) so the code is still matched embedded in a caption with
// hashtags, emoji, etc., while a trailing digit can't truncate-match a real code
// (e.g. MBM015-CLIP-0201). m[1] = MBM###, m[2] = CLIP-###, m[0] = full code.
const CAPTION_REGEX = /\b(MBM\d{3})-(CLIP-\d{3})\b/;

export interface InstagramDiscoveryResult {
  matched: number;
  pending: number;
  skipped: number;
  audited: number;
}

// Discovery's full return: the counters plus the POST-MUTATION registry.
// Built incrementally as we auto-map / register PENDING so the orchestrator
// can iterate without paying a second DB roundtrip and without risking a
// stale read against rows we just wrote. The cron JSON response strips the
// registry out (see InstagramSyncResult.discovered type).
export interface InstagramDiscoveryOutcome extends InstagramDiscoveryResult {
  registry: InstagramRegistryRow[];
}

function firstCaptionLine(caption: string | null): string | null {
  if (!caption) return null;
  return caption.split('\n')[0].slice(0, 500);
}

export async function discoverInstagramMedia(
  igUserId: string,
  accessToken: string,
  preFetchedMedia?: InstagramMedia[],
): Promise<InstagramDiscoveryOutcome> {
  const result: InstagramDiscoveryResult = { matched: 0, pending: 0, skipped: 0, audited: 0 };

  const allMedia = preFetchedMedia ?? (await fetchMediaList(igUserId, accessToken));
  const initialRegistry = await getInstagramRegistry();
  const registry: InstagramRegistryRow[] = [...initialRegistry];
  // media_id -> its current registry row: lets us tell a real mapping (skip)
  // from a PENDING-IG placeholder (re-check the caption and promote), and swap
  // the row in place when a promotion lands so downstream stats use the new code.
  const registryByMedia = new Map(registry.map((r) => [r.instagram_content_id, r]));

  for (const media of allMedia) {
    if (media.media_product_type !== 'REELS') {
      await logSkippedMediaToAudit({
        media_id: media.id,
        media_type: media.media_type,
        media_product_type: media.media_product_type,
        permalink: media.permalink,
        caption_first_line: firstCaptionLine(media.caption),
      });
      result.audited++;
      continue;
    }

    const existing = registryByMedia.get(media.id);
    const isMapped = existing != null && !existing.clip_details_code.startsWith('PENDING-');
    if (isMapped) {
      result.skipped++;
      continue;
    }

    if (existing != null) {
      // Currently only PENDING-IG: re-check the caption and promote if it now
      // carries the code. Removes the post-time race and clears the backlog by
      // caption edit — a short that first went PENDING is no longer stuck.
      const promoted = await tryPromotePending(media);
      if (promoted) {
        const idx = registry.indexOf(existing);
        if (idx !== -1) registry[idx] = promoted;
        registryByMedia.set(media.id, promoted);
        result.matched++;
        continue;
      }
      result.skipped++;
      continue;
    }

    const matched = await tryAutoMap(media);
    if (matched) {
      registry.push(matched);
      registryByMedia.set(media.id, matched);
      result.matched++;
      continue;
    }

    await registerInstagramPending(media.id);
    const pendingRow: InstagramRegistryRow = {
      instagram_content_id: media.id,
      clip_details_code: `PENDING-IG-${media.id}`,
      clip_code: 'PENDING',
      skip_insights: false,
    };
    registry.push(pendingRow);
    registryByMedia.set(media.id, pendingRow);
    console.log(`[instagram-discovery] registered PENDING-IG-${media.id}`);
    result.pending++;
  }

  console.log(
    `[instagram-discovery] scanned ${allMedia.length}, matched ${result.matched}, ` +
    `pending ${result.pending}, skipped ${result.skipped}, audited ${result.audited}, ` +
    `registry now ${registry.length} entries`,
  );
  return { ...result, registry };
}

// Returns the registry row for an auto-mapped media if the caption matched a
// clip code AND we successfully wrote the instagram_content_id onto an
// existing clip_details row. A regex match without a corresponding
// clip_details row falls back to PENDING (logged, caller registers).
async function tryAutoMap(media: InstagramMedia): Promise<InstagramRegistryRow | null> {
  if (!media.caption) return null;
  const m = media.caption.match(CAPTION_REGEX);
  if (!m) return null;

  const clipCode = m[1];
  const clipDetailsCode = `${m[1]}-${m[2]}`;
  const updated = await setClipDetailInstagramContentIdIfNull(media.id, clipDetailsCode);
  if (updated) {
    console.log(`[instagram-discovery] matched ${media.id} → ${clipDetailsCode} via caption`);
    return {
      instagram_content_id: media.id,
      clip_details_code: clipDetailsCode,
      clip_code: clipCode,
      skip_insights: false,
    };
  }
  console.warn(
    `[instagram-discovery] ${media.id} caption mentioned ${clipDetailsCode} but no matching ` +
    `clip_details row (or instagram_content_id already set) — falling back to PENDING`,
  );
  return null;
}

// PENDING twin of tryAutoMap: if a currently-PENDING reel's caption now carries
// a code whose clip_details row exists, promote it via the atomic map_clip path
// and return its mapped registry row. Null when there is no code, or the clip is
// unknown / already mapped to another reel / the promote collided — all guarded
// in the db layer, which logs the reason.
async function tryPromotePending(media: InstagramMedia): Promise<InstagramRegistryRow | null> {
  if (!media.caption) return null;
  const m = media.caption.match(CAPTION_REGEX);
  if (!m) return null;

  const clipDetailsCode = `${m[1]}-${m[2]}`;
  const promoted = await promotePendingReel(media.id, clipDetailsCode);
  if (!promoted) return null;
  console.log(`[instagram-discovery] promoted PENDING-IG ${media.id} → ${clipDetailsCode}`);
  return {
    instagram_content_id: media.id,
    clip_details_code: clipDetailsCode,
    clip_code: m[1],
    skip_insights: false,
  };
}
