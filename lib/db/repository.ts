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
import type { ListingPurpose, LocationStatus } from "../listings";
import { neighborhoodLabel, normalizeNeighborhoods } from "../neighborhoods";
import type { AnalysisBatchCount, AnalysisIntervalMinutes } from "../schedule";
import type {
  PropertyFeatureAnalysis,
  SavedPropertyAnalysis,
} from "../property-analysis";
import { query, withTransaction } from "./client";

const json = (value: unknown) => JSON.stringify(value);
const identityHash = (listing: CollectedListing) =>
  createHash("sha256").update(propertyIdentityKey(listing)).digest("hex");

function canonicalListingLink(link: string) {
  try {
    const url = new URL(link);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return link.trim();
  }
}

async function readDismissedLinks(userId: string) {
  const result = await query<{ url: string }>(
    `
      SELECT canonical_url AS url FROM tb_dismissed_listings WHERE user_id = $1
      UNION
      SELECT canonical_url AS url FROM tb_penthouse_dispositions
      WHERE user_id = $1 AND disposition = 'dismissed'
    `,
    [userId],
  );
  return new Set(result.rows.map((row) => canonicalListingLink(row.url)));
}

function excludeDismissedListings(listings: CollectedListing[], dismissed: Set<string>) {
  if (!dismissed.size) return listings;
  return listings.filter((listing) => !dismissed.has(canonicalListingLink(listing.link)));
}

export type SuppressedHistoryItem = {
  searchRunId: string;
  propertyId: string;
  listingId: string;
  title: string;
  source: string;
  link: string;
  neighborhood: string;
  location?: string;
  seenAt: string;
  suppressedUntil: string;
  analysisId: string;
  slabRights: PropertyFeatureAnalysis["slabRights"];
  balconyBarbecue: PropertyFeatureAnalysis["balconyBarbecue"];
  summary: string;
  slabRightsAnswer?: AnalysisReviewAnswer;
  balconyBarbecueAnswer?: AnalysisReviewAnswer;
  category: HistoryResultCategory;
  purpose: ListingPurpose;
  rentAmount?: number;
  propertyType?: "apartment" | "penthouse";
  penthouseDisposition?: "saved" | "dismissed" | null;
  dismissed?: boolean;
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
  neighborhoods: string[];
  filters: SearchFilters;
  savedAt: string;
  analysisIntervalMinutes: AnalysisIntervalMinutes;
  analysisBatchCount: AnalysisBatchCount;
  lastSearchedAt: string | null;
  lastAnalyzedAt: string | null;
  latestSearchRunId: string | null;
  searchError: string | null;
  analysisError: string | null;
  analysisEnabled: boolean;
  completedRunCount: number;
  userId: string | null;
};

type SavedSearchRow = {
  id: string;
  title: string;
  city: string;
  neighborhood: string;
  neighborhoods: string[] | null;
  filters: SearchFilters;
  saved_at: Date;
  analysis_interval_minutes: AnalysisIntervalMinutes;
  analysis_batch_count: AnalysisBatchCount;
  last_searched_at: Date | null;
  last_analyzed_at: Date | null;
  latest_search_run_id: string | null;
  search_error: string | null;
  analysis_error: string | null;
  analysis_enabled: boolean;
  completed_run_count: number;
  user_id: string | null;
};

const savedSearchColumns = `
  id, title, city, neighborhood, neighborhoods, filters, saved_at,
  analysis_interval_minutes, analysis_batch_count,
  last_searched_at, last_analyzed_at, latest_search_run_id,
  search_error, analysis_error, analysis_enabled, user_id,
  (
    SELECT COUNT(*)::int
    FROM tb_search_runs runs
    WHERE runs.saved_search_id = tb_saved_searches.id
      AND runs.status = 'completed'
  ) AS completed_run_count
`;

function mapSavedSearch(row: SavedSearchRow): SavedSearch {
  const batchCount = String(row.analysis_batch_count);
  return {
    id: row.id,
    title: row.title,
    city: row.city,
    neighborhood: row.neighborhood,
    neighborhoods: normalizeNeighborhoods(row.neighborhoods?.length ? row.neighborhoods : [row.neighborhood]),
    filters: row.filters,
    savedAt: row.saved_at.toISOString(),
    analysisIntervalMinutes: Number(row.analysis_interval_minutes) as AnalysisIntervalMinutes,
    analysisBatchCount: batchCount === "all" ? "all" : (Number(batchCount) as 5 | 10 | 15),
    lastSearchedAt: row.last_searched_at?.toISOString() ?? null,
    lastAnalyzedAt: row.last_analyzed_at?.toISOString() ?? null,
    latestSearchRunId: row.latest_search_run_id,
    searchError: row.search_error,
    analysisError: row.analysis_error,
    analysisEnabled: row.analysis_enabled !== false,
    completedRunCount: row.completed_run_count ?? 0,
    userId: row.user_id,
  };
}

export async function linkSearchRunToSavedSearch(runId: string, savedSearchId: string) {
  await query(
    `
      UPDATE tb_search_runs run
      SET saved_search_id = $2,
          user_id = COALESCE(run.user_id, saved.user_id)
      FROM tb_saved_searches saved
      WHERE run.id = $1
        AND saved.id = $2
    `,
    [runId, savedSearchId],
  );
}

export async function assignSearchRunUser(runId: string, userId: string) {
  await query(
    `
      UPDATE tb_search_runs
      SET user_id = COALESCE(user_id, $2)
      WHERE id = $1
    `,
    [runId, userId],
  );
}

export async function saveSavedSearch(input: {
  userId: string;
  city: string;
  neighborhoods: string[];
  filters: SearchFilters;
}) {
  const neighborhoods = normalizeNeighborhoods(input.neighborhoods);
  const label = neighborhoodLabel(neighborhoods);
  const searchKey = createHash("sha256")
    .update(json({ city: input.city, neighborhoods, filters: input.filters }))
    .digest("hex");
  const purpose = input.filters.purpose === "sale" ? "Compra" : "Aluguel";
  const title = `${purpose} · ${label} · ${input.filters.bedroomsMin}+ quartos`;
  const result = await query<SavedSearchRow>(
    `
      INSERT INTO tb_saved_searches (
        id, search_key, title, city, neighborhood, neighborhoods, filters, saved_at, user_id
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, now(), $8)
      ON CONFLICT (user_id, search_key) DO UPDATE SET
        title = EXCLUDED.title,
        saved_at = now()
      RETURNING ${savedSearchColumns}
    `,
    [
      randomUUID(),
      searchKey,
      title,
      input.city,
      label,
      json(neighborhoods),
      json(input.filters),
      input.userId,
    ],
  );
  return mapSavedSearch(result.rows[0]);
}

export async function updateSavedSearchSchedule(input: {
  id: string;
  analysisIntervalMinutes: AnalysisIntervalMinutes;
  analysisBatchCount: AnalysisBatchCount;
  analysisEnabled: boolean;
}) {
  const result = await query<SavedSearchRow>(
    `
      UPDATE tb_saved_searches
      SET analysis_interval_minutes = $2,
          analysis_batch_count = $3,
          analysis_enabled = $4
      WHERE id = $1
      RETURNING ${savedSearchColumns}
    `,
    [input.id, input.analysisIntervalMinutes, String(input.analysisBatchCount), input.analysisEnabled],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Pesquisa salva não encontrada.");
  return mapSavedSearch(row);
}

function savedSearchIdentity(input: {
  city: string;
  neighborhoods: string[];
  filters: SearchFilters;
}) {
  const neighborhoods = normalizeNeighborhoods(input.neighborhoods);
  const label = neighborhoodLabel(neighborhoods);
  const searchKey = createHash("sha256")
    .update(json({ city: input.city, neighborhoods, filters: input.filters }))
    .digest("hex");
  const purpose = input.filters.purpose === "sale" ? "Compra" : "Aluguel";
  return {
    neighborhoods,
    label,
    searchKey,
    title: `${purpose} · ${label} · ${input.filters.bedroomsMin}+ quartos`,
  };
}

function rethrowSavedSearchConflict(error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
    throw new Error("Já existe um agendamento com esses filtros.");
  }
  throw error;
}

export async function updateSavedSearch(input: {
  id: string;
  city: string;
  neighborhoods: string[];
  filters: SearchFilters;
}) {
  const identity = savedSearchIdentity(input);
  try {
    const result = await query<SavedSearchRow>(
      `
        UPDATE tb_saved_searches
        SET search_key = $2,
            title = $3,
            city = $4,
            neighborhood = $5,
            neighborhoods = $6::jsonb,
            filters = $7::jsonb,
            saved_at = now()
        WHERE id = $1
        RETURNING ${savedSearchColumns}
      `,
      [
        input.id,
        identity.searchKey,
        identity.title,
        input.city,
        identity.label,
        json(identity.neighborhoods),
        json(input.filters),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Pesquisa salva não encontrada.");
    return mapSavedSearch(row);
  } catch (error) {
    rethrowSavedSearchConflict(error);
  }
}

export async function deleteSavedSearch(id: string) {
  const result = await query("DELETE FROM tb_saved_searches WHERE id = $1", [id]);
  if (!result.rowCount) throw new Error("Pesquisa salva não encontrada.");
}

export async function deleteSchedulerRun(id: string) {
  const result = await query("DELETE FROM tb_scheduler_runs WHERE id = $1", [id]);
  if (!result.rowCount) throw new Error("Execução não encontrada.");
}

export async function markScheduledSearch(
  id: string,
  input: { searchedAt: string; searchRunId?: string; error?: string },
) {
  await query(
    `
      UPDATE tb_saved_searches
      SET last_searched_at = $2,
          latest_search_run_id = COALESCE($3, latest_search_run_id),
          search_error = $4
      WHERE id = $1
    `,
    [id, input.searchedAt, input.searchRunId ?? null, input.error ?? null],
  );
}

export async function markScheduledAnalysis(
  id: string,
  input: { analyzedAt: string; error?: string },
) {
  await query(
    `
      UPDATE tb_saved_searches
      SET last_analyzed_at = $2,
          analysis_error = $3
      WHERE id = $1
    `,
    [id, input.analyzedAt, input.error ?? null],
  );
}

export async function recordSchedulerRun(input: {
  savedSearchId: string;
  jobKind: "search" | "analysis";
  status: "completed" | "failed";
  message: string;
  startedAt: string;
  finishedAt: string;
}) {
  await query(
    `
      INSERT INTO tb_scheduler_runs (
        id, saved_search_id, job_kind, status, message, started_at, finished_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      randomUUID(),
      input.savedSearchId,
      input.jobKind,
      input.status,
      input.message,
      input.startedAt,
      input.finishedAt,
    ],
  );
}

export async function readRecentSchedulerRuns(limit = 12) {
  const result = await query<{
    id: string;
    saved_search_id: string;
    title: string;
    job_kind: "search" | "analysis";
    status: "completed" | "failed";
    message: string | null;
    finished_at: Date;
  }>(
    `
      SELECT
        run.id,
        run.saved_search_id,
        saved.title,
        run.job_kind,
        run.status,
        run.message,
        run.finished_at
      FROM tb_scheduler_runs run
      JOIN tb_saved_searches saved ON saved.id = run.saved_search_id
      ORDER BY run.finished_at DESC
      LIMIT $1
    `,
    [Math.max(1, Math.min(50, limit))],
  );
  return result.rows.map((row) => ({
    id: row.id,
    savedSearchId: row.saved_search_id,
    title: row.title,
    jobKind: row.job_kind,
    status: row.status,
    message: row.message,
    finishedAt: row.finished_at.toISOString(),
  }));
}

export async function readSavedSearches(limit = 50, userId?: string) {
  const result = await query<SavedSearchRow>(
    userId
      ? `
          SELECT ${savedSearchColumns}
          FROM tb_saved_searches
          WHERE user_id = $2
          ORDER BY saved_at DESC
          LIMIT $1
        `
      : `
          SELECT ${savedSearchColumns}
          FROM tb_saved_searches
          ORDER BY saved_at DESC
          LIMIT $1
        `,
    userId
      ? [Math.max(1, Math.min(100, limit)), userId]
      : [Math.max(1, Math.min(100, limit))],
  );
  return result.rows.map(mapSavedSearch);
}

export async function saveDiscovery(collection: SerperCollection, userId?: string) {
  await query(
    `
      INSERT INTO tb_search_runs (
        id, query, city, neighborhood, filters, discovery_response,
        searched_at, status, discovered_count, user_id
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, 'discovered', $8, $9)
      ON CONFLICT (id) DO UPDATE SET
        query = EXCLUDED.query,
        filters = EXCLUDED.filters,
        discovery_response = EXCLUDED.discovery_response,
        discovered_count = EXCLUDED.discovered_count,
        user_id = COALESCE(tb_search_runs.user_id, EXCLUDED.user_id)
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
      userId ?? null,
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
      FROM tb_search_runs
      WHERE id = $1
    `,
    [id],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Coleta não encontrada no banco de dados.");
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
  ownerUserId?: string | null,
) {
  const result = await client.query<{
    id: string;
    location_status: LocationStatus;
    last_researched_at: Date | null;
    eligible: boolean;
    suppressed_until: Date | null;
  }>(
    `
      INSERT INTO tb_properties (
        id, identity_key, property_type, neighborhood, location, location_status, bedrooms,
        parking_spaces, area_m2, first_seen_at, last_seen_at, user_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $11)
      ON CONFLICT (identity_key) DO UPDATE SET
        property_type = EXCLUDED.property_type,
        neighborhood = EXCLUDED.neighborhood,
        location = COALESCE(EXCLUDED.location, tb_properties.location),
        location_status = EXCLUDED.location_status,
        bedrooms = COALESCE(EXCLUDED.bedrooms, tb_properties.bedrooms),
        parking_spaces = COALESCE(EXCLUDED.parking_spaces, tb_properties.parking_spaces),
        area_m2 = COALESCE(EXCLUDED.area_m2, tb_properties.area_m2),
        last_seen_at = GREATEST(tb_properties.last_seen_at, EXCLUDED.last_seen_at),
        user_id = COALESCE(tb_properties.user_id, EXCLUDED.user_id),
        updated_at = now()
      RETURNING id
    `,
    [
      randomUUID(),
      identityHash(listing),
      listing.propertyType,
      listing.neighborhood,
      listing.location ?? null,
      listing.locationStatus ?? "unknown",
      listing.bedrooms ?? null,
      listing.parkingSpaces ?? null,
      listing.areaM2 ?? null,
      seenAt,
      ownerUserId ?? null,
    ],
  );
  const propertyId = result.rows[0].id;
  const window = await client.query<{
    last_researched_at: Date | null;
    eligible: boolean;
    suppressed_until: Date | null;
  }>(
    `
      SELECT
        research.last_researched_at,
        (
          research.last_researched_at IS NULL
          OR research.last_researched_at <= $3::timestamptz - INTERVAL '6 months'
        ) AND property.location_status <> 'excluded' AS eligible,
        research.last_researched_at + INTERVAL '6 months' AS suppressed_until
      FROM tb_properties property
      LEFT JOIN tb_property_purpose_research research
        ON research.property_id = property.id
       AND research.purpose = $2
      WHERE property.id = $1
    `,
    [propertyId, listing.purpose, seenAt],
  );
  return { id: propertyId, ...window.rows[0] };
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
        INSERT INTO tb_property_listings (
          id, property_id, source, external_id, canonical_url,
          source_search_url, first_seen_at, last_seen_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
        ON CONFLICT (source, external_id) DO UPDATE SET
          property_id = EXCLUDED.property_id,
          canonical_url = EXCLUDED.canonical_url,
          source_search_url = EXCLUDED.source_search_url,
          last_seen_at = GREATEST(tb_property_listings.last_seen_at, EXCLUDED.last_seen_at)
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
      user_id: string | null;
    }>(
      `
        SELECT status, eligible_count, suppressed_count, user_id
        FROM tb_search_runs
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
          FROM tb_search_results
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
          FROM tb_source_collections
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
          INSERT INTO tb_source_collections (
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

    const ownerUserId = existing.rows[0]?.user_id ?? null;
    const eligibleListings: CollectedListing[] = [];
    let suppressedCount = 0;
    for (const listing of run.listings) {
      const property = await upsertProperty(client, listing, run.collectedAt, ownerUserId);
      await upsertListingAliases(client, property.id, listing, run.collectedAt);
      if (property.eligible) {
        eligibleListings.push(listing);
      } else {
        suppressedCount += 1;
      }
      await client.query(
        `
          INSERT INTO tb_search_results (
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
        UPDATE tb_search_runs SET
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

async function readPortalRunSources(runId: string) {
  const sources = await query<SourceCollectionStatus>(
    `
      SELECT
        source,
        search_url AS "searchUrl",
        status,
        http_status AS "httpStatus",
        found,
        message,
        duration_ms AS "durationMs"
      FROM tb_source_collections
      WHERE search_run_id = $1
      ORDER BY duration_ms
    `,
    [runId],
  );
  return sources.rows;
}

export async function readAccumulatedPortalRun(input: {
  savedSearchId?: string;
  manualOnly?: boolean;
  userId?: string;
}): Promise<MultiPortalRun> {
  const savedSearchId = input.savedSearchId ?? null;
  const manualOnly = input.manualOnly ?? false;
  const userId = input.userId ?? null;
  if (savedSearchId && userId) {
    const owned = await query<{ id: string }>(
      `SELECT id FROM tb_saved_searches WHERE id = $1 AND user_id = $2`,
      [savedSearchId, userId],
    );
    if (!owned.rowCount) throw new Error("Agendamento não encontrado para este usuário.");
  }
  const runs = await query<{
    id: string;
    completed_at: Date;
    filters: MultiPortalRun["filters"];
    discovered_count: number;
    suppressed_count: number;
    saved_search_id: string | null;
  }>(
    `
      SELECT id, completed_at, filters, discovered_count, suppressed_count, saved_search_id
      FROM tb_search_runs
      WHERE status = 'completed'
        AND ($3::uuid IS NULL OR user_id = $3)
        AND (
          ($1::uuid IS NOT NULL AND saved_search_id = $1)
          OR ($2::boolean = true AND saved_search_id IS NULL)
        )
      ORDER BY completed_at ASC
    `,
    [savedSearchId, manualOnly, userId],
  );
  if (!runs.rows.length) {
    if (manualOnly) {
      throw new Error("Nenhuma busca manual concluída ainda.");
    }
    throw new Error("Este agendamento ainda não concluiu nenhuma coleta.");
  }
  const latest = runs.rows[runs.rows.length - 1]!;
  let savedSearchTitle: string | undefined;
  if (savedSearchId) {
    const saved = await query<{ title: string }>(
      `SELECT title FROM tb_saved_searches WHERE id = $1`,
      [savedSearchId],
    );
    savedSearchTitle = saved.rows[0]?.title;
  }
  const listings = await query<{
    listing_snapshot: CollectedListing;
    search_run_id: string;
  }>(
    `
      SELECT DISTINCT ON (sr.property_id)
        sr.listing_snapshot,
        sr.search_run_id
      FROM tb_search_results sr
      JOIN tb_search_runs run ON run.id = sr.search_run_id
      WHERE run.status = 'completed'
        AND sr.eligible_for_research = true
        AND ($3::uuid IS NULL OR run.user_id = $3)
        AND (
          ($1::uuid IS NOT NULL AND run.saved_search_id = $1)
          OR ($2::boolean = true AND run.saved_search_id IS NULL)
        )
      ORDER BY sr.property_id, sr.seen_at DESC
    `,
    [savedSearchId, manualOnly, userId],
  );
  let mergedListings: CollectedListing[] = listings.rows.map((row) => ({
    ...row.listing_snapshot,
    lastSearchRunId: row.search_run_id,
  }));
  if (userId) {
    const dismissed = await readDismissedLinks(userId);
    mergedListings = excludeDismissedListings(mergedListings, dismissed);
  }
  const sources = await readPortalRunSources(latest.id);
  const totalDiscovered = runs.rows.reduce((sum, run) => sum + run.discovered_count, 0);
  const totalSuppressed = runs.rows.reduce((sum, run) => sum + run.suppressed_count, 0);
  return {
    id: latest.id,
    collectionId: latest.id,
    collectedAt: latest.completed_at.toISOString(),
    filters: latest.filters,
    listings: mergedListings,
    sources,
    totalCollected: totalDiscovered,
    suppressedCount: totalSuppressed,
    savedSearchId: savedSearchId ?? null,
    savedSearchTitle,
    accumulatedRunCount: runs.rows.length,
  };
}

export async function readLatestPortalRun(userId?: string): Promise<MultiPortalRun> {
  const search = await query<{
    id: string;
    completed_at: Date;
    filters: MultiPortalRun["filters"];
    discovered_count: number;
    suppressed_count: number;
  }>(
    userId
      ? `
          SELECT id, completed_at, filters, discovered_count, suppressed_count
          FROM tb_search_runs
          WHERE status = 'completed'
            AND user_id = $1
          ORDER BY completed_at DESC
          LIMIT 1
        `
      : `
          SELECT id, completed_at, filters, discovered_count, suppressed_count
          FROM tb_search_runs
          WHERE status = 'completed'
          ORDER BY completed_at DESC
          LIMIT 1
        `,
    userId ? [userId] : [],
  );
  const row = search.rows[0];
  if (!row) throw new Error("Nenhuma pesquisa multiportal foi concluída.");
  const [listings, sources] = await Promise.all([
    query<{ listing_snapshot: CollectedListing }>(
      `
        SELECT sr.listing_snapshot
        FROM tb_search_results sr
        JOIN tb_properties p ON p.id = sr.property_id
        WHERE sr.search_run_id = $1
          AND sr.eligible_for_research = true
          AND NOT EXISTS (
            SELECT 1
            FROM tb_property_purpose_research research
            WHERE research.property_id = p.id
              AND research.purpose = COALESCE(sr.listing_snapshot->>'purpose', 'sale')
              AND research.last_researched_at > now() - INTERVAL '6 months'
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
        FROM tb_source_collections
        WHERE search_run_id = $1
        ORDER BY duration_ms
      `,
      [row.id],
    ),
  ]);
  let runListings = listings.rows.map((item) => item.listing_snapshot);
  if (userId) {
    const dismissed = await readDismissedLinks(userId);
    runListings = excludeDismissedListings(runListings, dismissed);
  }
  return {
    id: row.id,
    collectionId: row.id,
    collectedAt: row.completed_at.toISOString(),
    filters: row.filters,
    listings: runListings,
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
      FROM tb_search_results sr
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
      FROM tb_search_results sr
      JOIN tb_properties p ON p.id = sr.property_id
      WHERE sr.search_run_id = $1
        AND sr.eligible_for_research = true
        AND COALESCE(sr.listing_snapshot->>'purpose', 'sale') = 'sale'
        AND NOT EXISTS (
          SELECT 1
          FROM tb_property_purpose_research research
          WHERE research.property_id = p.id
            AND research.purpose = 'sale'
            AND research.last_researched_at > now() - INTERVAL '6 months'
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

export async function readValidPropertyAnalysis(
  propertyId: string,
  purpose: ListingPurpose = "sale",
) {
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
      FROM tb_property_analyses
      WHERE property_id = $1
        AND analysis_kind = 'features'
        AND purpose = $2
        AND valid_until > now()
      ORDER BY analyzed_at DESC
      LIMIT 1
    `,
    [propertyId, purpose],
  );
  return result.rows[0];
}

export async function saveDbPropertyAnalysis(
  propertyId: string,
  analysis: SavedPropertyAnalysis,
  purpose: ListingPurpose = "sale",
  userId?: string | null,
) {
  await withTransaction(async (client) => {
    await client.query(
      `
        INSERT INTO tb_property_analyses (
          id, property_id, analysis_kind, purpose, result, model,
          description_source, analyzed_at, valid_until, user_id
        )
        VALUES ($1, $2, 'features', $3, $4::jsonb, $5, $6, $7, $7::timestamptz + INTERVAL '6 months', $8)
      `,
      [
        randomUUID(),
        propertyId,
        purpose,
        json({
          slabRights: analysis.slabRights,
          balconyBarbecue: analysis.balconyBarbecue,
          evidence: analysis.evidence,
          summary: analysis.summary,
        }),
        analysis.model,
        analysis.descriptionSource,
        analysis.analyzedAt,
        userId ?? null,
      ],
    );
    await client.query("CALL pr_record_purpose_research($1, $2, $3)", [
      propertyId,
      purpose,
      analysis.analyzedAt,
    ]);
  });
}

export async function readSuppressedHistory(
  limit = 50,
  purpose: ListingPurpose = "sale",
  userId?: string,
) {
  const result = await query<{
    search_run_id: string;
    property_id: string;
    listing_id: string;
    title: string;
    source: string;
    link: string;
    neighborhood: string;
    location: string | null;
    property_type: "apartment" | "penthouse";
    penthouse_disposition: "saved" | "dismissed" | null;
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
        FROM tb_property_analyses pa
        JOIN LATERAL (
          SELECT pl.source, pl.canonical_url
          FROM tb_property_listings pl
          WHERE pl.property_id = pa.property_id
            AND pl.canonical_url = pa.description_source
          ORDER BY pl.last_seen_at DESC
          LIMIT 1
        ) listing ON true
        WHERE pa.analysis_kind = 'features'
          AND pa.purpose = $2
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
        COALESCE(snapshot.listing_snapshot->>'neighborhood', tb_properties.neighborhood) AS neighborhood,
        COALESCE(NULLIF(snapshot.listing_snapshot->>'location', ''), tb_properties.location) AS location,
        tb_properties.property_type,
        pd.disposition AS penthouse_disposition,
        history.analyzed_at AS seen_at,
        history.valid_until AS suppressed_until,
        history.analysis_id,
        history.analysis_result,
        review.slab_rights_answer,
        review.balcony_barbecue_answer
      FROM latest_analyses history
      JOIN tb_properties ON tb_properties.id = history.property_id
      LEFT JOIN tb_penthouse_dispositions pd
        ON pd.user_id = $3::uuid
       AND pd.property_id = history.property_id
       AND pd.canonical_url = history.canonical_url
      LEFT JOIN LATERAL (
        SELECT sr.search_run_id, sr.listing_snapshot
        FROM tb_search_results sr
        WHERE sr.property_id = history.property_id
          AND sr.listing_snapshot->>'link' = history.canonical_url
        ORDER BY sr.seen_at DESC
        LIMIT 1
      ) snapshot ON true
      LEFT JOIN tb_property_analysis_reviews review
        ON review.analysis_id = history.analysis_id
      WHERE ($3::uuid IS NULL OR tb_properties.user_id = $3)
      ORDER BY history.analyzed_at DESC
      LIMIT $1
    `,
    [Math.max(1, Math.min(200, limit)), purpose, userId ?? null],
  );
  const dismissed = userId ? await readDismissedLinks(userId) : new Set<string>();
  return result.rows
    .filter((row) => !dismissed.has(canonicalListingLink(row.link)))
    .map((row): SuppressedHistoryItem => {
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
      ...(row.location ? { location: row.location } : {}),
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
      purpose,
      propertyType: row.property_type,
      penthouseDisposition: row.penthouse_disposition,
    };
    });
}

export function favoriteListingKey(link: string) {
  return createHash("sha256").update(link.trim().toLowerCase()).digest("hex");
}

export async function readFavoriteKeys(userId: string) {
  const result = await query<{ listing_key: string }>(
    `SELECT listing_key FROM tb_user_favorites WHERE user_id = $1`,
    [userId],
  );
  return new Set(result.rows.map((row) => row.listing_key));
}

export async function readFavorites(userId: string) {
  const result = await query<{ listing_snapshot: CollectedListing; created_at: Date }>(
    `
      SELECT listing_snapshot, created_at
      FROM tb_user_favorites
      WHERE user_id = $1
      ORDER BY created_at DESC
    `,
    [userId],
  );
  const dismissed = await readDismissedLinks(userId);
  return excludeDismissedListings(result.rows.map((row) => ({
    ...row.listing_snapshot,
    favoritedAt: row.created_at.toISOString(),
  })), dismissed);
}

export async function addFavorite(
  userId: string,
  listing: CollectedListing,
  propertyId?: string,
) {
  const listingKey = favoriteListingKey(listing.link);
  await query(
    `
      INSERT INTO tb_user_favorites (user_id, listing_key, property_id, listing_snapshot)
      VALUES ($1, $2, $3, $4::jsonb)
      ON CONFLICT (user_id, listing_key) DO NOTHING
    `,
    [userId, listingKey, propertyId ?? null, json(listing)],
  );
  return listingKey;
}

export async function removeFavorite(userId: string, listingKey: string) {
  await query(`DELETE FROM tb_user_favorites WHERE user_id = $1 AND listing_key = $2`, [
    userId,
    listingKey,
  ]);
}

export async function resolvePropertyIdByLink(link: string) {
  const result = await query<{ property_id: string }>(
    `
      SELECT property_id
      FROM tb_property_listings
      WHERE canonical_url = $1
      ORDER BY last_seen_at DESC
      LIMIT 1
    `,
    [link],
  );
  return result.rows[0]?.property_id;
}

export async function dismissListingForUser(input: {
  userId: string;
  link: string;
  listing: CollectedListing;
}) {
  const canonical = canonicalListingLink(input.link);
  const propertyId =
    (await resolvePropertyIdByLink(input.link)) ??
    (canonical !== input.link ? await resolvePropertyIdByLink(canonical) : undefined);
  if (!propertyId) {
    throw new Error("Imóvel ainda não está no banco. Conclua a coleta antes de descartar.");
  }
  const propertyType =
    input.listing.propertyType === "penthouse"
      ? "penthouse"
      : input.listing.propertyType === "apartment"
        ? "apartment"
        : "unknown";
  await query(
    `
      INSERT INTO tb_dismissed_listings (
        user_id, property_id, canonical_url, purpose, property_type, listing_snapshot
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      ON CONFLICT (user_id, property_id, canonical_url) DO UPDATE
      SET listing_snapshot = EXCLUDED.listing_snapshot,
          dismissed_at = now()
    `,
    [
      input.userId,
      propertyId,
      canonical,
      input.listing.purpose,
      propertyType,
      json(input.listing),
    ],
  );
  if (propertyType === "penthouse") {
    await setPenthouseDisposition({
      userId: input.userId,
      propertyId,
      link: canonical,
      disposition: "dismissed",
    });
  }
}

export async function readDismissedListingHistory(
  purpose: ListingPurpose,
  limit: number,
  userId?: string,
) {
  if (!userId) return [] as SuppressedHistoryItem[];
  const result = await query<{
    property_id: string;
    canonical_url: string;
    listing_snapshot: CollectedListing;
    dismissed_at: Date;
    property_type: string;
  }>(
    `
      SELECT property_id, canonical_url, listing_snapshot, dismissed_at, property_type
      FROM tb_dismissed_listings
      WHERE user_id = $1 AND purpose = $2
      ORDER BY dismissed_at DESC
      LIMIT $3
    `,
    [userId, purpose, Math.max(1, Math.min(100, limit))],
  );
  return result.rows.map((row) => {
    const listing = row.listing_snapshot;
    return {
      searchRunId: "",
      propertyId: row.property_id,
      listingId: listing.id,
      title: listing.title,
      source: listing.source,
      link: row.canonical_url,
      neighborhood: listing.neighborhood,
      location: listing.location,
      seenAt: row.dismissed_at.toISOString(),
      suppressedUntil: row.dismissed_at.toISOString(),
      analysisId: `dismissed:${row.property_id}`,
      slabRights: "not_mentioned" as const,
      balconyBarbecue: "not_mentioned" as const,
      summary: "Descartado manualmente. Não reaparece nos resultados.",
      category: "none" as const,
      purpose,
      rentAmount: listing.purpose === "rent" ? listing.price : undefined,
      propertyType:
        row.property_type === "penthouse"
          ? "penthouse"
          : row.property_type === "apartment"
            ? "apartment"
            : undefined,
      penthouseDisposition: row.property_type === "penthouse" ? "dismissed" : null,
      dismissed: true,
    };
  });
}

export type ControlPanelData = {
  totals: {
    properties: number;
    searches: number;
    analyses: number;
    classifiedProperties: number;
  };
  byType: Array<{ label: string; count: number }>;
  byPurpose: Array<{ label: string; count: number }>;
  byLocationQuality: Array<{ label: string; count: number }>;
  byClassification: Array<{ label: string; count: number }>;
  researchers: Array<{
    userId: string | null;
    name: string;
    searches: number;
  }>;
  classifiers: Array<{
    userId: string | null;
    name: string;
    analyses: number;
    classifiedProperties: number;
  }>;
};

export async function readControlPanelData(): Promise<ControlPanelData> {
  const [totals, byType, byPurpose, byLocationQuality, byClassification, researchers, classifiers] = await Promise.all([
    query<{ properties: string; searches: string; analyses: string; classified_properties: string }>(`
      SELECT
        (SELECT count(*) FROM tb_properties) AS properties,
        (SELECT count(*) FROM tb_search_runs) AS searches,
        (SELECT count(*) FROM tb_property_analyses) AS analyses,
        (SELECT count(DISTINCT property_id) FROM tb_property_analyses) AS classified_properties
    `),
    query<{ label: string; count: string }>(`
      SELECT
        CASE property_type
          WHEN 'apartment' THEN 'Apartamento'
          WHEN 'penthouse' THEN 'Cobertura'
          ELSE 'Não identificado'
        END AS label,
        count(*) AS count
      FROM tb_properties
      GROUP BY property_type
      ORDER BY count DESC
    `),
    query<{ label: string; count: string }>(`
      SELECT
        CASE location_status
          WHEN 'excluded' THEN 'Excluído por localização'
          WHEN 'unknown' THEN 'Cidade não determinada'
          WHEN 'confirmed' THEN 'Rio de Janeiro confirmado'
          ELSE 'Não classificado'
        END AS label,
        count(*) AS count
      FROM tb_properties
      GROUP BY location_status
      ORDER BY count DESC
    `),
    query<{ label: string; count: string }>(`
      SELECT
        CASE listing_snapshot->>'purpose'
          WHEN 'sale' THEN 'Compra'
          WHEN 'rent' THEN 'Aluguel'
          ELSE 'Não identificado'
        END AS label,
        count(DISTINCT property_id) AS count
      FROM tb_search_results
      GROUP BY listing_snapshot->>'purpose'
      ORDER BY count DESC
    `),
    query<{ label: string; count: string }>(`
      SELECT
        CASE
          WHEN result->>'slabRights' IN ('document_claimed', 'mentioned_unverified')
            AND result->>'balconyBarbecue' = 'explicit' THEN 'Laje e churrasqueira'
          WHEN result->>'slabRights' IN ('document_claimed', 'mentioned_unverified') THEN 'Com laje'
          WHEN result->>'balconyBarbecue' = 'explicit' THEN 'Com churrasqueira'
          WHEN result->>'slabRights' = 'ambiguous' OR result->>'balconyBarbecue' = 'ambiguous'
            THEN 'Pendente de confirmação'
          ELSE 'Sem classificação de interesse'
        END AS label,
        count(*) AS count
      FROM tb_property_analyses
      GROUP BY 1
      ORDER BY count DESC
    `),
    query<{ user_id: string | null; name: string; searches: string }>(`
      SELECT
        run.user_id,
        COALESCE(user_account.display_name, user_account.email, 'Não identificado') AS name,
        count(*) AS searches
      FROM tb_search_runs run
      LEFT JOIN tb_users user_account ON user_account.id = run.user_id
      GROUP BY run.user_id, user_account.display_name, user_account.email
      ORDER BY searches DESC, name
    `),
    query<{ user_id: string | null; name: string; analyses: string; classified_properties: string }>(`
      SELECT
        analysis.user_id,
        COALESCE(user_account.display_name, user_account.email, 'Não identificado') AS name,
        count(*) AS analyses,
        count(DISTINCT analysis.property_id) AS classified_properties
      FROM tb_property_analyses analysis
      LEFT JOIN tb_users user_account ON user_account.id = analysis.user_id
      GROUP BY analysis.user_id, user_account.display_name, user_account.email
      ORDER BY analyses DESC, name
    `),
  ]);

  const count = (value: string) => Number(value);
  const total = totals.rows[0] ?? {
    properties: "0",
    searches: "0",
    analyses: "0",
    classified_properties: "0",
  };
  return {
    totals: {
      properties: count(total.properties),
      searches: count(total.searches),
      analyses: count(total.analyses),
      classifiedProperties: count(total.classified_properties),
    },
    byType: byType.rows.map((row) => ({ label: row.label, count: count(row.count) })),
    byPurpose: byPurpose.rows.map((row) => ({ label: row.label, count: count(row.count) })),
    byLocationQuality: byLocationQuality.rows.map((row) => ({
      label: row.label,
      count: count(row.count),
    })),
    byClassification: byClassification.rows.map((row) => ({ label: row.label, count: count(row.count) })),
    researchers: researchers.rows.map((row) => ({
      userId: row.user_id,
      name: row.name,
      searches: count(row.searches),
    })),
    classifiers: classifiers.rows.map((row) => ({
      userId: row.user_id,
      name: row.name,
      analyses: count(row.analyses),
      classifiedProperties: count(row.classified_properties),
    })),
  };
}

export async function setPenthouseDisposition(input: {
  userId: string;
  propertyId: string;
  link: string;
  disposition: "saved" | "dismissed";
}) {
  await query(
    `
      INSERT INTO tb_penthouse_dispositions (user_id, property_id, canonical_url, disposition)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, property_id, canonical_url) DO UPDATE
      SET disposition = EXCLUDED.disposition,
          created_at = now()
    `,
    [input.userId, input.propertyId, input.link, input.disposition],
  );
}

export async function readRentHistory(limit = 50, userId?: string) {
  const result = await query<{
    search_run_id: string;
    property_id: string;
    listing_id: string;
    title: string;
    source: string;
    link: string;
    neighborhood: string;
    location: string | null;
    property_type: "apartment" | "penthouse" | "unknown" | null;
    price: string | null;
    seen_at: Date;
  }>(
    `
      SELECT *
      FROM (
        SELECT DISTINCT ON (
          sr.property_id,
          lower(trim(sr.listing_snapshot->>'source'))
        )
          sr.search_run_id::text,
          sr.property_id,
          COALESCE(sr.listing_snapshot->>'id', '') AS listing_id,
          COALESCE(sr.listing_snapshot->>'title', 'Imóvel de aluguel') AS title,
          COALESCE(sr.listing_snapshot->>'source', '') AS source,
          COALESCE(sr.listing_snapshot->>'link', '') AS link,
          COALESCE(sr.listing_snapshot->>'neighborhood', '') AS neighborhood,
          COALESCE(NULLIF(sr.listing_snapshot->>'location', ''), property.location) AS location,
          COALESCE(NULLIF(sr.listing_snapshot->>'propertyType', ''), property.property_type) AS property_type,
          sr.listing_snapshot->>'price' AS price,
          sr.seen_at
        FROM tb_search_results sr
        JOIN tb_properties property ON property.id = sr.property_id
        JOIN tb_search_runs run ON run.id = sr.search_run_id
        WHERE sr.listing_snapshot->>'purpose' = 'rent'
          AND ($2::uuid IS NULL OR run.user_id = $2)
          AND ($2::uuid IS NULL OR property.user_id = $2)
        ORDER BY
          sr.property_id,
          lower(trim(sr.listing_snapshot->>'source')),
          sr.seen_at DESC
      ) history
      ORDER BY seen_at DESC
      LIMIT $1
    `,
    [Math.max(1, Math.min(200, limit)), userId ?? null],
  );
  return result.rows.map((row): SuppressedHistoryItem => {
    const price = row.price ? Number(row.price) : undefined;
    return {
      searchRunId: row.search_run_id,
      propertyId: row.property_id,
      listingId: row.listing_id,
      title: row.title,
      source: row.source,
      link: row.link,
      neighborhood: row.neighborhood,
      ...(row.location ? { location: row.location } : {}),
      ...(row.property_type === "apartment" || row.property_type === "penthouse"
        ? { propertyType: row.property_type }
        : {}),
      seenAt: row.seen_at.toISOString(),
      suppressedUntil: row.seen_at.toISOString(),
      analysisId: "",
      slabRights: "not_mentioned",
      balconyBarbecue: "not_mentioned",
      summary: "Imóvel de aluguel encontrado na coleta. A análise de laje e churrasqueira não se aplica ao aluguel.",
      category: "none",
      purpose: "rent",
      ...(Number.isFinite(price) ? { rentAmount: price } : {}),
    };
  });
}

export async function answerAnalysisAmbiguity(input: {
  analysisId: string;
  feature: "slab_rights" | "balcony_barbecue";
  answer: AnalysisReviewAnswer;
}) {
  const analysis = await query<{ result: PropertyFeatureAnalysis; property_id: string; listing_id: string }>(
    "SELECT result, property_id, listing_id FROM tb_property_analyses WHERE id = $1",
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
      INSERT INTO tb_property_analysis_reviews (
        id, analysis_id, slab_rights_answer, balcony_barbecue_answer, answered_at
      )
      VALUES ($1, $2, $3, $4, now())
      ON CONFLICT (analysis_id) DO UPDATE SET
        slab_rights_answer = COALESCE(EXCLUDED.slab_rights_answer, tb_property_analysis_reviews.slab_rights_answer),
        balcony_barbecue_answer = COALESCE(EXCLUDED.balcony_barbecue_answer, tb_property_analysis_reviews.balcony_barbecue_answer),
        answered_at = now()
    `,
    [randomUUID(), input.analysisId, slabAnswer, barbecueAnswer],
  );
  return {
    propertyId: analysis.rows[0].property_id,
    listingId: analysis.rows[0].listing_id,
  };
}

export async function recomputeAiCooldownHistory() {
  await withTransaction(async (client) => {
    await client.query(`
      UPDATE tb_properties p
      SET
        last_researched_at = latest.analyzed_at,
        updated_at = now()
      FROM (
        SELECT property_id, max(analyzed_at) AS analyzed_at
        FROM tb_property_analyses
        GROUP BY property_id
      ) latest
      WHERE latest.property_id = p.id
    `);
    await client.query(`
      UPDATE tb_properties p
      SET last_researched_at = NULL, updated_at = now()
      WHERE NOT EXISTS (
        SELECT 1 FROM tb_property_analyses pa WHERE pa.property_id = p.id
      )
    `);
    await client.query(`
      UPDATE tb_search_results sr
      SET
        eligible_for_research = NOT EXISTS (
          SELECT 1
          FROM tb_property_analyses pa
          WHERE pa.property_id = sr.property_id
            AND pa.purpose = COALESCE(sr.listing_snapshot->>'purpose', 'sale')
            AND pa.analyzed_at <= sr.seen_at
            AND pa.valid_until > sr.seen_at
        ),
        suppressed_until = (
          SELECT max(pa.valid_until)
          FROM tb_property_analyses pa
          WHERE pa.property_id = sr.property_id
            AND pa.purpose = COALESCE(sr.listing_snapshot->>'purpose', 'sale')
            AND pa.analyzed_at <= sr.seen_at
            AND pa.valid_until > sr.seen_at
        )
    `);
    await client.query(`
      UPDATE tb_search_runs run
      SET
        eligible_count = totals.eligible_count,
        suppressed_count = totals.suppressed_count
      FROM (
        SELECT
          search_run_id,
          count(*) FILTER (WHERE eligible_for_research)::integer AS eligible_count,
          count(*) FILTER (WHERE NOT eligible_for_research)::integer AS suppressed_count
        FROM tb_search_results
        GROUP BY search_run_id
      ) totals
      WHERE totals.search_run_id = run.id
    `);
  });
}
