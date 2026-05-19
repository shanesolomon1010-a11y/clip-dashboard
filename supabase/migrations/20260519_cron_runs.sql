-- 20260519_cron_runs.sql
-- Tracks every cron invocation with start/finish timestamps, status, and
-- error metadata. Replaces the "posts.updated_at" proxy with a direct
-- did-this-cron-complete signal so /api/diagnostics can alert on silent
-- cron failures (Vercel cron disabled, function timeout before any DB
-- write, schedule misconfiguration, etc.) that the data-freshness path
-- can't detect.
--
-- RLS: enabled with no policies. Service-role writes only; anon-client
-- has no access. /api/diagnostics' new cron_completion check uses the
-- supabaseAdmin client (mirrors auth_health pattern) to read this table.

CREATE TABLE IF NOT EXISTS cron_runs (
  id BIGSERIAL PRIMARY KEY,
  cron_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'partial', 'failed')),
  rows_processed INT,
  errors INT DEFAULT 0,
  error_message TEXT,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS cron_runs_name_started_idx
  ON cron_runs(cron_name, started_at DESC);

ALTER TABLE cron_runs ENABLE ROW LEVEL SECURITY;
