"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthSetupGuide, type AuthSetupView } from "@/app/components/auth-setup-guide";

type LocalMode = "login" | "register";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const initialMode: LocalMode =
    params.get("cadastro") === "1" || params.get("mode") === "register" ? "register" : "login";
  const [localMode, setLocalMode] = useState<LocalMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState(params.get("error") ?? "");
  const [loading, setLoading] = useState(false);
  const [setup, setSetup] = useState<AuthSetupView>();

  useEffect(() => {
    fetch("/api/auth/setup", { cache: "no-store" })
      .then(async (response) => response.json())
      .then((data) => setSetup(data as AuthSetupView))
      .catch(() => undefined);
  }, []);

  function switchLocalMode(next: LocalMode) {
    setLocalMode(next);
    setError("");
    setPasswordConfirm("");
  }

  async function submitLocal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (localMode === "register" && password !== passwordConfirm) {
        throw new Error("As senhas não coincidem.");
      }
      const endpoint = localMode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body =
        localMode === "login"
          ? { email, password }
          : { email, password, displayName };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Não foi possível continuar.");
      const next = params.get("next") || "/";
      router.replace(next);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível continuar.");
    } finally {
      setLoading(false);
    }
  }

  const googleReady = setup?.googleEnabled ?? false;
  const isRegister = localMode === "register";

  return (
    <div className="login-shell login-shell-wide">
      <section className="login-brand">
        <p className="eyebrow">Radar de imóveis</p>
        <h1>Acesso ao painel</h1>
        <p>Conta local com e-mail e senha, ou Google quando configurado.</p>
        {setup && (
          <details className="auth-setup-details">
            <summary>Configuração técnica (Google / AUTH_SECRET)</summary>
            <AuthSetupGuide setup={setup} />
          </details>
        )}
      </section>
      <div className="login-stack">
        <section className="login-card" aria-labelledby="local-auth-title">
          <p className="eyebrow">Conta local</p>
          <h2 id="local-auth-title">{isRegister ? "Criar conta" : "Entrar"}</h2>
          <p className="login-card-lead">
            {isRegister
              ? "Informe nome, e-mail e senha. O e-mail será seu login."
              : "Use o e-mail e a senha já cadastrados."}
          </p>
          <form
            className="local-auth-form"
            method="post"
            action="#"
            onSubmit={(event) => {
              void submitLocal(event);
            }}
          >
            {isRegister && (
              <label htmlFor="local-name">
                Nome
                <input
                  id="local-name"
                  name="displayName"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  autoComplete="name"
                  required
                />
              </label>
            )}
            <label htmlFor="local-email">
              E-mail (login)
              <input
                id="local-email"
                type="email"
                name="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label htmlFor="local-password">
              Senha
              <input
                id="local-password"
                type="password"
                name="password"
                autoComplete={isRegister ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
              />
            </label>
            {isRegister && (
              <label htmlFor="local-password-confirm">
                Confirmar senha
                <input
                  id="local-password-confirm"
                  type="password"
                  name="passwordConfirm"
                  autoComplete="new-password"
                  value={passwordConfirm}
                  onChange={(event) => setPasswordConfirm(event.target.value)}
                  required
                  minLength={8}
                />
              </label>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="local-auth-submit" disabled={loading}>
              {loading ? "Aguarde…" : isRegister ? "Criar conta" : "Entrar"}
            </button>
            <p className="auth-mode-switch">
              {isRegister ? (
                <>
                  Já tem conta?{" "}
                  <button type="button" onClick={() => switchLocalMode("login")}>
                    Entrar
                  </button>
                </>
              ) : (
                <>
                  Primeira vez?{" "}
                  <button type="button" onClick={() => switchLocalMode("register")}>
                    Criar conta
                  </button>
                </>
              )}
            </p>
          </form>
        </section>

        <section className="login-card login-card-google" aria-labelledby="google-auth-title">
          <p className="eyebrow">Google</p>
          <h2 id="google-auth-title">Entrar com Google</h2>
          <p className="login-card-lead">Requer OAuth configurado no backend.</p>
          {googleReady ? (
            <a className="google-login-button" href="/api/auth/google">
              Continuar com Google
            </a>
          ) : (
            <p className="hint google-disabled-hint">
              Configure <code>GOOGLE_CLIENT_ID</code> e <code>GOOGLE_CLIENT_SECRET</code> em{" "}
              <code>backend/.env</code>.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
