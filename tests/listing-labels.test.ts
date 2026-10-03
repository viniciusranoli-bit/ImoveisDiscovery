import assert from "node:assert/strict";
import { test } from "node:test";
import {
  propertyTypeLabel,
  purposeLabel,
  purposeVerb,
  supportsSlabFeatureAnalysis,
} from "../lib/listing-labels";

test("dois modelos: alugar e comprar", () => {
  assert.equal(purposeVerb("rent"), "Alugar");
  assert.equal(purposeVerb("sale"), "Comprar");
  assert.equal(purposeLabel("rent"), "Aluguel");
  assert.equal(purposeLabel("sale"), "Compra");
});

test("dois tipos: apartamento e cobertura", () => {
  assert.equal(propertyTypeLabel("apartment"), "Apartamento");
  assert.equal(propertyTypeLabel("penthouse"), "Cobertura");
  assert.equal(propertyTypeLabel("unknown"), "Apartamento");
});

test("IA só para apartamento no modelo comprar", () => {
  assert.equal(
    supportsSlabFeatureAnalysis({ purpose: "sale", propertyType: "apartment" }),
    true,
  );
  assert.equal(
    supportsSlabFeatureAnalysis({ purpose: "sale", propertyType: "penthouse" }),
    false,
  );
  assert.equal(
    supportsSlabFeatureAnalysis({ purpose: "rent", propertyType: "apartment" }),
    false,
  );
});
