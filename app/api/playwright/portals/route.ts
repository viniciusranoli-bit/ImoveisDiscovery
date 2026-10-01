import { NextResponse } from "next/server";
import { collectPortals } from "@/lib/collectors";
import {
  defaultSearchFilters,
  normalizeSearchFilters,
  type MultiPortalRun,
  type SearchFilters,
} from "@/lib/listings";
import { normalizeNeighborhoods } from "@/lib/neighborhoods";
import {
  readLatestMultiPortalRun,
  readSerperCollection,
  saveMultiPortalRun,
} from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  try {
    return NextResponse.json(await readLatestMultiPortalRun(), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error ? String(error.code) : "";
    return NextResponse.json(
      {
        error:
          code === "ENOENT"
            ? "Faça uma busca e execute a coleta multiportal para gerar o primeiro resultado."
            : "Não foi possível ler a última coleta multiportal.",
      },
      { status: code === "ENOENT" ? 404 : 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      collectionId?: string;
      filters?: Partial<SearchFilters>;
    };
    if (!body.collectionId) {
      return NextResponse.json({ error: "Informe a coleta." }, { status: 400 });
    }
    const collection = await readSerperCollection(body.collectionId);
    const filters = normalizeSearchFilters(
      body.filters ?? collection.filters ?? defaultSearchFilters,
    );
    const urls = collection.results
      .map((result) => result.url ?? result.link)
      .filter((url): url is string => Boolean(url));
    if (!urls.length) {
      return NextResponse.json(
        { error: "A coleta não possui URLs válidas." },
        { status: 400 },
      );
    }

    const result = await collectPortals({
      urls,
      neighborhoods: normalizeNeighborhoods(collection.neighborhood),
      filters,
    });
    const run: MultiPortalRun = {
      id: collection.id,
      collectionId: collection.id,
      collectedAt: new Date().toISOString(),
      filters,
      listings: result.listings,
      sources: result.sources,
    };
    const persisted = await saveMultiPortalRun(run);
    return NextResponse.json({ ...persisted, browser: result.browser });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível executar a coleta multiportal.",
      },
      { status: 500 },
    );
  }
}
