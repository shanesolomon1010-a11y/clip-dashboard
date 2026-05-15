-- 20260516_instagram_discovery_audit.sql
-- Audit log of media that the Instagram discovery flow skipped because they
-- failed the strict media_product_type === 'REELS' filter. Powers the Q6
-- audit-first decision in docs/superpowers/plans/2026-05-15-instagram-pipeline.md.
--
-- Why a table instead of console logging:
--   We need to query skipped media from the Supabase SQL Editor 24-72h after
--   the first cron run to spot-check whether anything real got filtered out.
--   Console output dies with the Vercel function invocation.
--
-- Why media_id PRIMARY KEY (not (media_id, discovered_at) composite):
--   One row per skipped media is enough — we don't need an event log of every
--   re-skip on every cron tick. discovered_at preserves the FIRST time we saw
--   the media as a skip. Upserts use onConflict: 'media_id', ignoreDuplicates
--   so re-runs are no-ops. Using PRIMARY KEY (a regular constraint, NULLS
--   DISTINCT not applicable) sidesteps the partial-index ON CONFLICT trap
--   (lessons.md 2026-05-14) by design.
--
-- Lifecycle:
--   v1: writes append-only as new non-REELS media appear. No deletes.
--   Future: if the strict REELS rule is loosened or a different filter
--   adopted, drop this table or migrate. Not designed for long-term
--   structured analytics — purely an audit.

CREATE TABLE IF NOT EXISTS instagram_discovery_audit (
  media_id            text PRIMARY KEY,
  media_type          text NOT NULL,
  media_product_type  text NOT NULL,
  permalink           text NOT NULL,
  caption_first_line  text,
  discovered_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS instagram_discovery_audit_discovered_at_idx
  ON instagram_discovery_audit (discovered_at DESC);
