CREATE TABLE IF NOT EXISTS post_breakdowns (
  id BIGSERIAL PRIMARY KEY,
  clip_details_code TEXT NOT NULL,
  clip_code TEXT,
  content_id TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'youtube',
  stat_date DATE NOT NULL,
  dimension_type TEXT NOT NULL,
  dimension_value TEXT NOT NULL,
  views INTEGER DEFAULT 0,
  watch_time_minutes NUMERIC DEFAULT 0,
  avg_view_duration_seconds NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT post_breakdowns_unique UNIQUE (content_id, platform, stat_date, dimension_type, dimension_value)
);

CREATE INDEX IF NOT EXISTS idx_post_breakdowns_clip ON post_breakdowns (clip_details_code);
CREATE INDEX IF NOT EXISTS idx_post_breakdowns_dim_type ON post_breakdowns (dimension_type);
CREATE INDEX IF NOT EXISTS idx_post_breakdowns_stat_date ON post_breakdowns (stat_date);

ALTER TABLE post_breakdowns DISABLE ROW LEVEL SECURITY;
