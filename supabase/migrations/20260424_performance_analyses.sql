CREATE TABLE IF NOT EXISTS performance_analyses (
  id BIGSERIAL PRIMARY KEY,
  platform TEXT NOT NULL DEFAULT 'youtube',
  date_range_start DATE NOT NULL,
  date_range_end DATE NOT NULL,
  analysis_markdown TEXT NOT NULL,
  input_summary JSONB,
  model_used TEXT,
  tokens_used INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_perf_analyses_created ON performance_analyses (created_at DESC);
ALTER TABLE performance_analyses DISABLE ROW LEVEL SECURITY;
