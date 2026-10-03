import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/request-user";
import { resolvePropertyIdByLink, setPenthouseDisposition } from "@/lib/db/repository";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as {
      link?: string;
      disposition?: "saved" | "dismissed";
    };
    if (!body.link || !["saved", "dismissed"].includes(body.disposition ?? "")) {
      return NextResponse.json({ error: "Informe o imóvel e a ação." }, { status: 400 });
    }
    const propertyId = await resolvePropertyIdByLink(body.link);
    if (!propertyId) {
      return NextResponse.json(
        { error: "Imóvel ainda não está no banco. Conclua a coleta antes de salvar ou descartar." },
        { status: 404 },
      );
    }
    await setPenthouseDisposition({
      userId: user.id,
      propertyId,
      link: body.link,
      disposition: body.disposition!,
    });
    return NextResponse.json({ saved: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível registrar a escolha." },
      { status: 400 },
    );
  }
}
