-- 20260515_clip_details_instagram_content_id.sql
-- Adds the Instagram-side content identifier to clip_details, symmetric with
-- the YouTube content_id column added in 20260514_clip_details_content_id.sql.
-- Powers the Instagram auto-discovery registry (see
-- docs/superpowers/plans/2026-05-15-instagram-pipeline.md).
--
-- instagram_content_id is the IG media_id (numeric string) for clips published
-- to Instagram. Nullable because the long tail of clip_details rows are
-- YouTube-only and have no IG counterpart.
--
-- Why a regular UNIQUE constraint and NOT a partial unique index:
--   PostgREST cannot use a partial unique index as an inferred ON CONFLICT
--   target via ?on_conflict=column. supabase-js's
--     .upsert({...}, { onConflict: 'instagram_content_id', ignoreDuplicates: true })
--   translates to SQL `ON CONFLICT (instagram_content_id) DO NOTHING` with no
--   WHERE clause, which Postgres rejects against a partial index ("no unique
--   or exclusion constraint matching the ON CONFLICT specification" → 400).
--   This was the exact bug from 2026-05-14 that aborted Shorts discovery in
--   prod; see tasks/lessons.md and 20260514_clip_details_content_id_unique_constraint.sql.
--
-- A regular UNIQUE constraint works as an ON CONFLICT target. Per the SQL
-- standard (NULLS DISTINCT, the Postgres default), multiple NULL values are
-- allowed in UNIQUE, so the semantic guarantee is unchanged: long-tail
-- clip_details rows can still have NULL instagram_content_id, but each
-- populated instagram_content_id must map to exactly one clip_details row.

ALTER TABLE clip_details
  ADD COLUMN IF NOT EXISTS instagram_content_id text;

ALTER TABLE clip_details
  ADD CONSTRAINT clip_details_instagram_content_id_unique
  UNIQUE (instagram_content_id);
