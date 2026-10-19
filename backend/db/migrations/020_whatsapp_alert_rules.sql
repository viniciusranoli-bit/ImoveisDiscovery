CREATE TABLE IF NOT EXISTS tb_whatsapp_alert_rules (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL,
  created_by uuid REFERENCES tb_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_tb_whatsapp_alert_rules_enabled
  ON tb_whatsapp_alert_rules (enabled, updated_at DESC);

CREATE TABLE IF NOT EXISTS tb_whatsapp_alert_deliveries (
  id uuid PRIMARY KEY,
  rule_id uuid NOT NULL REFERENCES tb_whatsapp_alert_rules(id) ON DELETE CASCADE,
  property_id uuid REFERENCES tb_properties(id) ON DELETE SET NULL,
  listing_link text,
  idempotency_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  provider_message_id text,
  error text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS ix_tb_whatsapp_alert_deliveries_rule
  ON tb_whatsapp_alert_deliveries (rule_id, sent_at DESC);

COMMENT ON TABLE tb_whatsapp_alert_rules IS
  'Regras administrativas para alertas WhatsApp quando um imóvel atinge filtros configurados.';
COMMENT ON TABLE tb_whatsapp_alert_deliveries IS
  'Histórico de envios WhatsApp com idempotência por imóvel e regra.';
