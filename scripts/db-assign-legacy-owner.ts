import { closePool, query } from "../lib/db/client";

const email = (process.argv[2] ?? "viniciusranoli@gmail.com").trim().toLowerCase();

async function main() {
  const user = await query<{ id: string; display_name: string }>(
    `SELECT id, display_name FROM tb_users WHERE lower(email) = lower($1)`,
    [email],
  );
  const row = user.rows[0];
  if (!row) throw new Error(`Usuário não encontrado: ${email}`);

  const [properties, runs, saved] = await Promise.all([
    query(`UPDATE tb_properties SET user_id = $1 WHERE user_id IS DISTINCT FROM $1`, [row.id]),
    query(`UPDATE tb_search_runs SET user_id = $1 WHERE user_id IS DISTINCT FROM $1`, [row.id]),
    query(`UPDATE tb_saved_searches SET user_id = $1 WHERE user_id IS DISTINCT FROM $1`, [row.id]),
  ]);

  console.log(
    JSON.stringify(
      {
        user: { email, displayName: row.display_name, id: row.id },
        propertiesUpdated: properties.rowCount,
        searchRunsUpdated: runs.rowCount,
        savedSearchesUpdated: saved.rowCount,
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
