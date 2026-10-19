import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseEnv(file) {
  if (!existsSync(file)) return { missing: true, vars: {} };
  const vars = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    vars[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return { missing: false, vars };
}

function status(v) {
  if (v === undefined) return "AUSENTE";
  if (!String(v).trim()) return "VAZIO";
  if (/^<YOUR_|change-me/i.test(v)) return "PLACEHOLDER";
  return "OK";
}

const backend = parseEnv(path.join(root, "backend", ".env"));
const evolution = parseEnv(path.join(root, "docker", "evolution", ".env"));
const frontendDev = parseEnv(path.join(root, "frontend", ".env.development"));
const frontendLocal = parseEnv(path.join(root, "frontend", ".env.local"));
const frontend = frontendDev.missing ? frontendLocal : frontendDev;
const frontendName = frontendDev.missing ? "frontend/.env.local" : "frontend/.env.development";

const report = [
  ["DB_HOST", backend],
  ["DATABASE_NAME", backend],
  ["DB_USER", backend],
  ["DB_PASSWORD", backend],
  ["AUTH_SECRET", backend],
  ["API_PORT", backend],
  ["FRONTEND_ORIGIN", backend],
  ["EVOLUTION_API_URL", backend],
  ["EVOLUTION_API_KEY", backend],
  ["EVOLUTION_INSTANCE_NAME", backend],
  ["OPENAI_API_KEY", backend],
  ["SEARCH_API_KEY", backend],
  ["GOOGLE_CLIENT_ID", backend],
  ["ADMIN_EMAILS", backend],
  ["AUTHENTICATION_API_KEY", evolution],
  ["SERVER_URL", evolution],
  ["API_URL", frontend],
  ["NEXT_PUBLIC_API_URL", frontend],
];

console.log("backend/.env:", backend.missing ? "NAO EXISTE" : "existe");
console.log("docker/evolution/.env:", evolution.missing ? "NAO EXISTE" : "existe");
console.log(frontendName + ":", frontend.missing ? "NAO EXISTE" : "existe");
console.log("");

for (const [key, file] of report) {
  const st = file.missing ? "AUSENTE (sem arquivo)" : status(file.vars[key]);
  console.log(`${key}: ${st}`);
}

if (!backend.missing && !evolution.missing) {
  const b = (backend.vars.EVOLUTION_API_KEY || "").trim();
  const e = (evolution.vars.AUTHENTICATION_API_KEY || "").trim();
  console.log("");
  if (!b) console.log("ALINHAMENTO: preencha EVOLUTION_API_KEY no backend");
  else if (!e || e === "change-me-generate-a-long-random-key")
    console.log("ALINHAMENTO: troque AUTHENTICATION_API_KEY no docker/evolution/.env");
  else console.log("ALINHAMENTO backend/evolution keys:", b === e ? "IGUAIS" : "DIFERENTES");
}
