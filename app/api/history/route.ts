import { NextResponse } from "next/server";
import {
  answerAnalysisAmbiguity,
  readSuppressedHistory,
  type AnalysisReviewAnswer,
} from "@/lib/db/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const limit = Number(new URL(request.url).searchParams.get("limit") ?? 50);
    const items = await readSuppressedHistory(Number.isFinite(limit) ? limit : 50);
    return NextResponse.json(
      { items },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível carregar o histórico semestral.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      analysisId?: string;
      feature?: "slab_rights" | "balcony_barbecue";
      answer?: AnalysisReviewAnswer;
    };
    if (
      !body.analysisId ||
      !["slab_rights", "balcony_barbecue"].includes(body.feature ?? "") ||
      !["yes", "no", "unknown"].includes(body.answer ?? "")
    ) {
      return NextResponse.json({ error: "Resposta de revisão inválida." }, { status: 400 });
    }
    await answerAnalysisAmbiguity({
      analysisId: body.analysisId,
      feature: body.feature!,
      answer: body.answer!,
    });
    return NextResponse.json({ saved: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível salvar a resposta." },
      { status: 400 },
    );
  }
}
