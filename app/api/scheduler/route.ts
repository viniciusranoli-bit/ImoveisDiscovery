import { NextResponse } from "next/server";
import { deleteSchedulerRun, updateSavedSearchSchedule } from "@/lib/db/repository";
import { isAnalysisBatchCount, isAnalysisInterval } from "@/lib/schedule";
import { readSchedulerStatus, startScheduler } from "@/lib/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  startScheduler();
  try {
    return NextResponse.json(await readSchedulerStatus(), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível carregar o agendamento." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      id?: unknown;
      analysisIntervalMinutes?: unknown;
      analysisBatchCount?: unknown;
      analysisEnabled?: unknown;
    };
    const interval = Number(body.analysisIntervalMinutes);
    if (
      typeof body.id !== "string" ||
      typeof body.analysisEnabled !== "boolean" ||
      !isAnalysisInterval(interval) ||
      !isAnalysisBatchCount(body.analysisBatchCount)
    ) {
      return NextResponse.json(
        { error: "Informe a pesquisa, o intervalo e a quantidade da análise." },
        { status: 400 },
      );
    }
    const item = await updateSavedSearchSchedule({
      id: body.id,
      analysisIntervalMinutes: interval,
      analysisBatchCount: body.analysisBatchCount,
      analysisEnabled: body.analysisEnabled,
    });
    return NextResponse.json({ item, ...(await readSchedulerStatus()) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível salvar o agendamento." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) return NextResponse.json({ error: "Informe a execução." }, { status: 400 });
    await deleteSchedulerRun(id);
    return NextResponse.json({ ok: true, ...(await readSchedulerStatus()) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível apagar a execução.";
    return NextResponse.json(
      { error: message },
      { status: message === "Execução não encontrada." ? 404 : 500 },
    );
  }
}
