import { createHash, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { query } from "@/lib/db/client";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { assertAuthConfigured } from "@/lib/auth/setup";
import { getAuthSecretFromProcess } from "@/lib/auth/secret";

export { SESSION_COOKIE };
export { isAuthSecretConfigured } from "@/lib/auth/setup";
const SESSION_DAYS = 14;

function secretKey() {
  assertAuthConfigured();
  return new TextEncoder().encode(getAuthSecretFromProcess()!);
}

export function hashSessionToken(token: string) {
  assertAuthConfigured();
  return createHash("sha256")
    .update(`${getAuthSecretFromProcess()!}:${token}`)
    .digest("hex");
}

export async function createSession(userId: string) {
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const token = await new SignJWT({ sub: userId, sid: sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secretKey());
  await query(
    `
      INSERT INTO tb_user_sessions (id, user_id, token_hash, expires_at)
      VALUES ($1, $2, $3, $4)
    `,
    [sessionId, userId, hashSessionToken(token), expiresAt],
  );
  return { token, expiresAt };
}

export async function deleteSession(token: string) {
  const payload = await verifySessionToken(token);
  if (!payload?.sid) return;
  await query(`DELETE FROM tb_user_sessions WHERE id = $1`, [payload.sid]);
}

export async function verifySessionToken(token: string) {
  try {
    const verified = await jwtVerify(token, secretKey());
    const sub = verified.payload.sub;
    const sid = verified.payload.sid;
    if (typeof sub !== "string" || typeof sid !== "string") return undefined;
    return { userId: sub, sid };
  } catch {
    return undefined;
  }
}

export async function getSessionUserId(token: string | undefined) {
  if (!token) return undefined;
  const payload = await verifySessionToken(token);
  if (!payload) return undefined;
  const active = await query<{ user_id: string }>(
    `
      SELECT user_id
      FROM tb_user_sessions
      WHERE id = $1
        AND token_hash = $2
        AND expires_at > now()
      LIMIT 1
    `,
    [payload.sid, hashSessionToken(token)],
  );
  return active.rows[0]?.user_id;
}

export async function readSessionFromCookies() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const userId = await getSessionUserId(token);
  if (!userId) return undefined;
  const { readUserById } = await import("@/lib/auth/users");
  return readUserById(userId);
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}
