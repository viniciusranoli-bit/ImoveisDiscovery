import path from "node:path";
import { config } from "dotenv";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

const databaseEnvPath = path.join(process.cwd(), "backend", ".env");
config({ path: databaseEnvPath, quiet: true });

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Configure ${name} em backend/.env.`);
  return value;
};

const globalForDb = globalThis as unknown as { propertyDbPool?: Pool };

export function getPool() {
  if (!process.env.DB_HOST) {
    config({ path: databaseEnvPath, quiet: true });
  }
  if (!globalForDb.propertyDbPool) {
    const port = Number(process.env.DB_PORT ?? 5432);
    if (!Number.isInteger(port) || port <= 0) {
      throw new Error("DB_PORT deve ser uma porta válida.");
    }
    globalForDb.propertyDbPool = new Pool({
      host: required("DB_HOST"),
      database: required("DATABASE_NAME"),
      user: required("DB_USER"),
      password: required("DB_PASSWORD"),
      port,
      max: Number(process.env.DB_POOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: true } : undefined,
      application_name: "aluguel-discovery",
    });
  }
  return globalForDb.propertyDbPool;
}

export async function query<Row extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
) {
  return getPool().query<Row>(text, values);
}

export async function withTransaction<T>(operation: (client: PoolClient) => Promise<T>) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (globalForDb.propertyDbPool) {
    await globalForDb.propertyDbPool.end();
    globalForDb.propertyDbPool = undefined;
  }
}
