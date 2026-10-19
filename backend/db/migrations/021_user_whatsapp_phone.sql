ALTER TABLE tb_users
  ADD COLUMN IF NOT EXISTS whatsapp_phone_e164 text;

COMMENT ON COLUMN tb_users.whatsapp_phone_e164 IS
  'Telefone WhatsApp (somente dígitos, ex. 5521...) para alertas Evolution; um número por usuário.';
