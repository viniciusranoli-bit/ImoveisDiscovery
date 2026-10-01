import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { closePool, query } from "../lib/db/client";
import {
  answerAnalysisAmbiguity,
  getPropertyAnalysisContext,
  persistMultiPortalRun,
  readSuppressedHistory,
  saveDbPropertyAnalysis,
  saveDiscovery,
} from "../lib/db/repository";
import type { CollectedListing, MultiPortalRun, SerperCollection } from "../lib/listings";

const source = "__cooldown_test__";
const baseDate = new Date();
const beforeAnalysis = new Date(baseDate);
beforeAnalysis.setUTCHours(beforeAnalysis.getUTCHours() + 12);
const afterOneDay = new Date(baseDate);
afterOneDay.setUTCDate(afterOneDay.getUTCDate() + 1);
const afterSixMonths = new Date(baseDate);
afterSixMonths.setUTCMonth(afterSixMonths.getUTCMonth() + 6);
afterSixMonths.setUTCSeconds(afterSixMonths.getUTCSeconds() + 1);

const listing: CollectedListing = {
  id: `${source}:999999999`,
  title: "Apartamento de teste",
  purpose: "sale",
  propertyType: "apartment",
  price: 1_000_000,
  bedrooms: 2,
  parkingSpaces: 1,
  areaM2: 80,
  neighborhood: "Botafogo",
  link: "https://example.invalid/imovel/999999999",
  source,
  sources: [source],
  sourceSearchUrl: "https://example.invalid/busca",
  collectedAt: baseDate.toISOString(),
  evidence: ["Fixture de verificação do cooldown."],
};

async function executeRun(date: Date, price: number) {
  const id = randomUUID();
  const discovery: SerperCollection = {
    id,
    collectedAt: date.toISOString(),
    city: "Rio de Janeiro",
    neighborhood: "Botafogo",
    query: "teste transacional de cooldown",
    filters: {
      purpose: "sale",
      bedroomsMin: 2,
      parkingMin: 1,
      propertyTypes: ["apartment"],
    },
    results: [{ link: listing.sourceSearchUrl }],
    rawResponse: { organic: [{ link: listing.sourceSearchUrl }] },
  };
  await saveDiscovery(discovery);
  const run: MultiPortalRun = {
    id,
    collectionId: id,
    collectedAt: date.toISOString(),
    filters: discovery.filters!,
    listings: [{ ...listing, price, collectedAt: date.toISOString() }],
    sources: [
      {
        source,
        searchUrl: listing.sourceSearchUrl,
        status: "ok",
        found: 1,
        durationMs: 1,
      },
    ],
  };
  return persistMultiPortalRun(run);
}

async function main() {
  try {
    const first = await executeRun(baseDate, 1_000_000);
    const repeatedWithoutAnalysis = await executeRun(beforeAnalysis, 975_000);
    assert.equal(repeatedWithoutAnalysis.listings.length, 1);
    const context = await getPropertyAnalysisContext(first.id, listing.id);
    assert.ok(context);
    await saveDbPropertyAnalysis(context.property_id, {
      slabRights: "ambiguous",
      balconyBarbecue: "not_mentioned",
      evidence: [],
      summary: "Análise sintética para validar o início do cooldown pela IA.",
      listingId: listing.id,
      runId: first.id,
      analyzedAt: baseDate.toISOString(),
      model: "integration-test",
      descriptionSource: listing.link,
    });
    const repeated = await executeRun(afterOneDay, 950_000);
    const ambiguous = (await readSuppressedHistory(200)).find(
      (item) => item.source === source,
    );
    assert.ok(ambiguous);
    assert.equal(ambiguous.category, "ambiguous");
    await answerAnalysisAmbiguity({
      analysisId: ambiguous.analysisId,
      feature: "slab_rights",
      answer: "yes",
    });
    const reviewed = (await readSuppressedHistory(200)).find(
      (item) => item.source === source,
    );
    assert.equal(reviewed?.category, "slab_rights");
    const released = await executeRun(afterSixMonths, 900_000);
    assert.equal(first.listings.length, 1);
    assert.equal(first.suppressedCount, 0);
    assert.equal(repeated.listings.length, 0);
    assert.equal(repeated.suppressedCount, 1);
    assert.equal(released.listings.length, 1);
    console.log(
      JSON.stringify(
        {
          firstResearchEligible: true,
          repeatedWithoutAiStillEligible: true,
          aiAnalysisStartedCooldown: true,
          repeatedAfterAiWithinSemesterSuppressed: true,
          ambiguousResultAcceptedUserAnswer: true,
          releasedAfterSixMonths: true,
          priceChangePreservedIdentity: true,
        },
        null,
        2,
      ),
    );
  } finally {
    await query(
      "DELETE FROM tb_search_runs WHERE query = 'teste transacional de cooldown'",
    ).catch(() => undefined);
    await query(
      `
        DELETE FROM tb_properties
        WHERE id IN (
          SELECT property_id FROM tb_property_listings WHERE source = $1
        )
      `,
      [source],
    ).catch(() => undefined);
    await closePool();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
