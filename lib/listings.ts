export type Priority = "Alta" | "Média" | "Baixa";

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
