import bcrypt from "bcryptjs";
import { query } from "@/lib/db/client";
import {
  formatSearchQuotaUsage,
  isUnlimitedSearchQuota,
  normalizeAdminSearchQuota,
} from "@/lib/auth/search-quota";

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  role: "user" | "admin";
  searchQuota: number;
  searchesUsed: number;
  hasPassword?: boolean;
  hasGoogle?: boolean;
};

type UserRow = {
  id: string;
  email: string;
  display_name: string;
  password_hash: string | null;
  google_sub: string | null;
  role: "user" | "admin";
  search_quota: number;
  searches_used: number;
};

function mapUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    searchQuota: row.search_quota,
    searchesUsed: row.searches_used,
    hasPassword: Boolean(row.password_hash),
    hasGoogle: Boolean(row.google_sub),
  };
}

async function countUsers() {
  const result = await query<{ count: string }>(`SELECT count(*)::text AS count FROM tb_users`);
  return Number(result.rows[0]?.count ?? 0);
}

async function resolveRoleForEmail(email: string) {
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (adminEmails.includes(email)) return "admin" as const;
  if ((await countUsers()) === 0) return "admin" as const;
  return "user" as const;
}

export async function readUserById(id: string) {
  const result = await query<UserRow>(`SELECT * FROM tb_users WHERE id = $1`, [id]);
  return result.rows[0] ? mapUser(result.rows[0]) : undefined;
}

export async function readUserByEmail(email: string) {
  const result = await query<UserRow>(`SELECT * FROM tb_users WHERE lower(email) = lower($1)`, [
    email.trim(),
  ]);
  return result.rows[0];
}

export async function registerLocalUser(input: {
  email: string;
  password: string;
  displayName: string;
}) {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) throw new Error("Informe um e-mail válido para login.");
  if (input.password.length < 8) throw new Error("A senha precisa ter pelo menos 8 caracteres.");
  const name = input.displayName.trim();
  if (!name) throw new Error("Informe seu nome para concluir o cadastro.");
  const existing = await readUserByEmail(email);
  if (existing) throw new Error("Já existe uma conta com este e-mail.");
  const role = await resolveRoleForEmail(email);
  const passwordHash = await bcrypt.hash(input.password, 12);
  const result = await query<UserRow>(
    `
      INSERT INTO tb_users (email, display_name, password_hash, role)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `,
    [email, name, passwordHash, role],
  );
  return mapUser(result.rows[0]!);
}

export async function verifyLocalPassword(email: string, password: string) {
  const row = await readUserByEmail(email);
  if (!row?.password_hash) throw new Error("E-mail ou senha incorretos.");
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) throw new Error("E-mail ou senha incorretos.");
  return mapUser(row);
}

export async function upsertGoogleUser(input: {
  email: string;
  displayName: string;
  googleSub: string;
}) {
  const email = input.email.trim().toLowerCase();
  const existing = await readUserByEmail(email);
  if (existing) {
    await query(
      `
        UPDATE tb_users
        SET google_sub = COALESCE(google_sub, $2),
            display_name = $3
        WHERE id = $1
      `,
      [existing.id, input.googleSub, input.displayName.trim() || existing.display_name],
    );
    return (await readUserById(existing.id))!;
  }
  const role = await resolveRoleForEmail(email);
  const result = await query<UserRow>(
    `
      INSERT INTO tb_users (email, display_name, google_sub, role)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `,
    [email, input.displayName.trim() || email, input.googleSub, role],
  );
  return mapUser(result.rows[0]!);
}

export async function consumeSearchQuota(userId: string) {
  const result = await query<UserRow>(
    `
      UPDATE tb_users
      SET searches_used = searches_used + 1
      WHERE id = $1
        AND (search_quota < 0 OR searches_used < search_quota)
      RETURNING *
    `,
    [userId],
  );
  if (!result.rowCount) {
    const user = await readUserById(userId);
    if (!user) throw new Error("Usuário não encontrado.");
    throw new Error(
      `Limite de buscas atingido (${formatSearchQuotaUsage(user.searchesUsed, user.searchQuota)}). Peça ao administrador para aumentar sua cota.`,
    );
  }
  return mapUser(result.rows[0]!);
}

export async function listUsersForAdmin() {
  const result = await query<UserRow>(`SELECT * FROM tb_users ORDER BY created_at ASC`);
  return result.rows.map(mapUser);
}

export async function updateUserSearchQuota(userId: string, searchQuota: number) {
  const normalized = normalizeAdminSearchQuota(searchQuota);
  const result = await query<UserRow>(
    `
      UPDATE tb_users
      SET search_quota = $2
      WHERE id = $1
      RETURNING *
    `,
    [userId, normalized],
  );
  if (!result.rowCount) throw new Error("Usuário não encontrado.");
  return mapUser(result.rows[0]!);
}

export async function adminCreateUser(input: {
  email: string;
  displayName: string;
  password: string;
  role?: "user" | "admin";
  searchQuota?: number;
}) {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) throw new Error("Informe um e-mail válido.");
  if (input.password.length < 8) throw new Error("A senha precisa ter pelo menos 8 caracteres.");
  const name = input.displayName.trim();
  if (!name) throw new Error("Informe o nome.");
  if (await readUserByEmail(email)) throw new Error("Já existe uma conta com este e-mail.");
  const passwordHash = await bcrypt.hash(input.password, 12);
  const searchQuota = normalizeAdminSearchQuota(input.searchQuota ?? 10);
  const result = await query<UserRow>(
    `
      INSERT INTO tb_users (email, display_name, password_hash, role, search_quota)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `,
    [email, name, passwordHash, input.role ?? "user", searchQuota],
  );
  return mapUser(result.rows[0]!);
}

export async function adminUpdateUser(input: {
  userId: string;
  displayName?: string;
  role?: "user" | "admin";
  searchQuota?: number;
  password?: string;
}) {
  const current = await readUserById(input.userId);
  if (!current) throw new Error("Usuário não encontrado.");
  const displayName = input.displayName?.trim() || current.displayName;
  const role = input.role ?? current.role;
  const searchQuota =
    input.searchQuota !== undefined
      ? normalizeAdminSearchQuota(input.searchQuota)
      : current.searchQuota;
  if (
    !isUnlimitedSearchQuota(searchQuota) &&
    searchQuota < current.searchesUsed
  ) {
    throw new Error("A cota não pode ser menor que o número de buscas já usadas.");
  }
  let passwordHash: string | undefined;
  if (input.password) {
    if (input.password.length < 8) throw new Error("A senha precisa ter pelo menos 8 caracteres.");
    passwordHash = await bcrypt.hash(input.password, 12);
  }
  const result = await query<UserRow>(
    `
      UPDATE tb_users
      SET display_name = $2,
          role = $3,
          search_quota = $4,
          password_hash = COALESCE($5, password_hash)
      WHERE id = $1
      RETURNING *
    `,
    [input.userId, displayName, role, searchQuota, passwordHash ?? null],
  );
  return mapUser(result.rows[0]!);
}

export async function adminDeleteUser(userId: string, actorId: string) {
  if (userId === actorId) throw new Error("Não é possível apagar a própria conta por aqui.");
  const admins = await query<{ count: string }>(
    `SELECT count(*)::text AS count FROM tb_users WHERE role = 'admin'`,
  );
  const target = await readUserById(userId);
  if (!target) throw new Error("Usuário não encontrado.");
  if (target.role === "admin" && Number(admins.rows[0]?.count ?? 0) <= 1) {
    throw new Error("Mantenha pelo menos um administrador.");
  }
  await query(`DELETE FROM tb_users WHERE id = $1`, [userId]);
}
