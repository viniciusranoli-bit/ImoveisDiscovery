import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const rootEnv = path.join(root, ".env");
const backendEnv = path.join(root, "backend", ".env");
const dockerEnv = path.join(root, "docker.env");

const composeKeys = ["DATABASE_NAME", "DB_USER", "DB_PASSWORD", "APP_PORT"] as const;

function parseEnv(content: string) {
  const map = new Map<string, string>();
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    map.set(trimmed.slice(0, index).trim(), trimmed.slice(index + 1).trim());
  }
  return map;
}

function isPlaceholder(value: string) {
  return !value || value.startsWith("<YOUR_");
}

function main() {
  const merged = new Map<string, string>();
  if (existsSync(dockerEnv)) {
    for (const [key, value] of parseEnv(readFileSync(dockerEnv, "utf8"))) {
      merged.set(key, value);
    }
  }
  if (existsSync(backendEnv)) {
    for (const [key, value] of parseEnv(readFileSync(backendEnv, "utf8"))) {
      if (composeKeys.includes(key as (typeof composeKeys)[number]) && !isPlaceholder(value)) {
        merged.set(key, value);
      }
    }
  } else {
    console.warn(
      "backend/.env não encontrado. Use docker.env. Copie backend/.env.example e defina AUTH_SECRET antes de usar o app.",
    );
  }
  const lines = composeKeys.filter((key) => merged.has(key)).map((key) => `${key}=${merged.get(key)}`);
  if (!lines.length) {
    if (existsSync(dockerEnv)) {
      copyFileSync(dockerEnv, rootEnv);
      return;
    }
    throw new Error("Nenhuma variável de banco encontrada. Crie backend/.env ou docker.env.");
  }
  writeFileSync(rootEnv, `${lines.join("\n")}\n`, "utf8");
}

main();
