import { NextResponse } from "next/server";
import { authFailureMessage } from "../../../lib/auth/errors";
import {
  createSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "../../../lib/auth/session";
import { assertAuthConfigured } from "../../../lib/auth/setup";
import { verifyLocalPassword } from "../../../lib/auth/users";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertAuthConfigured();
    const body = (await request.json()) as { email?: string; password?: string };
    const user = await verifyLocalPassword(body.email ?? "", body.password ?? "");
    const session = await createSession(user.id);
    const response = NextResponse.json({ user });
    response.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));
    return response;
  } catch (error) {
    const message = authFailureMessage(error, "Não foi possível entrar.");
    const status = message.includes("não configurada")
      ? 503
      : message.includes("Banco de dados indisponível")
        ? 503
        : 401;
    return NextResponse.json({ error: message }, { status });
  }
}
