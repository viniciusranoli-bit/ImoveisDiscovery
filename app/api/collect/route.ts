import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { normalizeSearchFilters, type SearchFilters } from "@/lib/listings";
import { normalizeNeighborhoods } from "@/lib/neighborhoods";
import { collectSerperResults } from "@/lib/search";
import { saveSerperCollection } from "@/lib/storage";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      city?: string;
      neighborhood?: string;
      neighborhoods?: string[];
      filters?: Partial<SearchFilters>;
    };
    const neighborhoods = normalizeNeighborhoods(body.neighborhoods ?? body.neighborhood);
    if (body.city !== "Rio de Janeiro" || !neighborhoods.length) {
      return NextResponse.json({ error: "Selecione ao menos um bairro válido da Zona Sul do Rio de Janeiro." }, { status: 400 });
    }
    const filters = normalizeSearchFilters(body.filters ?? {});
    if (
      filters.priceMin !== undefined &&
      filters.priceMax !== undefined &&
      filters.priceMin > filters.priceMax
    ) {
      return NextResponse.json(
        { error: "O preço mínimo não pode ser maior que o preço máximo." },
        { status: 400 },
      );
    }
    const { query, results, rawResponse } = await collectSerperResults(
      body.city,
      neighborhoods,
      filters,
    );
    const collection = {
      id: randomUUID(),
      collectedAt: new Date().toISOString(),
      city: body.city,
      neighborhood: neighborhoods.join(", "),
      query,
      filters,
      results,
      rawResponse,
    } as const;
    await saveSerperCollection(collection);
    return NextResponse.json(collection);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível consultar os portais." },
      { status: 500 },
    );
  }
}
