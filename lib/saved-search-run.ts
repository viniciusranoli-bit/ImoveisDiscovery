import { randomUUID } from "node:crypto";
import { collectPortals } from "./collectors";
import type { SavedSearch } from "./db/repository";
import { normalizeSearchFilters, type MultiPortalRun } from "./listings";
import { normalizeNeighborhoods } from "./neighborhoods";
import { collectSerperResults } from "./search";
import { saveMultiPortalRun, saveSerperCollection } from "./storage";

export async function runSavedSearchCollection(saved: SavedSearch): Promise<MultiPortalRun> {
  if (saved.city !== "Rio de Janeiro") {
    throw new Error("A busca automática aceita somente o Rio de Janeiro.");
  }
  const filters = normalizeSearchFilters(saved.filters);
  const neighborhoods = normalizeNeighborhoods(
    saved.neighborhoods.length ? saved.neighborhoods : [saved.neighborhood],
  );
  if (!neighborhoods.length) throw new Error("A pesquisa salva não possui bairros válidos.");
  const discovered = await collectSerperResults("Rio de Janeiro", neighborhoods, filters);
  const collectedAt = new Date().toISOString();
  const collection = {
    id: randomUUID(),
    collectedAt,
    city: "Rio de Janeiro" as const,
    neighborhood: neighborhoods.join(", "),
    query: discovered.query,
    filters,
    results: discovered.results,
    rawResponse: discovered.rawResponse,
  };
  await saveSerperCollection(collection, saved.userId ?? undefined);
  const urls = collection.results
    .map((result) => result.url ?? result.link)
    .filter((url): url is string => Boolean(url));
  const portals = await collectPortals({
    urls,
    neighborhoods,
    filters,
  });
  return saveMultiPortalRun({
    id: collection.id,
    collectionId: collection.id,
    collectedAt,
    filters,
    listings: portals.listings,
    sources: portals.sources,
  });
}
