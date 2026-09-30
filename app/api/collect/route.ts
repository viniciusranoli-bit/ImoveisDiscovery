import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { normalizeSearchFilters, type SearchFilters } from "@/lib/listings";
import { collectSerperResults } from "@/lib/search";
import { saveSerperCollection } from "@/lib/storage";

const southZoneNeighborhoods = new Set([
  "Botafogo", "Catete", "Copacabana", "Cosme Velho", "Flamengo", "Gávea",
  "Glória", "Humaitá", "Ipanema", "Jardim Botânico", "Lagoa", "Laranjeiras",
  "Leblon", "Leme", "São Conrado", "Urca",
]);

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      city?: string;
      neighborhood?: string;
      filters?: Partial<SearchFilters>;
    };
    if (body.city !== "Rio de Janeiro" || !body.neighborhood || !southZoneNeighborhoods.has(body.neighborhood)) {
      return NextResponse.json({ error: "Selecione um bairro válido da Zona Sul do Rio de Janeiro." }, { status: 400 });
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
      body.neighborhood,
      filters,
    );
    const collection = {
      id: randomUUID(),
      collectedAt: new Date().toISOString(),
      city: body.city,
      neighborhood: body.neighborhood,
      query,
      filters,
      results,
      rawResponse,
    } as const;
    await saveSerperCollection(collection);
    return NextResponse.json(collection);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível consultar a Serper." },
      { status: 500 },
    );
  }
}
