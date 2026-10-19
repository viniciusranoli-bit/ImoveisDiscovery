import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { deleteSession, SESSION_COOKIE } from "../../../lib/auth/session";

export const runtime = "nodejs";

export async function POST() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const response = NextResponse.json({ ok: true });
  if (token) {
    try {
      await deleteSession(token);
    } catch {
      // Limpa o cookie mesmo se o banco estiver fora.
    }
  }
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
