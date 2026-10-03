import assert from "node:assert/strict";
import { test } from "node:test";
import { neighborhoodCentroid } from "../lib/map/neighborhood-centroids";

test("centroide de Botafogo fica na Zona Sul do Rio", () => {
  const point = neighborhoodCentroid("Botafogo");
  assert.ok(point.lat < -22.9 && point.lat > -23);
  assert.ok(point.lng < -43.1 && point.lng > -43.25);
});
