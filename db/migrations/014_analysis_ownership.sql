ALTER TABLE tb_property_analyses
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES tb_users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_tb_property_analyses_user_id
  ON tb_property_analyses (user_id);

COMMENT ON COLUMN tb_property_analyses.user_id IS
  'Usuário que solicitou a classificação por IA; em execuções agendadas, é o dono da busca salva.';

UPDATE tb_property_analyses analysis
SET user_id = owner.id
FROM tb_users owner
WHERE analysis.user_id IS NULL
  AND lower(owner.email) = lower('viniciusranoli@gmail.com');
