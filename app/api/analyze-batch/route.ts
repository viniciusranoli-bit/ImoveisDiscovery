import { NextResponse } from "next/server";
import { analyzePropertyBatchFromRun } from "@/lib/property-analysis-service";

export const runtime = "nodejs";
export const maxDuration = 300;

const validCounts = new Set([5, 10, 15, "all"]);

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { runId?: string; count?: unknown };
    if (!body.runId || !validCounts.has(body.count as 5 | 10 | 15 | "all")) {
      return NextResponse.json(
        { error: "Informe uma coleta e uma quantidade válida: 5, 10, 15 ou todos." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      await analyzePropertyBatchFromRun(body.runId, body.count as 5 | 10 | 15 | "all"),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível concluir a análise em lote.",
      },
      { status: 500 },
    );
  }
}
