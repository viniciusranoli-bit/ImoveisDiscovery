export const southZoneNeighborhoods = [
  "Botafogo",
  "Catete",
  "Copacabana",
  "Cosme Velho",
  "Flamengo",
  "Gávea",
  "Glória",
  "Humaitá",
  "Ipanema",
  "Jardim Botânico",
  "Lagoa",
  "Laranjeiras",
  "Leblon",
  "Leme",
  "São Conrado",
  "Urca",
] as const;

export function normalizeNeighborhoods(input: unknown) {
  const values = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(",")
      : [];
  const selected = new Set(
    values
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean),
  );
  return southZoneNeighborhoods.filter((item) => selected.has(item));
}

export function neighborhoodLabel(neighborhoods: string[]) {
  if (neighborhoods.length <= 3) return neighborhoods.join(", ");
  return `${neighborhoods.slice(0, 2).join(", ")} e mais ${neighborhoods.length - 2}`;
}
