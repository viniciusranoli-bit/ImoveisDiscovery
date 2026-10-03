ALTER TABLE tb_search_runs
  ADD COLUMN IF NOT EXISTS saved_search_id uuid REFERENCES tb_saved_searches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_tb_search_runs_saved_search_id
  ON tb_search_runs (saved_search_id, completed_at DESC)
  WHERE saved_search_id IS NOT NULL;

COMMENT ON COLUMN tb_search_runs.saved_search_id IS 'Agendamento que originou a coleta, para acumular resultados entre execuções horárias.';

UPDATE tb_search_runs run
SET saved_search_id = saved.id
FROM tb_saved_searches saved
WHERE saved.latest_search_run_id = run.id
  AND run.saved_search_id IS NULL;
