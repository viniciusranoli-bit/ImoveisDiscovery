CREATE TABLE IF NOT EXISTS tb_chat_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES tb_users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_tb_chat_sessions_user_updated
  ON tb_chat_sessions (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS tb_chat_messages (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES tb_chat_sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_tb_chat_messages_session_created
  ON tb_chat_messages (session_id, created_at ASC);

COMMENT ON TABLE tb_chat_sessions IS
  'Sessões do assistente conversacional por usuário.';
COMMENT ON TABLE tb_chat_messages IS
  'Histórico de mensagens do assistente; metadata guarda sugestões de filtros e regras citadas.';
