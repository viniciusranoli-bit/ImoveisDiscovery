ALTER TABLE tb_property_analyses
  ADD COLUMN IF NOT EXISTS trigger_source text NOT NULL DEFAULT 'manual'
    CHECK (trigger_source IN ('manual', 'scheduled'));

CREATE INDEX IF NOT EXISTS ix_tb_property_analyses_trigger
  ON tb_property_analyses (trigger_source, analyzed_at DESC);

COMMENT ON COLUMN tb_property_analyses.trigger_source IS
  'Indica se a análise de laje/churrasqueira foi solicitada na interface ou pelo agendador.';
