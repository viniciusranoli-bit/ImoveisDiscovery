CREATE TABLE IF NOT EXISTS tb_dismissed_listings (
  user_id uuid NOT NULL REFERENCES tb_users (id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES tb_properties (id) ON DELETE CASCADE,
  canonical_url text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('rent', 'sale')),
  property_type text NOT NULL CHECK (property_type IN ('apartment', 'penthouse', 'unknown')),
  listing_snapshot jsonb NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, property_id, canonical_url)
);

CREATE INDEX IF NOT EXISTS ix_tb_dismissed_listings_user_purpose
  ON tb_dismissed_listings (user_id, purpose, dismissed_at DESC);

COMMENT ON TABLE tb_dismissed_listings IS 'Imóveis descartados pelo usuário; não voltam aos resultados e aparecem no histórico da finalidade.';
