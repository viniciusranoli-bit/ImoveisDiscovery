import assert from "node:assert/strict";
import test from "node:test";
import { deduplicate, isEligible, scoreListing } from "../lib/listings";

const base = {
  title: "Apartamento em Botafogo",
  platform: "Exemplo",
  link: "https://example.com/imovel?utm_source=test",
  location: "Botafogo, Rio de Janeiro",
  neighborhood: "Botafogo",
  parkingType: "Fixa coberta",
  available: true,
  evidence: ["2 quartos e 1 vaga informados no anúncio"],
};

test("prioriza imóvel caminhável com metrô e custo dentro do teto", () => {
  const listing = scoreListing({
    ...base,
    bedrooms: 2,
    parkingSpaces: 1,
    rent: 8500,
    condo: 1200,
    iptu: 200,
    walkToWorkMin: 18,
    walkToMetroMin: 6,
    metroStation: "Botafogo",
    barbecueBalcony: true,
  });
  assert.equal(listing.priority, "Alta");
  assert.ok(listing.score >= 90);
  assert.equal(listing.totalMonthly, 9900);
});

test("rejeita anúncio sem quartos ou vaga confirmados", () => {
  const listing = scoreListing({ ...base, bedrooms: 1, parkingSpaces: 0 });
  assert.equal(isEligible(listing), false);
});

test("remove links duplicados mesmo com parâmetros de rastreamento", () => {
  const first = scoreListing({ ...base, bedrooms: 2, parkingSpaces: 1 });
  const second = scoreListing({ ...base, bedrooms: 2, parkingSpaces: 1, link: "https://example.com/imovel" });
  assert.equal(deduplicate([first, second]).length, 1);
});
