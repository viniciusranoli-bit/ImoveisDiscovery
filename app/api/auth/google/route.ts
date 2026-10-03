import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { googleAuthorizeUrl, googleOAuthEnabled } from "@/lib/auth/google";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

const STATE_COOKIE = "ad_oauth_state";

export async function GET(request: Request) {
  if (!googleOAuthEnabled()) {
    const login = new URL("/login", request.url);
    login.searchParams.set(
      "error",
      "Login com Google não configurado. Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET em backend/.env.",
    );
    return NextResponse.redirect(login);
  }
  const state = randomUUID();
  const store = await cookies();
  store.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return NextResponse.redirect(googleAuthorizeUrl(request, state));
}
