import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { exchangeGoogleCode } from "@/lib/auth/google";
import {
  createSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { upsertGoogleUser } from "@/lib/auth/users";

export const runtime = "nodejs";

const STATE_COOKIE = "ad_oauth_state";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const store = await cookies();
    const expected = store.get(STATE_COOKIE)?.value;
    store.set(STATE_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
    if (!code || !state || !expected || state !== expected) {
      throw new Error("Estado OAuth inválido.");
    }
    const profile = await exchangeGoogleCode(request, code);
    const user = await upsertGoogleUser({
      email: profile.email,
      displayName: profile.displayName,
      googleSub: profile.googleSub,
    });
    const session = await createSession(user.id);
    store.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));
    return NextResponse.redirect(new URL("/", request.url));
  } catch (error) {
    const login = new URL("/login", request.url);
    login.searchParams.set(
      "error",
      error instanceof Error ? error.message : "Falha no login com Google.",
    );
    return NextResponse.redirect(login);
  }
}
