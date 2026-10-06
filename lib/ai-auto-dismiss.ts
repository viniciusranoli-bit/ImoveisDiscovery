import type { CollectedListing } from "@/lib/listings";

/** Aluguel acima deste valor é descartado automaticamente (apto ou cobertura). */
export const AI_AUTO_DISMISS_RENT_PRICE_ABOVE = 11_000;

export type AiDismissReason = "price" | "features";

export function shouldAutoDismissByPrice(listing: CollectedListing) {
  if (listing.purpose !== "rent") return false;
  if (listing.price === undefined || !Number.isFinite(listing.price)) return false;
  return listing.price > AI_AUTO_DISMISS_RENT_PRICE_ABOVE;
}

export function aiDismissSummary(reason: AiDismissReason) {
  if (reason === "price") {
    return `Descartado por IA: valor acima de R$ ${AI_AUTO_DISMISS_RENT_PRICE_ABOVE.toLocaleString("pt-BR")}.`;
  }
  return "Descartado por IA: sem laje e sem churrasqueira no anúncio.";
}

export function readAiDismissReason(
  listing: CollectedListing & { aiDismissReason?: AiDismissReason },
): AiDismissReason | undefined {
  return listing.aiDismissReason === "price" || listing.aiDismissReason === "features"
    ? listing.aiDismissReason
    : undefined;
}
