CREATE TABLE IF NOT EXISTS weekly_reports (
  id BIGSERIAL PRIMARY KEY,
  platform TEXT NOT NULL DEFAULT 'youtube',
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  report_markdown TEXT NOT NULL,
  input_summary JSONB,
  model_used TEXT,
  tokens_used INTEGER,
  triggered_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weekly_reports_created ON weekly_reports (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_week ON weekly_reports (week_start DESC);
ALTER TABLE weekly_reports DISABLE ROW LEVEL SECURITY;
