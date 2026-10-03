export type MapProperty = {
  id: string;
  title: string;
  location: string;
  neighborhood: string;
  link: string;
  source: string;
  purpose: "rent" | "sale";
  price?: number;
  propertyType?: "apartment" | "penthouse" | "unknown";
};

export function hasMapAddress(location?: string) {
  if (!location?.trim()) return false;
  const normalized = location.trim().toLowerCase();
  if (normalized.includes("não informado") || normalized.includes("nao informado")) return false;
  if (normalized === "endereço não informado") return false;
  return normalized.length >= 4;
}

export function hasPreciseMapAddress(
  property: Pick<MapProperty, "location" | "neighborhood">,
) {
  if (!hasMapAddress(property.location)) return false;
  const neighborhood = property.neighborhood?.trim().toLowerCase();
  if (neighborhood && property.location!.trim().toLowerCase() === neighborhood) return false;
  return true;
}

export function hasMappableLocation(property: Pick<MapProperty, "location" | "neighborhood">) {
  if (hasMapAddress(property.location)) return true;
  const neighborhood = property.neighborhood?.trim();
  return Boolean(neighborhood && neighborhood.length >= 3);
}

export function buildGeocodeQuery(property: Pick<MapProperty, "location" | "neighborhood">) {
  const neighborhood = property.neighborhood?.trim() || "Botafogo";
  if (hasPreciseMapAddress(property)) {
    return `${property.location!.trim()}, ${neighborhood}, Rio de Janeiro, RJ, Brasil`;
  }
  return `${neighborhood}, Rio de Janeiro, RJ, Brasil`;
}

export function isApproximateMapLocation(property: Pick<MapProperty, "location" | "neighborhood">) {
  return !hasPreciseMapAddress(property) && hasMappableLocation(property);
}

export function normalizeStreet(location: string) {
  return location
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/^r\.?\s+/, "rua ")
    .replace(/^av\.?\s+/, "avenida ")
    .replace(/\s+\d+[\w/-]*$/, "")
    .replace(/,\s*\d+.*$/, "")
    .replace(/\s+/g, " ");
}

export function streetGroupKey(property: Pick<MapProperty, "location" | "neighborhood">) {
  return `${property.neighborhood.trim().toLowerCase()}|${normalizeStreet(property.location)}`;
}

export type GeocodedProperty = MapProperty & {
  lat: number;
  lng: number;
  approximate?: boolean;
};


export type MapStreetGroup = {
  streetKey: string;
  label: string;
  lat: number;
  lng: number;
  count: number;
  items: GeocodedProperty[];
};

export function groupGeocodedProperties(items: GeocodedProperty[]): MapStreetGroup[] {
  const groups = new Map<string, GeocodedProperty[]>();
  for (const item of items) {
    const key = streetGroupKey(item);
    const bucket = groups.get(key) ?? [];
    bucket.push(item);
    groups.set(key, bucket);
  }
  return [...groups.entries()].map(([streetKey, bucket]) => {
    const lat = bucket.reduce((sum, item) => sum + item.lat, 0) / bucket.length;
    const lng = bucket.reduce((sum, item) => sum + item.lng, 0) / bucket.length;
    const street = normalizeStreet(bucket[0]!.location);
    const placeLabel = street
      ? `${street} · ${bucket[0]!.neighborhood}`
      : `${bucket[0]!.neighborhood} (aproximado)`;
    const label = bucket.length > 1 ? `${placeLabel} (${bucket.length})` : placeLabel;
    return {
      streetKey,
      label,
      lat,
      lng,
      count: bucket.length,
      items: bucket.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity)),
    };
  });
}
