-- 20260514_clip_details_content_id_unique_constraint.sql
-- Swap the partial unique index from 20260514_clip_details_content_id.sql for a
-- regular UNIQUE constraint.
--
-- Why: PostgREST can't use a partial unique index as an inferred ON CONFLICT
-- target via ?on_conflict=column. supabase-js's
--   .upsert({...}, { onConflict: 'content_id', ignoreDuplicates: true })
-- translates to SQL `ON CONFLICT (content_id) DO NOTHING` with no WHERE clause,
-- which Postgres rejects against a partial index ("no unique or exclusion
-- constraint matching the ON CONFLICT specification" → PostgREST returns 400).
-- This broke registerPendingShort on the first attempt during prod cron run
-- 2026-05-14, so discovery aborted before registering any PENDING rows.
--
-- A regular UNIQUE constraint works as an ON CONFLICT target. Per the SQL
-- standard (NULLS DISTINCT, the Postgres default), multiple NULL values are
-- allowed in UNIQUE, so the semantic guarantee is unchanged: long-tail
-- clip_details rows can still have NULL content_id, but each populated
-- content_id must be unique.

DROP INDEX IF EXISTS clip_details_content_id_idx;

ALTER TABLE clip_details
  ADD CONSTRAINT clip_details_content_id_unique UNIQUE (content_id);
