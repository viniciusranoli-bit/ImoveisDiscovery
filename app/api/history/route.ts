import { NextResponse } from "next/server";
import {
  answerAnalysisAmbiguity,
  readRentHistory,
  readSuppressedHistory,
  type AnalysisReviewAnswer,
} from "@/lib/db/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 50);
    const purpose = url.searchParams.get("purpose") === "rent" ? "rent" : "sale";
    const safeLimit = Number.isFinite(limit) ? limit : 50;
    const items = purpose === "rent"
      ? await readRentHistory(safeLimit)
      : await readSuppressedHistory(safeLimit, "sale");
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
