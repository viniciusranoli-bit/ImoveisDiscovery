export type Priority = "Alta" | "Média" | "Baixa";
export type ListingPurpose = "rent" | "sale";
export type PropertyType = "apartment" | "penthouse";

export type SearchFilters = {
  purpose: ListingPurpose;
  priceMin?: number;
  priceMax?: number;
  bedroomsMin: number;
  parkingMin: number;
  propertyTypes: PropertyType[];
};

export type CollectedListing = {
  id: string;
  title: string;
  purpose: ListingPurpose;
  propertyType: PropertyType | "unknown";
  price?: number;
  bedrooms?: number;
  parkingSpaces?: number;
  areaM2?: number;
  location?: string;
  neighborhood: string;
  link: string;
  source: string;
  sources: string[];
  sourceSearchUrl: string;
  collectedAt: string;
  evidence: string[];
};

export type SourceCollectionStatus = {
  source: string;
  searchUrl: string;
  status: "ok" | "blocked" | "empty" | "error";
  httpStatus?: number;
  found: number;
  message?: string;
  durationMs: number;
};

export type MultiPortalRun = {
  id: string;
  collectionId: string;
  collectedAt: string;
  filters: SearchFilters;
  listings: CollectedListing[];
  sources: SourceCollectionStatus[];
  totalCollected?: number;
  suppressedCount?: number;
};

export type Listing = {
  id: string;
  title: string;
  platform: string;
  link: string;
  location: string;
  neighborhood: string;
  consultedAt: string;
  publishedAt?: string;
  rent?: number;
  condo?: number;
  iptu?: number;
  totalMonthly?: number;
  areaM2?: number;
  bedrooms?: number;
  bathrooms?: number;
  parkingSpaces?: number;
  parkingType: string;
  furnished?: boolean;
  barbecueBalcony?: boolean;
  isPenthouse?: boolean;
  walkToWorkMin?: number;
  walkToWorkSource?: string;
  metroStation?: string;
  walkToMetroMin?: number;
  available: boolean;
  priority: Priority;
  score: number;
  scoreReasons: string[];
  alerts: string[];
  evidence: string[];
};

export type SearchRun = {
  id: string;
  searchedAt: string;
  requestedCount: number;
  listings: Listing[];
  rejectedPenthouses: Listing[];
};

export type SerperResult = {
  title?: string;
  url?: string;
  link?: string;
  snippet?: string;
};

export type SerperCollection = {
  id: string;
  collectedAt: string;
  city: "Rio de Janeiro";
  neighborhood: string;
  query: string;
  filters?: SearchFilters;
  results: SerperResult[];
  rawResponse: unknown;
};

export type RawListing = Omit<Listing, "id" | "consultedAt" | "priority" | "score" | "scoreReasons" | "alerts"> & {
  alerts?: string[];
};

const normalizeUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "gclid"].forEach((key) =>
      parsed.searchParams.delete(key),
    );
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url.trim();
  }
};

export function propertyIdentityKey(listing: CollectedListing) {
  const externalId = listing.id.split(":").slice(1).join(":");
  if (/^\d{6,}$/.test(externalId)) {
    return [
      "external",
      externalId,
      listing.neighborhood.toLocaleLowerCase("pt-BR"),
      listing.propertyType,
      listing.areaM2 ?? "",
      listing.bedrooms ?? "",
      listing.parkingSpaces ?? "",
    ].join("|");
  }
  try {
    const url = new URL(listing.link);
    return `url|${url.hostname.replace(/^www\./, "").toLowerCase()}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return `listing|${listing.id}`;
  }
}

export function isEligible(listing: Pick<Listing, "bedrooms" | "parkingSpaces" | "link" | "available">) {
  return Boolean(
    listing.available &&
      listing.link.startsWith("http") &&
      (listing.bedrooms ?? 0) >= 2 &&
      (listing.parkingSpaces ?? 0) >= 1,
  );
}

export function scoreListing(input: RawListing): Listing {
  const alerts = [...(input.alerts ?? [])];
  const reasons: string[] = [];
  let score = 35;
  let priority: Priority = "Baixa";

  if (input.walkToWorkMin !== undefined) {
    if (input.walkToWorkMin <= 20) {
      score += 35;
      priority = "Alta";
      reasons.push(`${input.walkToWorkMin} min a pé até a Praia de Botafogo, 501`);
    } else if (input.walkToWorkMin <= 35) {
      score += 18;
      priority = "Média";
      reasons.push(`${input.walkToWorkMin} min a pé até o trabalho`);
    } else {
      alerts.push("Caminhada ao trabalho acima da faixa prioritária.");
    }
  } else {
    alerts.push("Tempo de caminhada ao trabalho não informado.");
  }

  if (input.walkToMetroMin !== undefined && input.walkToMetroMin <= 10) {
    score += 20;
    reasons.push(`${input.walkToMetroMin} min a pé até ${input.metroStation ?? "o metrô"}`);
    if (priority === "Baixa") priority = "Média";
  } else if (priority === "Baixa") {
    alerts.push("Proximidade do metrô não confirmada.");
  }

  if (input.totalMonthly !== undefined) {
    if (input.totalMonthly <= 12000) {
      score += 10;
      reasons.push(`Custo total dentro do teto de R$ 12.000`);
    } else {
      score -= 15;
      alerts.push("Custo mensal acima do teto de R$ 12.000.");
    }
  } else {
    alerts.push("Custo mensal total não informado.");
  }

  if (input.barbecueBalcony) {
    score += 8;
    reasons.push("Varanda com churrasqueira");
  }
  if (/rotativa|não informado/i.test(input.parkingType)) {
    score -= 8;
    alerts.push(`Vaga ${input.parkingType.toLowerCase()}: confirmar condição.`);
  }
  if (!input.available) alerts.push("Disponibilidade não confirmada.");

  return {
    ...input,
    id: normalizeUrl(input.link),
    link: normalizeUrl(input.link),
    consultedAt: new Date().toISOString(),
    totalMonthly:
      input.rent !== undefined && input.condo !== undefined && input.iptu !== undefined
        ? input.rent + input.condo + input.iptu
        : input.totalMonthly,
    priority,
    score: Math.max(0, Math.min(100, score)),
    scoreReasons: reasons,
    alerts: [...new Set(alerts)],
  };
}

export function deduplicate(listings: Listing[]) {
  const seen = new Set<string>();
  return listings.filter((listing) => {
    const key = `${normalizeUrl(listing.link)}|${listing.location.toLowerCase()}|${listing.rent ?? ""}|${listing.areaM2 ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const defaultSearchFilters: SearchFilters = {
  purpose: "rent",
  bedroomsMin: 2,
  parkingMin: 1,
  propertyTypes: ["apartment", "penthouse"],
};

export function normalizeSearchFilters(input: Partial<SearchFilters>): SearchFilters {
  const finiteNonNegative = (value: unknown) => {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : undefined;
  };
  const purpose = input.purpose === "sale" ? "sale" : "rent";
  const requestedTypes = Array.isArray(input.propertyTypes)
    ? input.propertyTypes.filter(
        (item): item is PropertyType => item === "apartment" || item === "penthouse",
      )
    : [];
  const priceMin = finiteNonNegative(input.priceMin);
  const priceMax = finiteNonNegative(input.priceMax);

  return {
    purpose,
    ...(priceMin !== undefined ? { priceMin } : {}),
    ...(priceMax !== undefined ? { priceMax } : {}),
    bedroomsMin: Math.max(0, Math.floor(finiteNonNegative(input.bedroomsMin) ?? 2)),
    parkingMin: Math.max(0, Math.floor(finiteNonNegative(input.parkingMin) ?? 1)),
    propertyTypes: requestedTypes.length ? [...new Set(requestedTypes)] : ["apartment", "penthouse"],
  };
}

export function matchesSearchFilters(listing: CollectedListing, filters: SearchFilters) {
  if (listing.purpose !== filters.purpose) return false;
  if (listing.price === undefined) return false;
  if (filters.priceMin !== undefined && listing.price < filters.priceMin) return false;
  if (filters.priceMax !== undefined && listing.price > filters.priceMax) return false;
  if ((listing.bedrooms ?? -1) < filters.bedroomsMin) return false;
  if ((listing.parkingSpaces ?? -1) < filters.parkingMin) return false;
  return listing.propertyType !== "unknown" && filters.propertyTypes.includes(listing.propertyType);
}

export function deduplicateCollectedListings(listings: CollectedListing[]) {
  const unique = new Map<string, CollectedListing>();
  for (const listing of listings) {
    const externalId = listing.id.split(":").slice(1).join(":");
    const key = /^\d{6,}$/.test(externalId)
      ? [
          "external",
          externalId,
          listing.propertyType,
          listing.price ?? "",
          listing.areaM2 ?? "",
        ].join("|")
      : normalizeUrl(listing.link);
    const current = unique.get(key);
    if (!current) {
      unique.set(key, listing);
      continue;
    }
    unique.set(key, {
      ...current,
      sources: [...new Set([...current.sources, ...listing.sources])],
      evidence: [...new Set([...current.evidence, ...listing.evidence])],
    });
  }
  return [...unique.values()];
}
