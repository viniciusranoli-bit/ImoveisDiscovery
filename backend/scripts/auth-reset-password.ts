import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { closePool, query } from "../src/lib/db/client";

async function main() {
  const email = (process.argv[2] ?? "").trim().toLowerCase();
  const password = process.argv[3]?.trim() || randomBytes(9).toString("base64url");
  if (!email.includes("@")) {
    throw new Error("Uso: npx tsx scripts/auth-reset-password.ts <email> [nova-senha]");
  }
  if (password.length < 8) {
    throw new Error("A senha precisa ter pelo menos 8 caracteres.");
  }
  const hash = await bcrypt.hash(password, 12);
  const result = await query<{ email: string }>(
    `
      UPDATE tb_users
      SET password_hash = $2
      WHERE lower(email) = $1
      RETURNING email
    `,
    [email, hash],
  );
  if (!result.rowCount) throw new Error(`Usuário não encontrado: ${email}`);
  const ok = await bcrypt.compare(password, hash);
  if (!ok) throw new Error("Falha ao validar o hash gerado.");
  console.log(
    JSON.stringify(
      {
        email: result.rows[0]?.email,
        passwordReset: true,
        temporaryPassword: password,
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
