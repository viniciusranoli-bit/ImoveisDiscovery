import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/request-user";
import { readDecisionEvents } from "@/lib/decision-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    if (user.role !== "admin") {
      return NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403 });
    }
    const url = new URL(request.url);
    const events = await readDecisionEvents({
      userId: url.searchParams.get("userId") ?? undefined,
      learningStatus: url.searchParams.get("learningStatus") ?? undefined,
      limit: Number(url.searchParams.get("limit") ?? 100),
    });
    return NextResponse.json({ events }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não autenticado." },
      { status: 401 },
    );
  }
}
