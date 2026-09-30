CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS search_runs (
  id uuid PRIMARY KEY,
  query text NOT NULL,
  city text NOT NULL,
  neighborhood text NOT NULL,
  filters jsonb NOT NULL,
  discovery_response jsonb,
  searched_at timestamptz NOT NULL,
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'discovered'
    CHECK (status IN ('discovered', 'completed', 'failed')),
  discovered_count integer NOT NULL DEFAULT 0 CHECK (discovered_count >= 0),
  eligible_count integer NOT NULL DEFAULT 0 CHECK (eligible_count >= 0),
  suppressed_count integer NOT NULL DEFAULT 0 CHECK (suppressed_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS source_collections (
  search_run_id uuid NOT NULL REFERENCES search_runs(id) ON DELETE CASCADE,
  source text NOT NULL,
  search_url text NOT NULL,
  status text NOT NULL CHECK (status IN ('ok', 'blocked', 'empty', 'error')),
  http_status integer,
  found integer NOT NULL DEFAULT 0 CHECK (found >= 0),
  message text,
  duration_ms integer NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  collected_at timestamptz NOT NULL,
  PRIMARY KEY (search_run_id, source, search_url)
);

CREATE TABLE IF NOT EXISTS properties (
  id uuid PRIMARY KEY,
  identity_key text NOT NULL UNIQUE,
  property_type text NOT NULL CHECK (property_type IN ('apartment', 'penthouse', 'unknown')),
  neighborhood text NOT NULL,
  location text,
  bedrooms integer CHECK (bedrooms IS NULL OR bedrooms >= 0),
  parking_spaces integer CHECK (parking_spaces IS NULL OR parking_spaces >= 0),
  area_m2 numeric(12, 2) CHECK (area_m2 IS NULL OR area_m2 >= 0),
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  last_researched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS property_listings (
  id uuid PRIMARY KEY,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  source text NOT NULL,
  external_id text NOT NULL,
  canonical_url text NOT NULL,
  source_search_url text NOT NULL,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  UNIQUE (source, external_id)
);

CREATE TABLE IF NOT EXISTS search_results (
  search_run_id uuid NOT NULL REFERENCES search_runs(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  listing_snapshot jsonb NOT NULL,
  seen_at timestamptz NOT NULL,
  eligible_for_research boolean NOT NULL,
  suppressed_until timestamptz,
  PRIMARY KEY (search_run_id, property_id),
  CHECK (
    (eligible_for_research AND suppressed_until IS NULL)
    OR (NOT eligible_for_research AND suppressed_until IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS property_analyses (
  id uuid PRIMARY KEY,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  analysis_kind text NOT NULL DEFAULT 'features'
    CHECK (analysis_kind IN ('features')),
  result jsonb NOT NULL,
  model text NOT NULL,
  description_source text NOT NULL,
  analyzed_at timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_until > analyzed_at)
);

CREATE INDEX IF NOT EXISTS idx_search_runs_searched_at
  ON search_runs (searched_at DESC);
CREATE INDEX IF NOT EXISTS idx_properties_last_seen_at
  ON properties (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_properties_last_researched_at
  ON properties (last_researched_at);
CREATE INDEX IF NOT EXISTS idx_property_listings_property_id
  ON property_listings (property_id);
CREATE INDEX IF NOT EXISTS idx_search_results_history
  ON search_results (seen_at DESC, eligible_for_research);
CREATE INDEX IF NOT EXISTS idx_search_results_property
  ON search_results (property_id, seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_property_analyses_valid
  ON property_analyses (property_id, analysis_kind, valid_until DESC);
