-- supabase/migrations/20260429_studio_snapshots.sql
-- Watchdog table for the YouTube Studio scraper. Mirrors posts schema for
-- shared columns so drift-detection JOINs are trivial; adds Studio-exclusive
-- columns the YouTube Analytics API does not return (hypes, hype_points,
-- stayed_to_watch_pct, viewer cohorts).
--
-- The Vercel cron at /api/cron/youtube-sync remains the source of truth for
-- the posts table. studio_snapshots exists only as a verification source.

CREATE TABLE IF NOT EXISTS studio_snapshots (
  id                          BIGSERIAL PRIMARY KEY,
  clip_details_code           TEXT NOT NULL,
  platform                    TEXT NOT NULL,
  stat_date                   DATE NOT NULL,

  -- columns mirrored from posts (same names so JOIN ON these is clean)
  views                       INTEGER,
  watch_time_hours            NUMERIC,
  impressions                 INTEGER,
  impression_ctr              NUMERIC,
  avg_view_duration_seconds   NUMERIC,
  avg_view_percentage         NUMERIC,
  subscribers_gained          INTEGER,
  subscribers_lost            INTEGER,
  likes                       INTEGER,
  comments                    INTEGER,
  shares                      INTEGER,

  -- Studio-exclusive columns (not present in posts)
  stayed_to_watch_pct         NUMERIC,
  unique_viewers              INTEGER,
  new_viewers                 INTEGER,
  casual_viewers              INTEGER,
  regular_viewers             INTEGER,
  returning_viewers           INTEGER,
  hypes                       INTEGER,
  hype_points                 INTEGER,

  -- bookkeeping
  scraped_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Real UNIQUE CONSTRAINT (not a partial index) so PostgREST can resolve
-- ON CONFLICT during upserts from the scraper.
ALTER TABLE studio_snapshots
  ADD CONSTRAINT studio_snapshots_clip_platform_date_key
  UNIQUE (clip_details_code, platform, stat_date);

CREATE INDEX IF NOT EXISTS studio_snapshots_stat_date_idx
  ON studio_snapshots (stat_date DESC);

ALTER TABLE studio_snapshots DISABLE ROW LEVEL SECURITY;
