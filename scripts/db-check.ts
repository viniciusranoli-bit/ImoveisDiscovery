import { closePool, query } from "../lib/db/client";

async function main() {
  const result = await query<{
    database_name: string;
    migration_count: string;
    property_count: string;
  }>(`
    SELECT
      current_database() AS database_name,
      (SELECT count(*)::text FROM tb_schema_migrations) AS migration_count,
      (SELECT count(*)::text FROM tb_properties) AS property_count
  `);
  const row = result.rows[0];
  console.log(
    JSON.stringify(
      {
        connected: true,
        database: row.database_name,
        migrations: Number(row.migration_count),
        tb_properties: Number(row.property_count),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(closePool);
