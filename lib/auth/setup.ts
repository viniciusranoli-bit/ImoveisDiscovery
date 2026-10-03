import { googleOAuthEnabled, googleRedirectUri } from "@/lib/auth/google";
import { ensureAuthSecretInProcess, getAuthSecretFromProcess } from "@/lib/auth/secret";

export function isAuthSecretConfigured() {
  return Boolean(getAuthSecretFromProcess());
}

export function authSetupStatus(request: Request) {
  const authSecretSource = ensureAuthSecretInProcess();
  const googleClientId = Boolean(process.env.GOOGLE_CLIENT_ID?.trim());
  const googleClientSecret = Boolean(process.env.GOOGLE_CLIENT_SECRET?.trim());
  const redirectUri = googleRedirectUri(request);
  return {
    authSecretConfigured: isAuthSecretConfigured(),
    authSecretSource,
    googleEnabled: googleOAuthEnabled(),
    googleClientIdConfigured: googleClientId,
    googleClientSecretConfigured: googleClientSecret,
    googleRedirectUri: redirectUri,
    adminEmailsConfigured: Boolean(process.env.ADMIN_EMAILS?.trim()),
    googleChecklist: [
      "No Google Cloud Console, crie um projeto (ou use um existente).",
      "Em APIs e serviços → Tela de consentimento OAuth, configure o app (interno ou externo).",
      "Em Credenciais, crie ID do client OAuth 2.0 do tipo Aplicativo da Web.",
      `Em URIs de redirecionamento autorizados, adicione exatamente: ${redirectUri}`,
      "Copie o Client ID para GOOGLE_CLIENT_ID e o Client secret para GOOGLE_CLIENT_SECRET em backend/.env.",
      "Em produção, defina AUTH_SECRET em backend/.env. Em desenvolvimento, um segredo local é gerado automaticamente se faltar.",
      "Opcional: ADMIN_EMAILS com e-mails separados por vírgula recebem perfil admin no cadastro.",
      "Reinicie o servidor (npm run dev) após alterar backend/.env.",
    ],
  };
}

export function assertAuthConfigured() {
  ensureAuthSecretInProcess();
  if (!isAuthSecretConfigured()) {
    throw new Error(
      "Autenticação não configurada: defina AUTH_SECRET em backend/.env (veja backend/.env.example) e reinicie o servidor.",
    );
  }
}
