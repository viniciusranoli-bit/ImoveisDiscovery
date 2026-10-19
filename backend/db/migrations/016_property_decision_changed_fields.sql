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
