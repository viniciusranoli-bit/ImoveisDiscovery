"use client";

import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import { propertyTypeLabel, purposeLabel } from "@/lib/listing-labels";
import type { GeocodedProperty, MapProperty, MapStreetGroup } from "@/lib/map/street-group";
import "leaflet/dist/leaflet.css";

const currency = (value?: number) =>
  value === undefined
    ? "Não informado"
    : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type GeocodeResponse = {
  groups: MapStreetGroup[];
  markers?: GeocodedProperty[];
  mappedCount: number;
  skippedCount: number;
  inputCount: number;
  pendingLiveGeocode?: number;
  error?: string;
};

function markerKind(propertyType?: MapProperty["propertyType"]) {
  return propertyType === "penthouse" ? "penthouse" : "apartment";
}

function propertyMarkerIcon(
  propertyType?: MapProperty["propertyType"],
  approximate?: boolean,
  favorite?: boolean,
) {
  const kind = markerKind(propertyType);
  return L.divIcon({
    className: `map-marker-pin map-marker-pin--${kind}${approximate ? " map-marker-pin--approx" : ""}`,
    html: `<span class="map-marker-dot" aria-hidden="true"></span>${
      favorite ? '<span class="map-marker-star" aria-label="Favorito">★</span>' : ""
    }`,
    iconSize: favorite ? [28, 30] : [18, 18],
    iconAnchor: favorite ? [14, 15] : [9, 9],
  });
}

function groupMarkerIcon(count: number, dominant: "apartment" | "penthouse" | "mixed") {
  return L.divIcon({
    className: `map-marker-pin map-marker-pin--group map-marker-pin--${dominant}`,
    html: `<span aria-hidden="true">${count}</span>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

function offsetCoordinate(lat: number, lng: number, index: number): [number, number] {
  if (index === 0) return [lat, lng];
  const angle = (index * 137.5 * Math.PI) / 180;
  const meters = 6 + index * 4;
  const dLat = (meters / 111_111) * Math.cos(angle);
  const dLng = (meters / (111_111 * Math.cos((lat * Math.PI) / 180))) * Math.sin(angle);
  return [lat + dLat, lng + dLng];
}

function FitBounds({ points }: { points: Array<{ lat: number; lng: number }> }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    const bounds = L.latLngBounds(points.map((point) => [point.lat, point.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16 });
  }, [points, map]);
  return null;
}

function MapResizeFix() {
  const map = useMap();
  useEffect(() => {
    const resize = () => map.invalidateSize();
    resize();
    const timer = window.setTimeout(resize, 120);
    window.addEventListener("resize", resize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", resize);
    };
  }, [map]);
  return null;
}

type PropertyMapProps = {
  properties: MapProperty[];
  favoriteLinks: string[];
  onClassify: (property: MapProperty) => void;
  onToggleFavorite: (property: MapProperty) => void;
  onDismiss: (property: MapProperty) => void;
};

export function PropertyMap({
  properties,
  favoriteLinks,
  onClassify,
  onToggleFavorite,
  onDismiss,
}: PropertyMapProps) {
  const [groups, setGroups] = useState<MapStreetGroup[]>([]);
  const [markers, setMarkers] = useState<GeocodedProperty[]>([]);
  const [meta, setMeta] = useState<Omit<GeocodeResponse, "groups" | "markers">>({
    mappedCount: 0,
    skippedCount: 0,
    inputCount: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<MapStreetGroup | null>(null);
  const [selectedItem, setSelectedItem] = useState<MapProperty | null>(null);
  const [viewMode, setViewMode] = useState<"properties" | "streets">("properties");

  const propertyKey = useMemo(
    () => properties.map((item) => item.link).sort().join("|"),
    [properties],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!properties.length) {
        setGroups([]);
        setMarkers([]);
        setMeta({ mappedCount: 0, skippedCount: 0, inputCount: 0 });
        setSelectedGroup(null);
        setSelectedItem(null);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/map/geocode", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ properties }),
        });
        const data = (await response.json()) as GeocodeResponse;
        if (!response.ok) {
          throw new Error(data.error ?? "Não foi possível carregar o mapa.");
        }
        if (cancelled) return;
        setGroups(data.groups);
        setMarkers(data.markers ?? data.groups.flatMap((group) => group.items));
        setMeta({
          mappedCount: data.mappedCount,
          skippedCount: data.skippedCount,
          inputCount: data.inputCount,
          pendingLiveGeocode: data.pendingLiveGeocode,
        });
        setSelectedGroup(null);
        setSelectedItem(null);
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error ? requestError.message : "Não foi possível carregar o mapa.",
          );
          setGroups([]);
          setMarkers([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [propertyKey, properties]);

  const center = useMemo((): [number, number] => [-22.9519, -43.1823], []);
  const fitPoints = useMemo(
    () => (viewMode === "properties" ? markers : groups.map((g) => ({ lat: g.lat, lng: g.lng }))),
    [groups, markers, viewMode],
  );

  function selectProperty(item: GeocodedProperty) {
    setSelectedItem(item);
    const group = groups.find((candidate) =>
      candidate.items.some((entry) => entry.link === item.link),
    );
    setSelectedGroup(group ?? null);
  }

  return (
    <div className="property-map-shell">
      <div className="property-map-meta">
        {loading ? (
          <p role="status">Geocodificando endereços (cache + OpenStreetMap)…</p>
        ) : (
          <p>
            <strong>{meta.mappedCount}</strong> imóveis no mapa ·{" "}
            <strong>{meta.skippedCount}</strong> sem coordenada · {meta.inputCount} endereços ou
            bairros considerados
            {meta.pendingLiveGeocode ? (
              <> · {meta.pendingLiveGeocode} aguardando próxima atualização</>
            ) : null}
          </p>
        )}
        <div className="map-legend">
          <span className="map-legend-item map-legend-item--apartment">Apartamento</span>
          <span className="map-legend-item map-legend-item--penthouse">Cobertura</span>
          <span className="map-legend-item map-legend-item--approx">Borda tracejada = local aproximado (só bairro)</span>
        </div>
        <div className="map-view-toggle">
          <button
            type="button"
            className={viewMode === "properties" ? "active" : "secondary-button"}
            onClick={() => setViewMode("properties")}
          >
            Por imóvel
          </button>
          <button
            type="button"
            className={viewMode === "streets" ? "active" : "secondary-button"}
            onClick={() => setViewMode("streets")}
          >
            Por rua (agrupado)
          </button>
        </div>
        {error && <p className="map-error">{error}</p>}
      </div>
      <div className="property-map-layout">
        <div className="property-map-canvas" aria-label="Mapa de imóveis">
          {!loading && markers.length === 0 ? (
            <p className="map-canvas-empty">
              {error || "Nenhum imóvel com localização para plotar."}
            </p>
          ) : (
            <MapContainer
              key={`map-${markers.length}-${viewMode}`}
              center={center}
              zoom={13}
              scrollWheelZoom
              className="property-map-leaflet"
              style={{ height: "520px", width: "100%" }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapResizeFix />
              {fitPoints.length > 0 && <FitBounds points={fitPoints} />}
              {viewMode === "properties"
                ? markers.map((item, index) => {
                    const [lat, lng] = offsetCoordinate(item.lat, item.lng, index % 6);
                    return (
                      <Marker
                        key={item.link}
                        position={[lat, lng]}
                        icon={propertyMarkerIcon(
                          item.propertyType,
                          item.approximate,
                          favoriteLinks.includes(item.link),
                        )}
                        eventHandlers={{
                          click: () => selectProperty(item),
                        }}
                      />
                    );
                  })
                : groups.map((group) => {
                    const hasPenthouse = group.items.some((item) => item.propertyType === "penthouse");
                    const hasApartment = group.items.some((item) => item.propertyType !== "penthouse");
                    const dominant =
                      hasPenthouse && hasApartment ? "mixed" : hasPenthouse ? "penthouse" : "apartment";
                    return (
                      <Marker
                        key={group.streetKey}
                        position={[group.lat, group.lng]}
                        icon={groupMarkerIcon(group.count, dominant)}
                        eventHandlers={{
                          click: () => {
                            setSelectedGroup(group);
                            setSelectedItem(group.items[0] ?? null);
                          },
                        }}
                      />
                    );
                  })}
            </MapContainer>
          )}
        </div>
        <aside className="property-map-sidebar" aria-live="polite">
          {!selectedItem ? (
            <p className="map-sidebar-hint">
              Clique em um ponto verde no mapa. Apartamentos usam verde claro; coberturas, verde
              escuro. Imóveis sem endereço de rua usam o centro do bairro (marcador tracejado).
            </p>
          ) : (
            <>
              {selectedGroup ? <h3>{selectedGroup.label}</h3> : null}
              <article className="map-property-card">
                <span className="source-label">{selectedItem.source}</span>
                <p className="listing-model-badges">
                  <span className="badge-purpose">{purposeLabel(selectedItem.purpose)}</span>
                  <span className="badge-type">{propertyTypeLabel(selectedItem.propertyType)}</span>
                </p>
                <h4>{selectedItem.title}</h4>
                <p className="address-line">{selectedItem.location || selectedItem.neighborhood}</p>
                <p>{selectedItem.neighborhood}</p>
                <strong className="captured-price">{currency(selectedItem.price)}</strong>
                <a href={selectedItem.link} target="_blank" rel="noreferrer">
                  Abrir anúncio ↗
                </a>
                <div className="map-property-actions">
                  <button type="button" className="secondary-button" onClick={() => onClassify(selectedItem)}>
                    Classificar
                  </button>
                  <button
                    type="button"
                    className={favoriteLinks.includes(selectedItem.link) ? "active" : "secondary-button"}
                    onClick={() => onToggleFavorite(selectedItem)}
                  >
                    {favoriteLinks.includes(selectedItem.link) ? "★ Favorito" : "☆ Favoritar"}
                  </button>
                  <button type="button" className="danger-button" onClick={() => onDismiss(selectedItem)}>
                    Descartar
                  </button>
                </div>
              </article>
              {selectedGroup && selectedGroup.items.length > 1 ? (
                <ul className="map-street-list">
                  {selectedGroup.items.map((item) => (
                    <li key={item.link}>
                      <button
                        type="button"
                        className={selectedItem?.link === item.link ? "active" : ""}
                        onClick={() => setSelectedItem(item)}
                      >
                        <span>
                          {propertyTypeLabel(item.propertyType)} · {purposeLabel(item.purpose)}
                        </span>
                        <strong>{currency(item.price)}</strong>
                        <small>{item.location || item.neighborhood}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
