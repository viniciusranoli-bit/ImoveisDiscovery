ALTER TABLE saved_searches
  ADD COLUMN IF NOT EXISTS neighborhoods jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE saved_searches
SET neighborhoods = to_jsonb(ARRAY[neighborhood])
WHERE neighborhoods = '[]'::jsonb
  AND neighborhood <> '';

CREATE TABLE IF NOT EXISTS property_purpose_research (
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('rent', 'sale')),
  last_researched_at timestamptz NOT NULL,
  PRIMARY KEY (property_id, purpose)
);

INSERT INTO property_purpose_research (property_id, purpose, last_researched_at)
SELECT id, 'sale', last_researched_at
FROM properties
WHERE last_researched_at IS NOT NULL
ON CONFLICT (property_id, purpose) DO NOTHING;

ALTER TABLE property_analyses
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'sale'
  CHECK (purpose IN ('rent', 'sale'));

CREATE INDEX IF NOT EXISTS idx_property_purpose_research_lookup
  ON property_purpose_research (purpose, last_researched_at);
