import { southZoneNeighborhoods } from "@/lib/neighborhoods";

/** Centros aproximados dos bairros da Zona Sul (fallback imediato no mapa). */
const centroids: Record<string, { lat: number; lng: number }> = {
  Botafogo: { lat: -22.9515, lng: -43.1863 },
  Catete: { lat: -22.9258, lng: -43.1765 },
  Copacabana: { lat: -22.9711, lng: -43.1823 },
  "Cosme Velho": { lat: -22.9289, lng: -43.1842 },
  Flamengo: { lat: -22.9338, lng: -43.1785 },
  Gávea: { lat: -22.978, lng: -43.2297 },
  Glória: { lat: -22.9219, lng: -43.1767 },
  Humaitá: { lat: -22.9576, lng: -43.203 },
  Ipanema: { lat: -22.9838, lng: -43.2049 },
  "Jardim Botânico": { lat: -22.9673, lng: -43.2247 },
  Lagoa: { lat: -22.975, lng: -43.21 },
  Laranjeiras: { lat: -22.9345, lng: -43.188 },
  Leblon: { lat: -22.987, lng: -43.2237 },
  Leme: { lat: -22.9625, lng: -43.1697 },
  "São Conrado": { lat: -22.9995, lng: -43.2585 },
  Urca: { lat: -22.9559, lng: -43.1631 },
};

export function neighborhoodCentroid(neighborhood: string) {
  const trimmed = neighborhood.trim();
  if (centroids[trimmed]) return centroids[trimmed];
  const match = southZoneNeighborhoods.find(
    (item) => item.toLowerCase() === trimmed.toLowerCase(),
  );
  if (match && centroids[match]) return centroids[match];
  return centroids.Botafogo;
}
