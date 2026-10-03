import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  createSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { assertAuthConfigured } from "@/lib/auth/setup";
import { registerLocalUser } from "@/lib/auth/users";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertAuthConfigured();
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      displayName?: string;
    };
    const user = await registerLocalUser({
      email: body.email ?? "",
      password: body.password ?? "",
      displayName: body.displayName ?? "",
    });
    const session = await createSession(user.id);
    const store = await cookies();
    store.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));
    return NextResponse.json({ user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível criar a conta.";
    const status = message.includes("não configurada") ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
