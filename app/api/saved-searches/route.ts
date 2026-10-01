import { NextResponse } from "next/server";
import {
  deleteSavedSearch,
  readSavedSearches,
  saveSavedSearch,
  updateSavedSearch,
} from "@/lib/db/repository";
import { normalizeSearchFilters } from "@/lib/listings";
import { normalizeNeighborhoods } from "@/lib/neighborhoods";

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
      neighborhoods?: unknown;
      filters?: unknown;
    };
    const neighborhoods = normalizeNeighborhoods(body.neighborhoods ?? body.neighborhood);
    if (
      typeof body.city !== "string" ||
      !body.city.trim() ||
      !neighborhoods.length ||
      !body.filters ||
      typeof body.filters !== "object"
    ) {
      return NextResponse.json({ error: "Informe cidade, ao menos um bairro e filtros válidos." }, { status: 400 });
    }
    const item = await saveSavedSearch({
      city: body.city.trim(),
      neighborhoods,
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

function savedSearchPayload(body: {
  id?: unknown;
  city?: unknown;
  neighborhood?: unknown;
  neighborhoods?: unknown;
  filters?: unknown;
}) {
  const neighborhoods = normalizeNeighborhoods(body.neighborhoods ?? body.neighborhood);
  if (
    typeof body.id !== "string" ||
    !body.id.trim() ||
    typeof body.city !== "string" ||
    !body.city.trim() ||
    !neighborhoods.length ||
    !body.filters ||
    typeof body.filters !== "object"
  ) {
    return undefined;
  }
  return {
    id: body.id.trim(),
    city: body.city.trim(),
    neighborhoods,
    filters: normalizeSearchFilters(body.filters),
  };
}

export async function PATCH(request: Request) {
  try {
    const payload = savedSearchPayload(await request.json());
    if (!payload) {
      return NextResponse.json({ error: "Informe o agendamento, a cidade, ao menos um bairro e filtros válidos." }, { status: 400 });
    }
    const item = await updateSavedSearch(payload);
    return NextResponse.json({ item });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível atualizar o agendamento.";
    const status = message === "Pesquisa salva não encontrada."
      ? 404
      : message === "Já existe um agendamento com esses filtros."
        ? 409
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) return NextResponse.json({ error: "Informe o agendamento." }, { status: 400 });
    await deleteSavedSearch(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível apagar o agendamento.";
    return NextResponse.json(
      { error: message },
      { status: message === "Pesquisa salva não encontrada." ? 404 : 500 },
    );
  }
}
