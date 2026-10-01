import { createHash } from "node:crypto";
import type {
  CollectedListing,
  PropertyType,
  SearchFilters,
} from "../listings";

export type LinkCandidate = {
  href: string;
  text: string;
  ariaLabel?: string;
};

const numberFrom = (value?: string) =>
  value ? Number(value.replace(/\./g, "").replace(",", ".")) : undefined;

function firstMatch(content: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

function propertyTypeFrom(content: string): PropertyType | "unknown" {
  if (/\b(cobertura|penthouse)\b/i.test(content)) return "penthouse";
  if (/\b(apartamento|apto)\b/i.test(content)) return "apartment";
  return "unknown";
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeSpacedNumbers(value: string) {
  let normalized = value;
  for (let index = 0; index < 2; index += 1) {
    normalized = normalized.replace(/(\d)\s*([.,])\s*(\d)/g, "$1$2$3");
  }
  return normalized;
}

export function parseListingCandidate(input: {
  candidate: LinkCandidate;
  source: string;
  searchUrl: string;
  neighborhood?: string;
  neighborhoods?: string[];
  filters: SearchFilters;
  collectedAt: string;
}): CollectedListing | null {
  const { candidate, source, searchUrl, filters, collectedAt } = input;
  const acceptedNeighborhoods = input.neighborhoods?.length
    ? input.neighborhoods
    : [input.neighborhood ?? ""];
  const text = cleanText([candidate.text, candidate.ariaLabel].filter(Boolean).join(" "));
  let decodedHref = candidate.href;
  try {
    decodedHref = decodeURIComponent(candidate.href);
  } catch {
    // URLs parcialmente codificadas continuam utilizáveis como evidência.
  }
  const content = normalizeSpacedNumbers(`${decodedHref} ${text}`);
  const contentKey = content.toLocaleLowerCase("pt-BR");
  const neighborhood = acceptedNeighborhoods.find((item) =>
    contentKey.includes(item.toLocaleLowerCase("pt-BR")),
  );
  if (!neighborhood) return null;
  const propertyType = propertyTypeFrom(content);
  const purposePricePattern =
    filters.purpose === "rent"
      ? /(?:aluguel|locação)\s*:?\s*R\$\s*([\d.]+(?:,\d{1,2})?)/i
      : /(?:venda|preço)\s*:?\s*R\$\s*([\d.]+(?:,\d{1,2})?)/i;
  const pricePatterns = [
    /-R[S$](\d+)-id-/i,
    ...(/\btotal\s*R\$/i.test(content) ? [purposePricePattern] : []),
    /\bR\$\s*([\d.]+(?:,\d{1,2})?)/i,
    purposePricePattern,
    /(?:preço|valor)\D{0,12}([\d.]+(?:,\d{1,2})?)/i,
    /"price"\s*:\s*"?([\d.]+(?:,\d{1,2})?)/i,
  ];
  const price = numberFrom(
    firstMatch(content, pricePatterns),
  );
  const bedrooms = numberFrom(
    firstMatch(content, [
      /-(\d+)-quartos?-/i,
      /\b(\d+)\s*(?:quartos?|dormitórios?)\b/i,
      /"(?:numberOfRooms|numberOfBedrooms)"\s*:\s*"?(\d+)/i,
    ]),
  );
  const parkingSpaces = numberFrom(
    firstMatch(content, [
      /(?:quantidade de vagas de garagem|vagas? de garagem|garagens?)\D{0,8}(\d+)/i,
      /\b(\d+)\s*vagas?\b/i,
    ]),
  );
  const areaM2 = numberFrom(
    firstMatch(content, [
      /-(\d+)m2(?:-|\/|\?)/i,
      /\b(\d+(?:[.,]\d+)?)\s*m[²2]\b/i,
    ]),
  );
  const externalId =
    firstMatch(candidate.href, [
      /-id-(\d+)/i,
      /\/imovel\/(\d+)/i,
      /\/propriedades\/[^/?]*?(\d{6,})\.html/i,
      /[?&](?:id|listingId)=(\d+)/i,
    ]) ?? createHash("sha1").update(candidate.href).digest("hex").slice(0, 16);

  if (!candidate.href.startsWith("http") || (!price && !bedrooms && !areaM2)) return null;

  const typeLabel =
    propertyType === "penthouse"
      ? "Cobertura"
      : propertyType === "apartment"
        ? "Apartamento"
        : "Imóvel";
  const title = [
    typeLabel,
    bedrooms !== undefined ? `${bedrooms} quartos` : undefined,
    areaM2 !== undefined ? `${areaM2} m²` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    id: `${source}:${externalId}`,
    title,
    purpose: filters.purpose,
    propertyType,
    ...(price !== undefined ? { price } : {}),
    ...(bedrooms !== undefined ? { bedrooms } : {}),
    ...(parkingSpaces !== undefined ? { parkingSpaces } : {}),
    ...(areaM2 !== undefined ? { areaM2 } : {}),
    neighborhood,
    link: candidate.href,
    source,
    sources: [source],
    sourceSearchUrl: searchUrl,
    collectedAt,
    evidence: text ? [text.slice(0, 1_000)] : [candidate.href],
  };
}
