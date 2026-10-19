import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseEnv(content) {
  const vars = {};
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    vars[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return vars;
}

function upsertEnvLine(content, key, value) {
  const re = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}=${value}`;
  if (re.test(content)) return content.replace(re, line);
  const suffix = content.endsWith("\n") ? "" : "\n";
  return `${content}${suffix}${line}\n`;
}

const evolutionPath = path.join(root, "docker", "evolution", ".env");
const backendPath = path.join(root, "backend", ".env");
const backendExample = path.join(root, "backend", ".env.example");

if (!existsSync(backendPath) && existsSync(backendExample)) {
  writeFileSync(backendPath, readFileSync(backendExample, "utf8"), "utf8");
}

if (!existsSync(evolutionPath)) {
  console.log("[evolution-sync] docker/evolution/.env não encontrado — rode prepare-evolution-env primeiro.");
  process.exit(0);
}

const evolutionVars = parseEnv(readFileSync(evolutionPath, "utf8"));
const authKey = evolutionVars.AUTHENTICATION_API_KEY?.trim();
if (!authKey || /^change-me/i.test(authKey)) {
  console.log("[evolution-sync] Defina AUTHENTICATION_API_KEY em docker/evolution/.env (valor forte, não o placeholder).");
  process.exit(1);
}

let backendEnv = readFileSync(backendPath, "utf8");
const backendVars = parseEnv(backendEnv);
const currentKey = backendVars.EVOLUTION_API_KEY?.trim();

if (currentKey === authKey) {
  console.log("[evolution-sync] backend/.env já alinhado com docker/evolution/.env.");
  process.exit(0);
}

backendEnv = upsertEnvLine(backendEnv, "EVOLUTION_API_URL", backendVars.EVOLUTION_API_URL?.trim() || "http://127.0.0.1:8080");
backendEnv = upsertEnvLine(
  backendEnv,
  "EVOLUTION_INSTANCE_NAME",
  backendVars.EVOLUTION_INSTANCE_NAME?.trim() || "radar-imoveis",
);
backendEnv = upsertEnvLine(backendEnv, "EVOLUTION_API_KEY", authKey);
writeFileSync(backendPath, backendEnv, "utf8");
console.log("[evolution-sync] EVOLUTION_API_KEY copiada para backend/.env (mesma chave da Evolution API). Reinicie a API.");
