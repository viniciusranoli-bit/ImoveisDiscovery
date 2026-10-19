import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function ensureBackendEnv() {
  const examplePath = path.join(root, "backend", ".env.example");
  const envPath = path.join(root, "backend", ".env");
  if (!existsSync(examplePath)) return;
  if (!existsSync(envPath)) {
    copyFileSync(examplePath, envPath);
    console.log("[dev] backend/.env criado a partir de backend/.env.example — ajuste AUTH_SECRET e DB.");
    return;
  }
  const example = readFileSync(examplePath, "utf8");
  let env = readFileSync(envPath, "utf8");
  const requiredKeys = [
    "API_PORT=3006",
    "FRONTEND_ORIGIN=http://localhost:3005",
    "EVOLUTION_API_URL=http://127.0.0.1:8080",
    "EVOLUTION_INSTANCE_NAME=radar-imoveis",
  ];
  let changed = false;
  for (const line of requiredKeys) {
    const key = line.split("=")[0];
    if (!new RegExp(`^${key}=`, "m").test(env)) {
      env += env.endsWith("\n") ? "" : "\n";
      env += `${line}\n`;
      changed = true;
    }
  }
  if (!/^EVOLUTION_API_KEY=/m.test(env) && example.includes("EVOLUTION_API_KEY=")) {
    env += env.endsWith("\n") ? "" : "\n";
    env += "EVOLUTION_API_KEY=\n";
    changed = true;
  }
  if (changed) {
    writeFileSync(envPath, env, "utf8");
    console.log("[dev] backend/.env atualizado com portas dev e variáveis Evolution (sem sobrescrever secrets).");
  }
}

function tryStopDockerBackend() {
  const composeFile = `${root.replace(/\\/g, "/")}/docker-compose.yml`;
  const attempts =
    process.platform === "win32"
      ? [
          [
            "wsl",
            ["-e", "docker", "compose", "-f", composeFile, "stop", "backend"],
          ],
          ["docker", ["compose", "stop", "backend"]],
        ]
      : [
          ["docker", ["compose", "stop", "backend"]],
          [
            "wsl",
            ["-e", "docker", "compose", "-f", composeFile, "stop", "backend"],
          ],
        ];
  for (const [command, args] of attempts) {
    const result = spawnSync(command, args, { cwd: root, stdio: "ignore" });
    if (result.status === 0) {
      console.log("[dev] Backend Docker (homologação :3001) parado — dev local usa a API na :3006.");
      return;
    }
  }
}

ensureBackendEnv();
const syncEvolution = path.join(root, "scripts", "sync-evolution-backend-env.mjs");
if (existsSync(syncEvolution)) {
  spawnSync(process.execPath, [syncEvolution], { stdio: "inherit", cwd: root });
}
tryStopDockerBackend();
