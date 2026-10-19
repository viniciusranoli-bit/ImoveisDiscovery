ALTER TABLE tb_dismissed_listings
  ADD COLUMN IF NOT EXISTS dismissed_by_ai boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN tb_dismissed_listings.dismissed_by_ai IS
  'Indica que o apartamento de compra foi descartado automaticamente após a IA confirmar ausência de laje e churrasqueira.';
