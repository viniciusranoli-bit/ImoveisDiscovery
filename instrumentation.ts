export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NODE_USE_SYSTEM_CA !== "1") {
    process.env.NODE_USE_SYSTEM_CA = "1";
  }
  const { ensureAuthSecretInProcess } = await import("./lib/auth/secret");
  ensureAuthSecretInProcess();
  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}
