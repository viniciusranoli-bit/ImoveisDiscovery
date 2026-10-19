import type { CollectedListing, ListingPurpose, PropertyType } from "./listings";

/** Modelo de negÃ³cio: alugar ou comprar. */
export function purposeLabel(purpose: ListingPurpose) {
  return purpose === "rent" ? "Aluguel" : "Compra";
}

export function purposeVerb(purpose: ListingPurpose) {
  return purpose === "rent" ? "Alugar" : "Comprar";
}

/** Tipo fÃ­sico do imÃ³vel â€” somente cobertura ou apartamento. */
export function isPenthouseType(propertyType?: PropertyType | "unknown") {
  return propertyType === "penthouse";
}

export function propertyTypeLabel(propertyType?: PropertyType | "unknown") {
  return isPenthouseType(propertyType) ? "Cobertura" : "Apartamento";
}

/** RÃ³tulo curto dos tipos escolhidos na pesquisa (Apartamento, Cobertura ou ambos). */
export function propertyTypesFilterLabel(propertyTypes?: PropertyType[]) {
  const types = [...new Set(propertyTypes ?? [])];
  const hasApartment = types.includes("apartment");
  const hasPenthouse = types.includes("penthouse");
  if (hasApartment && hasPenthouse) return "Apartamento e cobertura";
  if (hasPenthouse) return "Cobertura";
  if (hasApartment) return "Apartamento";
  return "Tipo nÃ£o definido";
}

/** IA de laje/churrasqueira: sÃ³ apartamento em compra. */
export function supportsSlabFeatureAnalysis(listing: Pick<CollectedListing, "purpose" | "propertyType">) {
  return listing.purpose === "sale" && !isPenthouseType(listing.propertyType);
}

export function listingActionsHint(listing: Pick<CollectedListing, "purpose" | "propertyType">) {
  if (isPenthouseType(listing.propertyType)) {
    return "Cobertura Â· favorito ou descartar. A IA nÃ£o se aplica a este tipo.";
  }
  if (listing.purpose === "rent") {
    return "Apartamento para aluguel Â· favorito ou descartar. A IA nÃ£o se aplica ao modelo alugar.";
  }
  return "";
}

