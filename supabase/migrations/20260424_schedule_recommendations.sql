CREATE TABLE IF NOT EXISTS schedule_recommendations (
  id BIGSERIAL PRIMARY KEY,
  platform TEXT NOT NULL DEFAULT 'youtube',
  analysis_window_days INTEGER NOT NULL,
  slot_analysis JSONB NOT NULL,
  recommended_schedule JSONB NOT NULL,
  narrative_markdown TEXT,
  tokens_used INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schedule_recs_created ON schedule_recommendations (created_at DESC);
ALTER TABLE schedule_recommendations DISABLE ROW LEVEL SECURITY;
