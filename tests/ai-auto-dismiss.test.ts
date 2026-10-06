import assert from "node:assert/strict";
import test from "node:test";
import {
  AI_AUTO_DISMISS_RENT_PRICE_ABOVE,
  aiDismissSummary,
  shouldAutoDismissByPrice,
} from "../lib/ai-auto-dismiss";
import type { CollectedListing } from "../lib/listings";

function listing(overrides: Partial<CollectedListing> = {}): CollectedListing {
  return {
    id: "1",
    title: "Imóvel",
    purpose: "rent",
    propertyType: "apartment",
    price: AI_AUTO_DISMISS_RENT_PRICE_ABOVE + 1,
    neighborhood: "Botafogo",
    link: "https://example.com/1",
    source: "Teste",
    sources: ["Teste"],
    sourceSearchUrl: "https://example.com/search",
    collectedAt: new Date().toISOString(),
    evidence: [],
    ...overrides,
  };
}

test("descarta aluguel de apartamento acima de R$ 11.000", () => {
  assert.equal(shouldAutoDismissByPrice(listing({ propertyType: "apartment", price: 11_001 })), true);
});

test("descarta aluguel de cobertura acima de R$ 11.000", () => {
  assert.equal(shouldAutoDismissByPrice(listing({ propertyType: "penthouse", price: 15_000 })), true);
});

test("mantém aluguel no limite de R$ 11.000", () => {
  assert.equal(shouldAutoDismissByPrice(listing({ price: AI_AUTO_DISMISS_RENT_PRICE_ABOVE })), false);
});

test("não descarta compra pelo critério de R$ 11.000", () => {
  assert.equal(
    shouldAutoDismissByPrice(listing({ purpose: "sale", price: 900_000 })),
    false,
  );
});

test("mensagem de descarte por preço", () => {
  assert.match(aiDismissSummary("price"), /Descartado por IA/);
  assert.match(aiDismissSummary("price"), /11/);
});
