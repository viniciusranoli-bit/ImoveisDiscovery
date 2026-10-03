import type { CollectedListing } from "@/lib/listings";
import { hasMappableLocation, type MapProperty } from "@/lib/map/street-group";

type HistoryLike = {
  listingId: string;
  title: string;
  location?: string;
  neighborhood: string;
  link: string;
  source: string;
  purpose: "rent" | "sale";
  rentAmount?: number;
  propertyType?: "apartment" | "penthouse";
};

export function listingToMapProperty(listing: CollectedListing): MapProperty {
  return {
    id: listing.id,
    title: listing.title,
    location: listing.location ?? "",
    neighborhood: listing.neighborhood,
    link: listing.link,
    source: listing.source,
    purpose: listing.purpose,
    price: listing.price,
    propertyType: listing.propertyType,
  };
}

export function historyToMapProperty(item: HistoryLike): MapProperty {
  return {
    id: item.listingId || item.link,
    title: item.title,
    location: item.location ?? "",
    neighborhood: item.neighborhood,
    link: item.link,
    source: item.source,
    purpose: item.purpose,
    price: item.rentAmount,
    propertyType: item.propertyType,
  };
}

export function mergeMapProperties(lists: MapProperty[][]) {
  const merged = new Map<string, MapProperty>();
  for (const list of lists) {
    for (const property of list) {
      if (!hasMappableLocation(property)) continue;
      merged.set(property.link, property);
    }
  }
  return [...merged.values()];
}
