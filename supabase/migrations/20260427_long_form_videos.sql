-- supabase/migrations/20260427_long_form_videos.sql
-- Adds the long_form_videos catalog table used by the long-form sync pipeline,
-- plus a partial unique index on posts to support the long-form upsert conflict
-- key (content_id, platform, stat_date). Scoped to content_type='long_form' so
-- it does not affect existing Shorts rows (which legitimately share clip_code
-- across multiple clip_details_code values within the same episode).

CREATE TABLE IF NOT EXISTS long_form_videos (
  video_id          text PRIMARY KEY,
  title             text NOT NULL,
  duration_seconds  integer NOT NULL,
  published_at      timestamptz NOT NULL,
  privacy_status    text NOT NULL,
  thumbnail_url     text,
  discovered_at     timestamptz NOT NULL DEFAULT now(),
  last_synced_at    timestamptz
);

CREATE INDEX IF NOT EXISTS long_form_videos_published_at_idx
  ON long_form_videos (published_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS posts_contentid_platform_statdate_idx
  ON posts (content_id, platform, stat_date)
  WHERE content_id IS NOT NULL AND content_type = 'long_form';
