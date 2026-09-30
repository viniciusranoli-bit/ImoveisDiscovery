import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import {
  propertyIdentityKey,
  type CollectedListing,
  type MultiPortalRun,
  type SearchFilters,
  type SerperCollection,
  type SourceCollectionStatus,
} from "../listings";
import type {
  PropertyFeatureAnalysis,
  SavedPropertyAnalysis,
} from "../property-analysis";
import { query, withTransaction } from "./client";

const json = (value: unknown) => JSON.stringify(value);
const identityHash = (listing: CollectedListing) =>
  createHash("sha256").update(propertyIdentityKey(listing)).digest("hex");

export type SuppressedHistoryItem = {
  searchRunId: string;
  propertyId: string;
  listingId: string;
  title: string;
  source: string;
  link: string;
  neighborhood: string;
  seenAt: string;
  suppressedUntil: string;
  analysisId: string;
  slabRights: PropertyFeatureAnalysis["slabRights"];
  balconyBarbecue: PropertyFeatureAnalysis["balconyBarbecue"];
  summary: string;
  slabRightsAnswer?: AnalysisReviewAnswer;
  balconyBarbecueAnswer?: AnalysisReviewAnswer;
  category: HistoryResultCategory;
};

export type AnalysisReviewAnswer = "yes" | "no" | "unknown";
export type HistoryResultCategory =
  | "both"
  | "slab_rights"
  | "balcony_barbecue"
  | "none"
  | "ambiguous";

export type SavedSearch = {
  id: string;
  title: string;
  city: string;
  neighborhood: string;
  filters: SearchFilters;
  savedAt: string;
};

export async function saveSavedSearch(input: {
  city: string;
  neighborhood: string;
  filters: SearchFilters;
}) {
  const searchKey = createHash("sha256")
    .update(json({ city: input.city, neighborhood: input.neighborhood, filters: input.filters }))
    .digest("hex");
  const purpose = input.filters.purpose === "sale" ? "Compra" : "Aluguel";
  const title = `${purpose} · ${input.neighborhood} · ${input.filters.bedroomsMin}+ quartos`;
  const result = await query<{
    id: string;
    title: string;
    city: string;
    neighborhood: string;
    filters: SearchFilters;
    saved_at: Date;
  }>(
    `
      INSERT INTO saved_searches (
        id, search_key, title, city, neighborhood, filters, saved_at
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, now())
      ON CONFLICT (search_key) DO UPDATE SET
        title = EXCLUDED.title,
        saved_at = now()
      RETURNING id, title, city, neighborhood, filters, saved_at
    `,
    [randomUUID(), searchKey, title, input.city, input.neighborhood, json(input.filters)],
  );
  const row = result.rows[0];
  return {
    id: row.id,
    title: row.title,
    city: row.city,
    neighborhood: row.neighborhood,
    filters: row.filters,
    savedAt: row.saved_at.toISOString(),
  } satisfies SavedSearch;
}

export async function readSavedSearches(limit = 20) {
  const result = await query<{
    id: string;
    title: string;
    city: string;
    neighborhood: string;
    filters: SearchFilters;
    saved_at: Date;
  }>(
    `
      SELECT id, title, city, neighborhood, filters, saved_at
      FROM saved_searches
      ORDER BY saved_at DESC
      LIMIT $1
    `,
    [Math.max(1, Math.min(100, limit))],
  );
  return result.rows.map(
    (row) =>
      ({
        id: row.id,
        title: row.title,
        city: row.city,
        neighborhood: row.neighborhood,
        filters: row.filters,
        savedAt: row.saved_at.toISOString(),
      }) satisfies SavedSearch,
  );
}

export async function saveDiscovery(collection: SerperCollection) {
  await query(
    `
      INSERT INTO search_runs (
        id, query, city, neighborhood, filters, discovery_response,
        searched_at, status, discovered_count
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, 'discovered', $8)
      ON CONFLICT (id) DO UPDATE SET
        query = EXCLUDED.query,
        filters = EXCLUDED.filters,
        discovery_response = EXCLUDED.discovery_response,
        discovered_count = EXCLUDED.discovered_count
    `,
    [
      collection.id,
      collection.query,
      collection.city,
      collection.neighborhood,
      json(collection.filters ?? {}),
      json(collection.rawResponse),
      collection.collectedAt,
      collection.results.length,
    ],
  );
}

export async function readDiscovery(id: string): Promise<SerperCollection> {
  const result = await query<{
    id: string;
    searched_at: Date;
    city: "Rio de Janeiro";
    neighborhood: string;
    query: string;
    filters: SerperCollection["filters"];
    discovery_response: { results?: SerperCollection["results"]; organic?: SerperCollection["results"] };
  }>(
    `
      SELECT id, searched_at, city, neighborhood, query, filters, discovery_response
      FROM search_runs
      WHERE id = $1
    `,
    [id],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Coleta da Serper não encontrada no banco de dados.");
  return {
    id: row.id,
    collectedAt: row.searched_at.toISOString(),
    city: row.city,
    neighborhood: row.neighborhood,
    query: row.query,
    filters: row.filters,
    results: row.discovery_response.results ?? row.discovery_response.organic ?? [],
    rawResponse: row.discovery_response,
  };
}

async function upsertProperty(
  client: PoolClient,
  listing: CollectedListing,
  seenAt: string,
) {
  const result = await client.query<{
    id: string;
    last_researched_at: Date | null;
    eligible: boolean;
    suppressed_until: Date | null;
  }>(
    `
      INSERT INTO properties (
        id, identity_key, property_type, neighborhood, location, bedrooms,
        parking_spaces, area_m2, first_seen_at, last_seen_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
      ON CONFLICT (identity_key) DO UPDATE SET
        property_type = EXCLUDED.property_type,
        neighborhood = EXCLUDED.neighborhood,
        location = COALESCE(EXCLUDED.location, properties.location),
        bedrooms = COALESCE(EXCLUDED.bedrooms, properties.bedrooms),
        parking_spaces = COALESCE(EXCLUDED.parking_spaces, properties.parking_spaces),
        area_m2 = COALESCE(EXCLUDED.area_m2, properties.area_m2),
        last_seen_at = GREATEST(properties.last_seen_at, EXCLUDED.last_seen_at),
        updated_at = now()
      RETURNING
        id,
        last_researched_at,
        (
          last_researched_at IS NULL
          OR last_researched_at <= $9::timestamptz - INTERVAL '6 months'
        ) AS eligible,
        last_researched_at + INTERVAL '6 months' AS suppressed_until
    `,
    [
      randomUUID(),
      identityHash(listing),
      listing.propertyType,
      listing.neighborhood,
      listing.location ?? null,
      listing.bedrooms ?? null,
      listing.parkingSpaces ?? null,
      listing.areaM2 ?? null,
      seenAt,
    ],
  );
  return result.rows[0];
}

async function upsertListingAliases(
  client: PoolClient,
  propertyId: string,
  listing: CollectedListing,
  seenAt: string,
) {
  const externalId = listing.id.split(":").slice(1).join(":") || identityHash(listing);
  for (const source of listing.sources.length ? listing.sources : [listing.source]) {
    await client.query(
      `
        INSERT INTO property_listings (
          id, property_id, source, external_id, canonical_url,
          source_search_url, first_seen_at, last_seen_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
        ON CONFLICT (source, external_id) DO UPDATE SET
          property_id = EXCLUDED.property_id,
          canonical_url = EXCLUDED.canonical_url,
          source_search_url = EXCLUDED.source_search_url,
          last_seen_at = GREATEST(property_listings.last_seen_at, EXCLUDED.last_seen_at)
      `,
      [
        randomUUID(),
        propertyId,
        source,
        externalId,
        listing.link,
        listing.sourceSearchUrl,
        seenAt,
      ],
    );
  }
}

export async function persistMultiPortalRun(run: MultiPortalRun): Promise<MultiPortalRun> {
  return withTransaction(async (client) => {
    const existing = await client.query<{
      status: string;
      eligible_count: number;
      suppressed_count: number;
    }>(
      `
        SELECT status, eligible_count, suppressed_count
        FROM search_runs
        WHERE id = $1
        FOR UPDATE
      `,
      [run.id],
    );
    if (!existing.rowCount) {
      throw new Error("A descoberta desta pesquisa não existe no banco de dados.");
    }
    if (existing.rows[0].status === "completed") {
      const savedListings = await client.query<{ listing_snapshot: CollectedListing }>(
        `
          SELECT listing_snapshot
          FROM search_results
          WHERE search_run_id = $1 AND eligible_for_research = true
          ORDER BY seen_at DESC
        `,
        [run.id],
      );
      const savedSources = await client.query<SourceCollectionStatus>(
        `
          SELECT
            source,
            search_url AS "searchUrl",
            status,
            http_status AS "httpStatus",
            found,
            message,
            duration_ms AS "durationMs"
          FROM source_collections
          WHERE search_run_id = $1
          ORDER BY duration_ms
        `,
        [run.id],
      );
      return {
        ...run,
        listings: savedListings.rows.map((item) => item.listing_snapshot),
        sources: savedSources.rows,
        totalCollected:
          existing.rows[0].eligible_count + existing.rows[0].suppressed_count,
        suppressedCount: existing.rows[0].suppressed_count,
      };
    }

    for (const source of run.sources) {
      await client.query(
        `
          INSERT INTO source_collections (
            search_run_id, source, search_url, status, http_status,
            found, message, duration_ms, collected_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (search_run_id, source, search_url) DO UPDATE SET
            status = EXCLUDED.status,
            http_status = EXCLUDED.http_status,
            found = EXCLUDED.found,
            message = EXCLUDED.message,
            duration_ms = EXCLUDED.duration_ms,
            collected_at = EXCLUDED.collected_at
        `,
        [
          run.id,
          source.source,
          source.searchUrl,
          source.status,
          source.httpStatus ?? null,
          source.found,
          source.message ?? null,
          source.durationMs,
          run.collectedAt,
        ],
      );
    }

    const eligibleListings: CollectedListing[] = [];
    let suppressedCount = 0;
    for (const listing of run.listings) {
      const property = await upsertProperty(client, listing, run.collectedAt);
      await upsertListingAliases(client, property.id, listing, run.collectedAt);
      if (property.eligible) {
        eligibleListings.push(listing);
      } else {
        suppressedCount += 1;
      }
      await client.query(
        `
          INSERT INTO search_results (
            search_run_id, property_id, listing_snapshot, seen_at,
            eligible_for_research, suppressed_until
          )
          VALUES ($1, $2, $3::jsonb, $4, $5, $6)
          ON CONFLICT (search_run_id, property_id) DO UPDATE SET
            listing_snapshot = EXCLUDED.listing_snapshot,
            seen_at = EXCLUDED.seen_at,
            eligible_for_research = EXCLUDED.eligible_for_research,
            suppressed_until = EXCLUDED.suppressed_until
        `,
        [
          run.id,
          property.id,
          json(listing),
          run.collectedAt,
          property.eligible,
          property.eligible ? null : property.suppressed_until,
        ],
      );
    }

    await client.query(
      `
        UPDATE search_runs SET
          completed_at = $2,
          status = 'completed',
          discovered_count = $3,
          eligible_count = $4,
          suppressed_count = $5
        WHERE id = $1
      `,
      [run.id, run.collectedAt, run.listings.length, eligibleListings.length, suppressedCount],
    );
    return {
      ...run,
      listings: eligibleListings,
      totalCollected: run.listings.length,
      suppressedCount,
    };
  });
}

export async function readLatestPortalRun(): Promise<MultiPortalRun> {
  const search = await query<{
    id: string;
    completed_at: Date;
    filters: MultiPortalRun["filters"];
    discovered_count: number;
    suppressed_count: number;
  }>(
    `
      SELECT id, completed_at, filters, discovered_count, suppressed_count
      FROM search_runs
      WHERE status = 'completed'
      ORDER BY completed_at DESC
      LIMIT 1
    `,
  );
  const row = search.rows[0];
  if (!row) throw new Error("Nenhuma pesquisa multiportal foi concluída.");
  const [listings, sources] = await Promise.all([
    query<{ listing_snapshot: CollectedListing }>(
      `
        SELECT sr.listing_snapshot
        FROM search_results sr
        JOIN properties p ON p.id = sr.property_id
        WHERE sr.search_run_id = $1
          AND sr.eligible_for_research = true
          AND (
            p.last_researched_at IS NULL
            OR p.last_researched_at <= now() - INTERVAL '6 months'
          )
        ORDER BY sr.seen_at DESC
      `,
      [row.id],
    ),
    query<SourceCollectionStatus>(
      `
        SELECT
          source,
          search_url AS "searchUrl",
          status,
          http_status AS "httpStatus",
          found,
          message,
          duration_ms AS "durationMs"
        FROM source_collections
        WHERE search_run_id = $1
        ORDER BY duration_ms
      `,
      [row.id],
    ),
  ]);
  return {
    id: row.id,
    collectionId: row.id,
    collectedAt: row.completed_at.toISOString(),
    filters: row.filters,
    listings: listings.rows.map((item) => item.listing_snapshot),
    sources: sources.rows,
    totalCollected: row.discovered_count,
    suppressedCount: row.suppressed_count,
  };
}

export async function getPropertyAnalysisContext(runId: string, listingId: string) {
  const result = await query<{
    property_id: string;
    listing_snapshot: CollectedListing;
  }>(
    `
      SELECT sr.property_id, sr.listing_snapshot
      FROM search_results sr
      WHERE sr.search_run_id = $1
        AND sr.eligible_for_research = true
        AND sr.listing_snapshot->>'id' = $2
    `,
    [runId, listingId],
  );
  return result.rows[0];
}

export async function getEligiblePropertyAnalysisContexts(runId: string) {
  const result = await query<{
    property_id: string;
    listing_snapshot: CollectedListing;
  }>(
    `
      SELECT sr.property_id, sr.listing_snapshot
      FROM search_results sr
      JOIN properties p ON p.id = sr.property_id
      WHERE sr.search_run_id = $1
        AND sr.eligible_for_research = true
        AND (
          p.last_researched_at IS NULL
          OR p.last_researched_at <= now() - INTERVAL '6 months'
        )
      ORDER BY
        CASE
          WHEN jsonb_typeof(sr.listing_snapshot->'price') = 'number'
            THEN (sr.listing_snapshot->>'price')::numeric
          ELSE NULL
        END NULLS LAST,
        sr.listing_snapshot->>'title'
    `,
    [runId],
  );
  return result.rows;
}

export async function readValidPropertyAnalysis(propertyId: string) {
  const result = await query<{
    result: Omit<
      SavedPropertyAnalysis,
      "listingId" | "runId" | "analyzedAt" | "model" | "descriptionSource"
    >;
    analyzed_at: Date;
    model: string;
    description_source: string;
  }>(
    `
      SELECT result, analyzed_at, model, description_source
      FROM property_analyses
      WHERE property_id = $1
        AND analysis_kind = 'features'
        AND valid_until > now()
      ORDER BY analyzed_at DESC
      LIMIT 1
    `,
    [propertyId],
  );
  return result.rows[0];
}

export async function saveDbPropertyAnalysis(
  propertyId: string,
  analysis: SavedPropertyAnalysis,
) {
  await withTransaction(async (client) => {
    await client.query(
      `
        INSERT INTO property_analyses (
          id, property_id, analysis_kind, result, model,
          description_source, analyzed_at, valid_until
        )
        VALUES ($1, $2, 'features', $3::jsonb, $4, $5, $6, $6::timestamptz + INTERVAL '6 months')
      `,
      [
        randomUUID(),
        propertyId,
        json({
          slabRights: analysis.slabRights,
          balconyBarbecue: analysis.balconyBarbecue,
          evidence: analysis.evidence,
          summary: analysis.summary,
        }),
        analysis.model,
        analysis.descriptionSource,
        analysis.analyzedAt,
      ],
    );
    await client.query(
      `
        UPDATE properties
        SET last_researched_at = GREATEST(
          COALESCE(last_researched_at, $2::timestamptz),
          $2::timestamptz
        ), updated_at = now()
        WHERE id = $1
      `,
      [propertyId, analysis.analyzedAt],
    );
  });
}

export async function readSuppressedHistory(limit = 50) {
  const result = await query<{
    search_run_id: string;
    property_id: string;
    listing_id: string;
    title: string;
    source: string;
    link: string;
    neighborhood: string;
    seen_at: Date;
    suppressed_until: Date;
    analysis_id: string;
    analysis_result: PropertyFeatureAnalysis;
    slab_rights_answer: AnalysisReviewAnswer | null;
    balcony_barbecue_answer: AnalysisReviewAnswer | null;
  }>(
    `
      WITH latest_analyses AS (
        SELECT DISTINCT ON (
          pa.property_id,
          lower(trim(listing.source))
        )
          pa.id AS analysis_id,
          pa.property_id,
          pa.result AS analysis_result,
          pa.analyzed_at,
          pa.valid_until,
          listing.source,
          listing.canonical_url
        FROM property_analyses pa
        JOIN LATERAL (
          SELECT pl.source, pl.canonical_url
          FROM property_listings pl
          WHERE pl.property_id = pa.property_id
            AND pl.canonical_url = pa.description_source
          ORDER BY pl.last_seen_at DESC
          LIMIT 1
        ) listing ON true
        WHERE pa.analysis_kind = 'features'
          AND pa.valid_until > now()
        ORDER BY
          pa.property_id,
          lower(trim(listing.source)),
          pa.analyzed_at DESC
      )
      SELECT
        COALESCE(snapshot.search_run_id::text, '') AS search_run_id,
        history.property_id,
        COALESCE(snapshot.listing_snapshot->>'id', '') AS listing_id,
        COALESCE(snapshot.listing_snapshot->>'title', 'Imóvel analisado') AS title,
        history.source,
        history.canonical_url AS link,
        COALESCE(snapshot.listing_snapshot->>'neighborhood', properties.neighborhood) AS neighborhood,
        history.analyzed_at AS seen_at,
        history.valid_until AS suppressed_until,
        history.analysis_id,
        history.analysis_result,
        review.slab_rights_answer,
        review.balcony_barbecue_answer
      FROM latest_analyses history
      JOIN properties ON properties.id = history.property_id
      LEFT JOIN LATERAL (
        SELECT sr.search_run_id, sr.listing_snapshot
        FROM search_results sr
        WHERE sr.property_id = history.property_id
          AND sr.listing_snapshot->>'link' = history.canonical_url
        ORDER BY sr.seen_at DESC
        LIMIT 1
      ) snapshot ON true
      LEFT JOIN property_analysis_reviews review
        ON review.analysis_id = history.analysis_id
      ORDER BY history.analyzed_at DESC
      LIMIT $1
    `,
    [Math.max(1, Math.min(200, limit))],
  );
  return result.rows.map((row): SuppressedHistoryItem => {
    const slabAmbiguous =
      row.analysis_result.slabRights === "ambiguous" &&
      (!row.slab_rights_answer || row.slab_rights_answer === "unknown");
    const barbecueAmbiguous =
      row.analysis_result.balconyBarbecue === "ambiguous" &&
      (!row.balcony_barbecue_answer || row.balcony_barbecue_answer === "unknown");
    const hasSlab =
      row.analysis_result.slabRights === "document_claimed" ||
      row.analysis_result.slabRights === "mentioned_unverified" ||
      (row.analysis_result.slabRights === "ambiguous" && row.slab_rights_answer === "yes");
    const hasBarbecue =
      row.analysis_result.balconyBarbecue === "explicit" ||
      (row.analysis_result.balconyBarbecue === "ambiguous" &&
        row.balcony_barbecue_answer === "yes");
    const category: HistoryResultCategory =
      slabAmbiguous || barbecueAmbiguous
        ? "ambiguous"
        : hasSlab && hasBarbecue
          ? "both"
          : hasSlab
            ? "slab_rights"
            : hasBarbecue
              ? "balcony_barbecue"
              : "none";
    return {
      searchRunId: row.search_run_id,
      propertyId: row.property_id,
      listingId: row.listing_id,
      title: row.title,
      source: row.source,
      link: row.link,
      neighborhood: row.neighborhood,
      seenAt: row.seen_at.toISOString(),
      suppressedUntil: row.suppressed_until.toISOString(),
      analysisId: row.analysis_id,
      slabRights: row.analysis_result.slabRights,
      balconyBarbecue: row.analysis_result.balconyBarbecue,
      summary: row.analysis_result.summary,
      ...(row.slab_rights_answer ? { slabRightsAnswer: row.slab_rights_answer } : {}),
      ...(row.balcony_barbecue_answer
        ? { balconyBarbecueAnswer: row.balcony_barbecue_answer }
        : {}),
      category,
    };
  });
}

export async function answerAnalysisAmbiguity(input: {
  analysisId: string;
  feature: "slab_rights" | "balcony_barbecue";
  answer: AnalysisReviewAnswer;
}) {
  const analysis = await query<{ result: PropertyFeatureAnalysis }>(
    "SELECT result FROM property_analyses WHERE id = $1",
    [input.analysisId],
  );
  const result = analysis.rows[0]?.result;
  if (!result) throw new Error("Análise não encontrada.");
  const isAmbiguous =
    input.feature === "slab_rights"
      ? result.slabRights === "ambiguous"
      : result.balconyBarbecue === "ambiguous";
  if (!isAmbiguous) {
    throw new Error("Somente resultados ambíguos podem receber uma resposta manual.");
  }
  const slabAnswer = input.feature === "slab_rights" ? input.answer : null;
  const barbecueAnswer = input.feature === "balcony_barbecue" ? input.answer : null;
  await query(
    `
      INSERT INTO property_analysis_reviews (
        id, analysis_id, slab_rights_answer, balcony_barbecue_answer, answered_at
      )
      VALUES ($1, $2, $3, $4, now())
      ON CONFLICT (analysis_id) DO UPDATE SET
        slab_rights_answer = COALESCE(EXCLUDED.slab_rights_answer, property_analysis_reviews.slab_rights_answer),
        balcony_barbecue_answer = COALESCE(EXCLUDED.balcony_barbecue_answer, property_analysis_reviews.balcony_barbecue_answer),
        answered_at = now()
    `,
    [randomUUID(), input.analysisId, slabAnswer, barbecueAnswer],
  );
}

export async function recomputeAiCooldownHistory() {
  await withTransaction(async (client) => {
    await client.query(`
      UPDATE properties p
      SET
        last_researched_at = latest.analyzed_at,
        updated_at = now()
      FROM (
        SELECT property_id, max(analyzed_at) AS analyzed_at
        FROM property_analyses
        GROUP BY property_id
      ) latest
      WHERE latest.property_id = p.id
    `);
    await client.query(`
      UPDATE properties p
      SET last_researched_at = NULL, updated_at = now()
      WHERE NOT EXISTS (
        SELECT 1 FROM property_analyses pa WHERE pa.property_id = p.id
      )
    `);
    await client.query(`
      UPDATE search_results sr
      SET
        eligible_for_research = NOT EXISTS (
          SELECT 1
          FROM property_analyses pa
          WHERE pa.property_id = sr.property_id
            AND pa.analyzed_at <= sr.seen_at
            AND pa.valid_until > sr.seen_at
        ),
        suppressed_until = (
          SELECT max(pa.valid_until)
          FROM property_analyses pa
          WHERE pa.property_id = sr.property_id
            AND pa.analyzed_at <= sr.seen_at
            AND pa.valid_until > sr.seen_at
        )
    `);
    await client.query(`
      UPDATE search_runs run
      SET
        eligible_count = totals.eligible_count,
        suppressed_count = totals.suppressed_count
      FROM (
        SELECT
          search_run_id,
          count(*) FILTER (WHERE eligible_for_research)::integer AS eligible_count,
          count(*) FILTER (WHERE NOT eligible_for_research)::integer AS suppressed_count
        FROM search_results
        GROUP BY search_run_id
      ) totals
      WHERE totals.search_run_id = run.id
    `);
  });
}
