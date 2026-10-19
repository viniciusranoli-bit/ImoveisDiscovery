export type AuthSetupView = {
  authSecretConfigured: boolean;
  authSecretSource?: "env" | "dev-file" | "missing";
  googleEnabled: boolean;
  googleClientIdConfigured: boolean;
  googleClientSecretConfigured: boolean;
  googleRedirectUri: string;
  googleChecklist: string[];
};

export function AuthSetupGuide({ setup }: { setup: AuthSetupView }) {
  return (
    <section className="auth-setup-panel" aria-labelledby="auth-setup-title">
      <h2 id="auth-setup-title">Configuração de acesso</h2>
      <ul className="auth-setup-status">
        <li className={setup.authSecretConfigured ? "ok" : "missing"}>
          AUTH_SECRET{" "}
          {setup.authSecretSource === "dev-file"
            ? "gerado para desenvolvimento (.auth-secret.local)"
            : setup.authSecretConfigured
              ? "definido"
              : "ausente — necessário em produção"}
        </li>
        <li className={setup.googleClientIdConfigured ? "ok" : "missing"}>
          GOOGLE_CLIENT_ID {setup.googleClientIdConfigured ? "definido" : "ausente"}
        </li>
        <li className={setup.googleClientSecretConfigured ? "ok" : "missing"}>
          GOOGLE_CLIENT_SECRET {setup.googleClientSecretConfigured ? "definido" : "ausente"}
        </li>
        <li className={setup.googleEnabled ? "ok" : "missing"}>
          Login com Google {setup.googleEnabled ? "pronto" : "incompleto"}
        </li>
      </ul>
      {!setup.authSecretConfigured && (
        <p className="collection-notice">
          Criação de conta e login exigem <code>AUTH_SECRET</code> em{" "}
          <code>backend/.env</code>. Use uma string longa aleatória, salve o arquivo e reinicie{" "}
          <code>npm run dev</code>.
        </p>
      )}
      <details open={!setup.googleEnabled}>
        <summary>Passos para autenticar com e-mail Google</summary>
        <ol>
          {setup.googleChecklist.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="hint">
          URI de redirecionamento deste ambiente:{" "}
          <code>{setup.googleRedirectUri}</code>
        </p>
      </details>
    </section>
  );
}
