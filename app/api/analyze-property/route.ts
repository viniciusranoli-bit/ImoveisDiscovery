import { NextResponse } from "next/server";
import { analyzePropertyFromRun } from "@/lib/property-analysis-service";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { runId?: string; listingId?: string };
    if (!body.runId || !body.listingId) {
      return NextResponse.json(
        { error: "Informe a coleta e o imóvel para análise." },
        { status: 400 },
      );
    }

    return NextResponse.json(await analyzePropertyFromRun(body.runId, body.listingId));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível analisar a descrição do imóvel.",
      },
      { status: 500 },
    );
  }
}
