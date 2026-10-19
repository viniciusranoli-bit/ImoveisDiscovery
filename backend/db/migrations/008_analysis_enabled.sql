ALTER TABLE tb_saved_searches
  ADD COLUMN IF NOT EXISTS analysis_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN tb_saved_searches.analysis_enabled IS 'Mantém a análise automática de compra ligada sem apagar a busca horária.';
