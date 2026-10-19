const PLACEHOLDER = "<YOUR_AUTH_SECRET>";

export type AuthSecretSource = "env" | "missing";

export function getAuthSecretFromProcess() {
  const value = process.env.AUTH_SECRET?.trim();
  if (value && value !== PLACEHOLDER) return value;
  return undefined;
}

/** Segredos são sempre explícitos via ambiente; nunca são gerados no runtime. */
export function ensureAuthSecretInProcess(): AuthSecretSource {
  const fromEnv = getAuthSecretFromProcess();
  return fromEnv ? "env" : "missing";
}
