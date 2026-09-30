CREATE TABLE IF NOT EXISTS property_analysis_reviews (
  id uuid PRIMARY KEY,
  analysis_id uuid NOT NULL UNIQUE
    REFERENCES property_analyses(id) ON DELETE CASCADE,
  slab_rights_answer text
    CHECK (slab_rights_answer IS NULL OR slab_rights_answer IN ('yes', 'no', 'unknown')),
  balcony_barbecue_answer text
    CHECK (balcony_barbecue_answer IS NULL OR balcony_barbecue_answer IN ('yes', 'no', 'unknown')),
  answered_at timestamptz NOT NULL DEFAULT now(),
  CHECK (slab_rights_answer IS NOT NULL OR balcony_barbecue_answer IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_property_analysis_reviews_answered_at
  ON property_analysis_reviews (answered_at DESC);
