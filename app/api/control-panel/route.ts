import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/request-user";
import { readControlPanelData } from "@/lib/db/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    if (user.role !== "admin") {
      return NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403 });
    }
    return NextResponse.json(await readControlPanelData(), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível carregar o Control Painel." },
      { status: 401 },
    );
  }
}
