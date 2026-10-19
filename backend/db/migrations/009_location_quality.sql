ALTER TABLE tb_properties
  ADD COLUMN IF NOT EXISTS location_status text NOT NULL DEFAULT 'unknown'
  CHECK (location_status IN ('confirmed', 'unknown', 'excluded'));

COMMENT ON COLUMN tb_properties.location_status IS
  'Classifica a confiança geográfica: Rio confirmado, cidade não determinada ou localização incompatível excluída.';

CREATE INDEX IF NOT EXISTS ix_tb_properties_location_status
  ON tb_properties (location_status);

COMMENT ON INDEX ix_tb_properties_location_status IS
  'Acelera a separação de imóveis confirmados, pendentes e excluídos por localização.';
