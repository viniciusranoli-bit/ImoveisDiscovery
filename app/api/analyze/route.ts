import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { analyzeSerperCollection } from "@/lib/search";
import { readSerperCollection, saveSearch } from "@/lib/storage";

const host = (link?: string) => {
  try {
    return link ? new URL(link).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { collectionId?: string; count?: unknown };
    const count = Number(body.count);
    if (!body.collectionId || !Number.isInteger(count) || count < 1 || count > 25) {
      return NextResponse.json({ error: "Informe uma coleta e uma quantidade entre 1 e 25." }, { status: 400 });
    }
    const collection = await readSerperCollection(body.collectionId);
    const result = await analyzeSerperCollection(collection, count);
    const run = { id: randomUUID(), searchedAt: new Date().toISOString(), requestedCount: count, ...result };
    await saveSearch(run);

    const analyzedSites = new Set(
      [...run.listings, ...run.rejectedPenthouses].map((listing) => host(listing.link)).filter(Boolean),
    );
    const collectedSites = [...new Set(collection.results.map((item) => host(item.url ?? item.link)).filter(Boolean))];
    return NextResponse.json({
      ...run,
      collectionId: collection.id,
      collectedSites,
      analyzedSites: [...analyzedSites],
      unanalysedSites: collectedSites.filter((site) => !analyzedSites.has(site)),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível analisar a coleta." },
      { status: 500 },
    );
  }
}
