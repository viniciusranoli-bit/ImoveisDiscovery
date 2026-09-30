CREATE TABLE IF NOT EXISTS saved_searches (
  id uuid PRIMARY KEY,
  search_key text NOT NULL UNIQUE,
  title text NOT NULL,
  city text NOT NULL,
  neighborhood text NOT NULL,
  filters jsonb NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_searches_saved_at
  ON saved_searches (saved_at DESC);
