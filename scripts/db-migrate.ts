import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { closePool, getPool } from "../lib/db/client";

async function main() {
  const migrationsDirectory = path.join(process.cwd(), "db", "migrations");
  const files = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const client = await getPool().connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [7_306_202_609]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    for (const file of files) {
      const applied = await client.query(
        "SELECT 1 FROM schema_migrations WHERE version = $1",
        [file],
      );
      if (applied.rowCount) {
        console.log(`${file}: já aplicada`);
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(await readFile(path.join(migrationsDirectory, file), "utf8"));
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`${file}: aplicada`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [7_306_202_609]).catch(() => undefined);
    client.release();
    await closePool();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
