import { NextResponse } from "next/server";
import {
  readSavedSearches,
  saveSavedSearch,
} from "@/lib/db/repository";
import { normalizeSearchFilters } from "@/lib/listings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(
      { items: await readSavedSearches() },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível carregar pesquisas salvas." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      city?: unknown;
      neighborhood?: unknown;
      filters?: unknown;
    };
    if (
      typeof body.city !== "string" ||
      !body.city.trim() ||
      typeof body.neighborhood !== "string" ||
      !body.neighborhood.trim() ||
      !body.filters ||
      typeof body.filters !== "object"
    ) {
      return NextResponse.json({ error: "Informe cidade, bairro e filtros válidos." }, { status: 400 });
    }
    const item = await saveSavedSearch({
      city: body.city.trim(),
      neighborhood: body.neighborhood.trim(),
      filters: normalizeSearchFilters(body.filters),
    });
    return NextResponse.json({ item });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível salvar a pesquisa." },
      { status: 500 },
    );
  }
}
