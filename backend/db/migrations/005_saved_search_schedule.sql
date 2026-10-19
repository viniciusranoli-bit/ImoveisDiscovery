ALTER TABLE saved_searches
  ADD COLUMN IF NOT EXISTS analysis_interval_minutes integer NOT NULL DEFAULT 360
    CHECK (analysis_interval_minutes IN (60, 180, 360, 720, 1440)),
  ADD COLUMN IF NOT EXISTS analysis_batch_count text NOT NULL DEFAULT '5'
    CHECK (analysis_batch_count IN ('5', '10', '15', 'all')),
  ADD COLUMN IF NOT EXISTS last_searched_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_analyzed_at timestamptz,
  ADD COLUMN IF NOT EXISTS latest_search_run_id uuid,
  ADD COLUMN IF NOT EXISTS search_error text,
  ADD COLUMN IF NOT EXISTS analysis_error text;

CREATE TABLE IF NOT EXISTS scheduler_runs (
  id uuid PRIMARY KEY,
  saved_search_id uuid NOT NULL REFERENCES saved_searches(id) ON DELETE CASCADE,
  job_kind text NOT NULL CHECK (job_kind IN ('search', 'analysis')),
  status text NOT NULL CHECK (status IN ('completed', 'failed')),
  message text,
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scheduler_runs_started_at
  ON scheduler_runs (started_at DESC);
