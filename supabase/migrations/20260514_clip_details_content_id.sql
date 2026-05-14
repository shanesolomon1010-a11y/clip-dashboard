-- 20260514_clip_details_content_id.sql
-- Powers the Shorts auto-discovery registry (see docs/superpowers/plans/2026-05-14-shorts-auto-discovery.md).
--
-- content_id is the YouTube videoId for clips that have been uploaded.
-- Nullable because many historical clip_details rows have no associated upload yet.
-- Partial unique index because long-tail clips remain without content_id for a while,
-- but each populated content_id must map to exactly one clip_details row.

ALTER TABLE clip_details
  ADD COLUMN IF NOT EXISTS content_id text;

CREATE UNIQUE INDEX IF NOT EXISTS clip_details_content_id_idx
  ON clip_details (content_id)
  WHERE content_id IS NOT NULL;
