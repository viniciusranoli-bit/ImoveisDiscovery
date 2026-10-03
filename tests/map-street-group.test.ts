import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGeocodeQuery,
  groupGeocodedProperties,
  hasMapAddress,
  hasMappableLocation,
  normalizeStreet,
} from "../lib/map/street-group";

test("ignora endereço ausente ou placeholder", () => {
  assert.equal(hasMapAddress(undefined), false);
  assert.equal(hasMapAddress("Endereço não informado"), false);
  assert.equal(hasMapAddress("Rua Voluntários da Pátria, 120"), true);
});

test("agrupa imóveis na mesma rua", () => {
  const base = {
    title: "Apt",
    neighborhood: "Botafogo",
    link: "https://example.com/a",
    source: "ZAP",
    purpose: "sale" as const,
  };
  const groups = groupGeocodedProperties([
    { ...base, id: "1", location: "Rua Voluntários da Pátria, 120", lat: -22.95, lng: -43.18 },
    { ...base, id: "2", location: "Rua Voluntários da Pátria, 350", lat: -22.951, lng: -43.181 },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.count, 2);
  assert.match(groups[0]?.label ?? "", /\(2\)/);
});

test("normaliza prefixo de rua", () => {
  assert.equal(normalizeStreet("R. São Clemente 45"), "rua sao clemente");
});

test("aceita bairro quando não há logradouro para o mapa", () => {
  const property = {
    location: "",
    neighborhood: "Botafogo",
  };
  assert.equal(hasMappableLocation(property), true);
  assert.match(buildGeocodeQuery(property), /Botafogo, Rio de Janeiro/);
});
