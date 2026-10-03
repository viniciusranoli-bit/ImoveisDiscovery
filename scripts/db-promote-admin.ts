import { closePool, query } from "../lib/db/client";

const email = (process.argv[2] ?? "viniciusranoli@gmail.com").trim();

async function main() {
  const result = await query<{ email: string; display_name: string; role: string }>(
    `
      UPDATE tb_users
      SET role = 'admin'
      WHERE lower(email) = lower($1)
      RETURNING email, display_name, role
    `,
    [email],
  );
  if (!result.rowCount) throw new Error(`Usuário não encontrado: ${email}`);
  console.log(JSON.stringify(result.rows[0], null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(closePool);
