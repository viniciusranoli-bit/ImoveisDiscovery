import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "docker", "evolution");
const example = path.join(dir, ".env.example");
const env = path.join(dir, ".env");

if (!existsSync(env) && existsSync(example)) {
  copyFileSync(example, env);
  console.log("[evolution] docker/evolution/.env criado — defina AUTHENTICATION_API_KEY.");
}

const sync = path.join(root, "scripts", "sync-evolution-backend-env.mjs");
if (existsSync(sync)) {
  spawnSync(process.execPath, [sync], { stdio: "inherit", cwd: root });
}
