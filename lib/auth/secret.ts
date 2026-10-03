import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const PLACEHOLDER = "<YOUR_AUTH_SECRET>";
const devSecretPath = () => path.join(process.cwd(), "backend", ".auth-secret.local");

export type AuthSecretSource = "env" | "dev-file" | "missing";

export function getAuthSecretFromProcess() {
  const value = process.env.AUTH_SECRET?.trim();
  if (value && value !== PLACEHOLDER) return value;
  return undefined;
}

/** Só no servidor Node: garante AUTH_SECRET em dev via arquivo ignorado pelo git. */
export function ensureAuthSecretInProcess(): AuthSecretSource {
  const fromEnv = getAuthSecretFromProcess();
  if (fromEnv) return "env";

  if (process.env.NODE_ENV === "production") return "missing";

  const filePath = devSecretPath();
  let secret = existsSync(filePath) ? readFileSync(filePath, "utf8").trim() : "";
  if (!secret) {
    secret = randomBytes(32).toString("base64url");
    writeFileSync(filePath, `${secret}\n`, { encoding: "utf8" });
  }
  process.env.AUTH_SECRET = secret;
  return "dev-file";
}
