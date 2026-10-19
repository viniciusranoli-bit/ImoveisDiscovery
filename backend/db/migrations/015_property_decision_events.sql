CREATE TABLE IF NOT EXISTS tb_property_decision_events (
  id uuid PRIMARY KEY,
  property_id uuid REFERENCES tb_properties(id) ON DELETE SET NULL,
  listing_id text,
  user_id uuid REFERENCES tb_users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  source text NOT NULL CHECK (source IN ('interface', 'ide', 'migration', 'system')),
  purpose text CHECK (purpose IN ('sale', 'rent')),
  before_data jsonb,
  after_data jsonb,
  changed_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason text,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  learning_status text NOT NULL DEFAULT 'pending'
    CHECK (learning_status IN ('pending', 'accepted', 'rejected', 'applied')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_tb_property_decision_events_property
  ON tb_property_decision_events (property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_tb_property_decision_events_learning
  ON tb_property_decision_events (learning_status, created_at DESC);

COMMENT ON TABLE tb_property_decision_events IS
  'Audita decisões, correções e feedbacks sobre imóveis para aprendizado controlado da IA.';
COMMENT ON COLUMN tb_property_decision_events.source IS
  'Origem da alteração: interface, IDE, migration ou sistema.';
COMMENT ON COLUMN tb_property_decision_events.learning_status IS
  'Controla se o evento pode ser usado como preferência aprendida.';

CREATE OR REPLACE FUNCTION pr_audit_property_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  actor uuid;
  reason text;
  changed jsonb := '[]'::jsonb;
BEGIN
  actor := NULLIF(current_setting('app.user_id', true), '')::uuid;
  reason := NULLIF(current_setting('app.change_reason', true), '');
  IF TG_OP = 'UPDATE' THEN
    SELECT COALESCE(jsonb_agg(key ORDER BY key), '[]'::jsonb)
      INTO changed
      FROM jsonb_object_keys(to_jsonb(NEW)) AS key
     WHERE to_jsonb(OLD) -> key IS DISTINCT FROM to_jsonb(NEW) -> key;
  ELSIF TG_OP = 'INSERT' THEN
    SELECT COALESCE(jsonb_agg(key ORDER BY key), '[]'::jsonb)
      INTO changed
      FROM jsonb_object_keys(to_jsonb(NEW)) AS key;
  END IF;
  INSERT INTO tb_property_decision_events (
    id, property_id, user_id, event_type, source, before_data, after_data,
    changed_fields, reason
  )
  VALUES (
    gen_random_uuid(),
    COALESCE(NEW.id, OLD.id),
    actor,
    CASE TG_OP WHEN 'INSERT' THEN 'property_created'
      WHEN 'UPDATE' THEN 'property_updated'
      ELSE 'property_deleted' END,
    COALESCE(NULLIF(current_setting('app.change_source', true), ''), 'ide'),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    changed,
    reason
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tr_audit_tb_properties ON tb_properties;
CREATE TRIGGER tr_audit_tb_properties
AFTER INSERT OR UPDATE OR DELETE ON tb_properties
FOR EACH ROW EXECUTE FUNCTION pr_audit_property_change();
