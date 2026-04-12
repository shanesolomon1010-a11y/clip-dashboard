-- supabase/migrations/20260411_posts_youtube_upsert_constraint.sql
-- Safe to run even if constraint already exists in the live database (IF NOT EXISTS).
CREATE UNIQUE INDEX IF NOT EXISTS posts_clip_platform_statdate_idx
  ON posts (clip_details_code, platform, stat_date);
