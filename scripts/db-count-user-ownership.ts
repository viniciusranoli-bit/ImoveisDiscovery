import { closePool, query } from "../lib/db/client";

const email = (process.argv[2] ?? "viniciusranoli@gmail.com").trim();

async function main() {
  const user = await query<{ id: string }>(
    `SELECT id FROM tb_users WHERE lower(email) = lower($1)`,
    [email],
  );
  const id = user.rows[0]?.id;
  if (!id) throw new Error(`Usuário não encontrado: ${email}`);
  const counts = await query<{
    properties: number;
    runs: number;
    saved: number;
    orphan_properties: number;
    orphan_runs: number;
  }>(
    `
      SELECT
        (SELECT count(*)::int FROM tb_properties WHERE user_id = $1) AS properties,
        (SELECT count(*)::int FROM tb_search_runs WHERE user_id = $1) AS runs,
        (SELECT count(*)::int FROM tb_saved_searches WHERE user_id = $1) AS saved,
        (SELECT count(*)::int FROM tb_properties WHERE user_id IS NULL) AS orphan_properties,
        (SELECT count(*)::int FROM tb_search_runs WHERE user_id IS NULL) AS orphan_runs
    `,
    [id],
  );
  console.log(JSON.stringify({ email, userId: id, ...counts.rows[0] }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(closePool);
