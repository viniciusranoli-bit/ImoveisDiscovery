import { createHash } from "node:crypto";

import { query } from "@/lib/db/client";

import type { MapProperty } from "@/lib/map/street-group";

import { neighborhoodCentroid } from "@/lib/map/neighborhood-centroids";

import {

  buildGeocodeQuery,

  groupGeocodedProperties,

  hasMappableLocation,

  hasPreciseMapAddress,

  isApproximateMapLocation,

  type GeocodedProperty,

} from "@/lib/map/street-group";



const GEOCODE_BATCH_SIZE = 80;

const MAX_NOMINATIM_PER_BATCH = 1;



function addressKey(text: string) {

  return createHash("sha256").update(text.trim().toLowerCase()).digest("hex");

}



function buildQuery(property: MapProperty) {

  return buildGeocodeQuery(property);

}



async function readCachedCoordinate(key: string) {

  const result = await query<{ latitude: number; longitude: number }>(

    `SELECT latitude, longitude FROM tb_geocode_cache WHERE address_key = $1`,

    [key],

  );

  return result.rows[0];

}



async function writeCachedCoordinate(key: string, queryText: string, lat: number, lng: number) {

  await query(

    `

      INSERT INTO tb_geocode_cache (address_key, query_text, latitude, longitude)

      VALUES ($1, $2, $3, $4)

      ON CONFLICT (address_key) DO UPDATE

      SET query_text = EXCLUDED.query_text,

          latitude = EXCLUDED.latitude,

          longitude = EXCLUDED.longitude,

          resolved_at = now()

    `,

    [key, queryText, lat, lng],

  );

}



async function geocodeWithNominatim(queryText: string) {

  const url = new URL("https://nominatim.openstreetmap.org/search");

  url.searchParams.set("q", queryText);

  url.searchParams.set("format", "json");

  url.searchParams.set("limit", "1");

  url.searchParams.set("countrycodes", "br");

  const response = await fetch(url, {

    headers: {

      "User-Agent": "AluguelDiscovery/1.0 (property monitor; contact via local install)",

      "Accept-Language": "pt-BR",

    },

  });

  if (!response.ok) return undefined;

  const rows = (await response.json()) as Array<{ lat: string; lon: string }>;

  const hit = rows[0];

  if (!hit) return undefined;

  const lat = Number(hit.lat);

  const lng = Number(hit.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;

  if (lat < -24 || lat > -21 || lng < -45 || lng > -42) return undefined;

  return { lat, lng };

}



async function resolveCoordinate(property: MapProperty) {

  const queryText = buildQuery(property);

  const key = addressKey(queryText);

  const cached = await readCachedCoordinate(key);

  if (cached) return { lat: cached.latitude, lng: cached.longitude };



  if (!hasPreciseMapAddress(property)) {

    const centroid = neighborhoodCentroid(property.neighborhood);

    await writeCachedCoordinate(key, queryText, centroid.lat, centroid.lng);

    return centroid;

  }



  const live = await geocodeWithNominatim(queryText);

  if (!live) {

    const centroid = neighborhoodCentroid(property.neighborhood);

    await writeCachedCoordinate(key, queryText, centroid.lat, centroid.lng);

    return centroid;

  }

  await writeCachedCoordinate(key, queryText, live.lat, live.lng);

  return live;

}



function dedupeMappable(properties: MapProperty[]) {

  const unique = new Map<string, MapProperty>();

  for (const property of properties) {

    if (!hasMappableLocation(property)) continue;

    unique.set(`${property.id}:${property.link}`, property);

  }

  return [...unique.values()];

}



async function geocodeMapPropertiesBatch(batch: MapProperty[]) {

  const geocoded: GeocodedProperty[] = [];

  const pendingLive: MapProperty[] = [];

  for (const property of batch) {

    const queryText = buildQuery(property);

    const key = addressKey(queryText);

    const cached = await readCachedCoordinate(key);

    if (cached) {

      geocoded.push({

        ...property,

        lat: cached.latitude,

        lng: cached.longitude,

        approximate: isApproximateMapLocation(property),

      });

      continue;

    }

    pendingLive.push(property);

  }



  const approximatePending = pendingLive.filter((property) => !hasPreciseMapAddress(property));

  const precisePending = pendingLive.filter((property) => hasPreciseMapAddress(property));



  for (const property of approximatePending) {

    const coordinate = await resolveCoordinate(property);

    if (!coordinate) continue;

    geocoded.push({

      ...property,

      ...coordinate,

      approximate: isApproximateMapLocation(property),

    });

  }



  let nominatimUsed = 0;

  let preciseDeferred = 0;

  for (const property of precisePending) {

    if (nominatimUsed >= MAX_NOMINATIM_PER_BATCH) {

      preciseDeferred += 1;

      const centroid = neighborhoodCentroid(property.neighborhood);

      geocoded.push({

        ...property,

        ...centroid,

        approximate: true,

      });

      continue;

    }

    if (nominatimUsed > 0) {

      await new Promise((resolve) => setTimeout(resolve, 1100));

    }

    const coordinate = await resolveCoordinate(property);

    nominatimUsed += 1;

    if (!coordinate) continue;

    geocoded.push({

      ...property,

      ...coordinate,

      approximate: isApproximateMapLocation(property),

    });

  }



  return {

    markers: geocoded,

    pendingLiveGeocode: preciseDeferred,

  };

}



export async function geocodeMapProperties(properties: MapProperty[]) {

  const uniqueList = dedupeMappable(properties);

  const allMarkers: GeocodedProperty[] = [];

  let pendingLiveGeocode = 0;



  for (let offset = 0; offset < uniqueList.length; offset += GEOCODE_BATCH_SIZE) {

    const batch = uniqueList.slice(offset, offset + GEOCODE_BATCH_SIZE);

    const part = await geocodeMapPropertiesBatch(batch);

    allMarkers.push(...part.markers);

    pendingLiveGeocode += part.pendingLiveGeocode;

  }



  const byLink = new Map<string, GeocodedProperty>();

  for (const marker of allMarkers) {

    byLink.set(marker.link, marker);

  }

  const markers = [...byLink.values()];

  const groups = groupGeocodedProperties(markers);

  const notOnMap = uniqueList.length - markers.length;



  return {

    groups,

    markers,

    mappedCount: markers.length,

    skippedCount: notOnMap,

    inputCount: uniqueList.length,

    pendingLiveGeocode,

  };

}


