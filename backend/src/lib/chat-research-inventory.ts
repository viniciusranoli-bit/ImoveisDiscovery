import type { CollectedListing } from "./listings";

export const CHAT_INVENTORY_MAX = 200;
export const CHAT_LINK_MAX = 500;

export type ChatListingSummary = {
  title: string;
  neighborhood?: string;
  purpose?: "rent" | "sale";
  propertyType?: "apartment" | "penthouse" | "unknown";
  price?: number;
  bedrooms?: number;
  parkingSpaces?: number;
  locationStatus?: "confirmed" | "unknown" | "excluded";
  link?: string;
  location?: string;
  source?: string;
};

export function listingToChatSummary(listing: CollectedListing): ChatListingSummary {
  return {
    title: listing.title.slice(0, 300),
    neighborhood: listing.neighborhood,
    purpose: listing.purpose,
    propertyType: listing.propertyType,
    price: listing.price,
    bedrooms: listing.bedrooms,
    parkingSpaces: listing.parkingSpaces,
    locationStatus: listing.locationStatus,
    link: listing.link.slice(0, CHAT_LINK_MAX),
    location: listing.location?.slice(0, 200),
    source: listing.source,
  };
}

export function buildChatInventorySummaries(listings: CollectedListing[]) {
  return listings.slice(0, CHAT_INVENTORY_MAX).map(listingToChatSummary);
}
