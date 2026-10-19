import {
  matchesSearchFilters,
  normalizeSearchFilters,
  type CollectedListing,
  type ListingPurpose,
  type PropertyType,
  type SearchFilters,
} from "../listings";
import type { PropertyFeatureAnalysis } from "../property-analysis";

export type SaleApartmentCategory =
  | "slab_rights"
  | "balcony_barbecue"
  | "both"
  | "ambiguous"
  | "none";

export type WhatsAppAlertRuleConfig = {
  name: string;
  purpose: "rent" | "sale" | "both";
  propertyTypes: PropertyType[];
  priceMin?: number;
  priceMax?: number;
  bedroomsMin?: number;
  parkingMin?: number;
  locationStatuses: Array<"confirmed" | "unknown">;
  /** Categorias de IA aceitas para apartamento em compra. Vazio = não exige IA. */
  saleApartmentCategories: SaleApartmentCategory[];
  notifyPhonesE164: string[];
  cooldownMinutes: number;
};

export type WhatsAppAlertRule = {
  id: string;
  name: string;
  enabled: boolean;
  config: WhatsAppAlertRuleConfig;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export function normalizeAlertRuleConfig(input: Partial<WhatsAppAlertRuleConfig>): WhatsAppAlertRuleConfig {
  const propertyTypes = (input.propertyTypes ?? ["apartment", "penthouse"]).filter(
    (item): item is PropertyType => item === "apartment" || item === "penthouse",
  );
  const phones = (input.notifyPhonesE164 ?? [])
    .map((phone) => phone.replace(/\D/g, ""))
    .filter((phone) => phone.length >= 10);
  return {
    name: (input.name ?? "Alerta").trim().slice(0, 120) || "Alerta",
    purpose: input.purpose === "rent" || input.purpose === "sale" ? input.purpose : "both",
    propertyTypes: propertyTypes.length ? propertyTypes : ["apartment", "penthouse"],
    priceMin: input.priceMin,
    priceMax: input.priceMax,
    bedroomsMin: input.bedroomsMin,
    parkingMin: input.parkingMin,
    locationStatuses:
      input.locationStatuses?.length === 1
        ? input.locationStatuses
        : input.locationStatuses?.length
          ? input.locationStatuses
          : ["confirmed"],
    saleApartmentCategories: input.saleApartmentCategories ?? [],
    notifyPhonesE164: [...new Set(phones)],
    cooldownMinutes: Math.min(Math.max(input.cooldownMinutes ?? 1440, 0), 60 * 24 * 30),
  };
}

export function saleApartmentCategory(analysis?: PropertyFeatureAnalysis | null): SaleApartmentCategory {
  if (!analysis) return "none";
  const hasSlab = ["document_claimed", "mentioned_unverified"].includes(analysis.slabRights);
  const hasBbq = analysis.balconyBarbecue === "explicit";
  if (analysis.slabRights === "ambiguous" || analysis.balconyBarbecue === "ambiguous") {
    return "ambiguous";
  }
  if (hasSlab && hasBbq) return "both";
  if (hasSlab) return "slab_rights";
  if (hasBbq) return "balcony_barbecue";
  return "none";
}

function ruleSearchFilters(config: WhatsAppAlertRuleConfig, listingPurpose: ListingPurpose): SearchFilters | null {
  if (config.purpose !== "both" && config.purpose !== listingPurpose) return null;
  return normalizeSearchFilters({
    purpose: listingPurpose,
    priceMin: config.priceMin,
    priceMax: config.priceMax,
    bedroomsMin: config.bedroomsMin ?? 2,
    parkingMin: config.parkingMin ?? 1,
    propertyTypes: config.propertyTypes,
  });
}

export function listingMatchesAlertRule(input: {
  listing: CollectedListing;
  analysis?: PropertyFeatureAnalysis | null;
  rule: WhatsAppAlertRuleConfig;
  requireAnalysis: boolean;
}) {
  const { listing, analysis, rule, requireAnalysis } = input;
  if (listing.locationStatus === "excluded") return false;
  const allowedLocation = rule.locationStatuses.includes(listing.locationStatus ?? "unknown");
  if (!allowedLocation && listing.locationStatus !== undefined) return false;
  if (listing.locationStatus === undefined && !rule.locationStatuses.includes("unknown")) {
    return false;
  }

  const filters = ruleSearchFilters(rule, listing.purpose);
  if (!filters) return false;
  if (!matchesSearchFilters(listing, filters)) return false;

  if (listing.propertyType === "penthouse") {
    return rule.propertyTypes.includes("penthouse");
  }
  if (listing.propertyType === "apartment" && listing.purpose === "sale") {
    if (!rule.propertyTypes.includes("apartment")) return false;
    if (rule.saleApartmentCategories.length === 0) return true;
    if (requireAnalysis && !analysis) return false;
    const category = saleApartmentCategory(analysis);
    if (category === "none") return false;
    return rule.saleApartmentCategories.includes(category);
  }
  return listing.propertyType === "apartment" && rule.propertyTypes.includes("apartment");
}

export function buildAlertMessage(listing: CollectedListing, analysis?: PropertyFeatureAnalysis | null) {
  const purpose = listing.purpose === "rent" ? "Aluguel" : "Compra";
  const type = listing.propertyType === "penthouse" ? "Cobertura" : "Apartamento";
  const price =
    listing.price !== undefined
      ? listing.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : "Preço não informado";
  const category =
    listing.propertyType === "apartment" && listing.purpose === "sale"
      ? saleApartmentCategory(analysis)
      : null;
  const categoryLabel =
    category === "both"
      ? "Laje e churrasqueira"
      : category === "slab_rights"
        ? "Com laje"
        : category === "balcony_barbecue"
          ? "Com churrasqueira"
          : category === "ambiguous"
            ? "Análise ambígua"
            : "";
  const lines = [
    "Novo imóvel no radar",
    `${purpose} · ${type}`,
    `${listing.title}`,
    `${listing.neighborhood} · ${price}`,
    categoryLabel ? `IA: ${categoryLabel}` : "",
    listing.link,
    "Confira requisitos obrigatórios no anúncio antes de decidir.",
  ].filter(Boolean);
  return lines.join("\n").slice(0, 1500);
}

export function alertIdempotencyKey(ruleId: string, propertyId: string) {
  return `${ruleId}:${propertyId}:new_listing`;
}
