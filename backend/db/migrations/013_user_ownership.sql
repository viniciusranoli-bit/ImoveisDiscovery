ALTER TABLE tb_properties
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES tb_users (id) ON DELETE SET NULL;

ALTER TABLE tb_search_runs
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES tb_users (id) ON DELETE SET NULL;

ALTER TABLE tb_saved_searches
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES tb_users (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS ix_tb_properties_user_id ON tb_properties (user_id);
CREATE INDEX IF NOT EXISTS ix_tb_search_runs_user_id ON tb_search_runs (user_id);
CREATE INDEX IF NOT EXISTS ix_tb_saved_searches_user_id ON tb_saved_searches (user_id);

COMMENT ON COLUMN tb_properties.user_id IS 'Usuário que introduziu o imóvel no painel (primeira coleta vinculada).';
COMMENT ON COLUMN tb_search_runs.user_id IS 'Usuário responsável pela descoberta e coleta multiportal.';
COMMENT ON COLUMN tb_saved_searches.user_id IS 'Dono do agendamento e das execuções horárias associadas.';

DO $$
DECLARE
  target uuid;
BEGIN
  SELECT id INTO target FROM tb_users WHERE lower(email) = lower('viniciusranoli@gmail.com');
  IF target IS NULL THEN
    RAISE NOTICE 'Usuário viniciusranoli@gmail.com não encontrado; backfill ignorado.';
    RETURN;
  END IF;

  UPDATE tb_properties SET user_id = target WHERE user_id IS NULL;
  UPDATE tb_search_runs SET user_id = target WHERE user_id IS NULL;
  UPDATE tb_saved_searches SET user_id = target WHERE user_id IS NULL;

  UPDATE tb_search_runs run
  SET user_id = target
  FROM tb_saved_searches saved
  WHERE run.saved_search_id = saved.id
    AND run.user_id IS NULL
    AND saved.user_id = target;
END $$;

ALTER TABLE tb_saved_searches DROP CONSTRAINT IF EXISTS uq_tb_saved_searches_search_key;
ALTER TABLE tb_saved_searches
  ADD CONSTRAINT uq_tb_saved_searches_user_search_key UNIQUE (user_id, search_key);
