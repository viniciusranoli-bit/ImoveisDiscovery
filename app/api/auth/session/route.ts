import { NextResponse } from "next/server";
import { googleOAuthEnabled } from "@/lib/auth/google";
import { readSessionFromCookies } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await readSessionFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  return NextResponse.json({
    user,
    googleEnabled: googleOAuthEnabled(),
  });
}
