import { NextResponse } from "next/server";
import { readSessionFromCookies } from "@/lib/auth/session";
import {
  answerAnalysisAmbiguity,
  readDismissedListingHistory,
  readRentHistory,
  readSuppressedHistory,
  type AnalysisReviewAnswer,
} from "@/lib/db/repository";
import { recordDecisionEvent } from "@/lib/decision-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 50);
    const purpose = url.searchParams.get("purpose") === "rent" ? "rent" : "sale";
    const safeLimit = Number.isFinite(limit) ? limit : 50;
    const sessionUser = await readSessionFromCookies();
    const researched =
      purpose === "rent"
        ? await readRentHistory(safeLimit, sessionUser?.id)
        : await readSuppressedHistory(safeLimit, "sale", sessionUser?.id);
    const dismissed = await readDismissedListingHistory(
      purpose,
      safeLimit,
      sessionUser?.id,
    );
    const seen = new Set(researched.map((item) => item.link));
    const items = [
      ...researched,
      ...dismissed.filter((item) => !seen.has(item.link)),
    ]
      .sort((first, second) => Date.parse(second.seenAt) - Date.parse(first.seenAt))
      .slice(0, safeLimit);
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
    const answered = await answerAnalysisAmbiguity({
      analysisId: body.analysisId,
      feature: body.feature!,
      answer: body.answer!,
    });
    const sessionUser = await readSessionFromCookies();
    await recordDecisionEvent({
      propertyId: answered.propertyId,
      listingId: answered.listingId,
      userId: sessionUser?.id,
      eventType: "ambiguity_answered",
      source: "interface",
      afterData: { feature: body.feature, answer: body.answer },
      reason: "Resposta manual a uma ambiguidade da análise.",
    });
    return NextResponse.json({ saved: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível salvar a resposta." },
      { status: 400 },
    );
  }
}
