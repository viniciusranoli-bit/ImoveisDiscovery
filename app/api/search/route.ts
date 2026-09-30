import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { runSearch } from "@/lib/search";
import { saveSearch } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { count?: unknown };
    const count = Number(body.count);
    if (!Number.isInteger(count) || count < 1 || count > 25) {
      return NextResponse.json({ error: "Informe uma quantidade entre 1 e 25." }, { status: 400 });
    }
    const result = await runSearch(count);
    const run = { id: randomUUID(), searchedAt: new Date().toISOString(), requestedCount: count, ...result };
    await saveSearch(run);
    return NextResponse.json(run);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível pesquisar os anúncios.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
