import assert from "node:assert/strict";
import { test } from "node:test";
import {
  listingMatchesAlertRule,
  normalizeAlertRuleConfig,
  saleApartmentCategory,
} from "../src/lib/alerts/alert-rule-engine";
import type { CollectedListing } from "../src/lib/listings";

const baseListing = (overrides: Partial<CollectedListing>): CollectedListing => ({
  id: "1",
  title: "Apto Botafogo",
  purpose: "sale",
  propertyType: "apartment",
  price: 1_500_000,
  bedrooms: 2,
  parkingSpaces: 1,
  neighborhood: "Botafogo",
  link: "https://example.com/a",
  source: "test",
  sources: ["test"],
  sourceSearchUrl: "https://example.com",
  collectedAt: new Date().toISOString(),
  evidence: [],
  locationStatus: "confirmed",
  ...overrides,
});

test("saleApartmentCategory identifica laje e churrasqueira", () => {
  assert.equal(
    saleApartmentCategory({
      slabRights: "mentioned_unverified",
      balconyBarbecue: "explicit",
      evidence: [],
      summary: "",
    }),
    "both",
  );
});

test("regra de compra exige categoria de IA quando configurada", () => {
  const rule = normalizeAlertRuleConfig({
    name: "Compra interesse",
    purpose: "sale",
    propertyTypes: ["apartment"],
    saleApartmentCategories: ["both"],
    notifyPhonesE164: ["5521999999999"],
  });
  const listing = baseListing({});
  assert.equal(
    listingMatchesAlertRule({
      listing,
      analysis: {
        slabRights: "not_mentioned",
        balconyBarbecue: "not_mentioned",
        evidence: [],
        summary: "",
      },
      rule,
      requireAnalysis: true,
    }),
    false,
  );
  assert.equal(
    listingMatchesAlertRule({
      listing,
      analysis: {
        slabRights: "mentioned_unverified",
        balconyBarbecue: "explicit",
        evidence: [],
        summary: "",
      },
      rule,
      requireAnalysis: true,
    }),
    true,
  );
});

test("cobertura em compra não exige análise de laje", () => {
  const rule = normalizeAlertRuleConfig({
    name: "Cobertura",
    purpose: "sale",
    propertyTypes: ["penthouse"],
    priceMax: 2_000_000,
    notifyPhonesE164: ["5521999999999"],
  });
  assert.equal(
    listingMatchesAlertRule({
      listing: baseListing({ propertyType: "penthouse", price: 1_900_000 }),
      rule,
      requireAnalysis: true,
    }),
    true,
  );
});
