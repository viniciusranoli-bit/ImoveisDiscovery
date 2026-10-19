-- Usuários, sessões, favoritos, disposição de coberturas e contagem de buscas manuais.

CREATE TABLE tb_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  display_name text NOT NULL,
  password_hash text,
  google_sub text,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  search_quota integer NOT NULL DEFAULT 10,
  searches_used integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_tb_users_email UNIQUE (email),
  CONSTRAINT ck_tb_users_auth CHECK (password_hash IS NOT NULL OR google_sub IS NOT NULL)
);

COMMENT ON TABLE tb_users IS 'Contas que acessam o painel; limite de buscas manual por usuário.';
COMMENT ON COLUMN tb_users.search_quota IS 'Número máximo de buscas manuais permitidas; o admin pode aumentar.';
COMMENT ON COLUMN tb_users.searches_used IS 'Buscas manuais já consumidas (POST /api/collect).';

CREATE TABLE tb_user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES tb_users (id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_tb_user_sessions_user_id ON tb_user_sessions (user_id);
CREATE INDEX ix_tb_user_sessions_expires_at ON tb_user_sessions (expires_at);

COMMENT ON TABLE tb_user_sessions IS 'Sessões ativas referenciadas pelo cookie httpOnly do navegador.';

CREATE TABLE tb_user_favorites (
  user_id uuid NOT NULL REFERENCES tb_users (id) ON DELETE CASCADE,
  listing_key text NOT NULL,
  property_id uuid REFERENCES tb_properties (id) ON DELETE SET NULL,
  listing_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_key)
);

COMMENT ON TABLE tb_user_favorites IS 'Imóveis marcados com estrela pelo usuário (aluguel ou compra).';

CREATE TABLE tb_penthouse_dispositions (
  user_id uuid NOT NULL REFERENCES tb_users (id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES tb_properties (id) ON DELETE CASCADE,
  canonical_url text NOT NULL,
  disposition text NOT NULL CHECK (disposition IN ('saved', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, property_id, canonical_url)
);

COMMENT ON TABLE tb_penthouse_dispositions IS 'Salvar ou descartar coberturas de compra; descartadas vão ao histórico sem interesse.';
