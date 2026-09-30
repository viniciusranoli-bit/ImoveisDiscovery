import assert from "node:assert/strict";
import test from "node:test";
import { parsePropertyFeatureAnalysis } from "../lib/property-analysis";

test("valida análise estruturada de laje e churrasqueira", () => {
  const analysis = parsePropertyFeatureAnalysis(`{
    "slabRights": "mentioned_unverified",
    "balconyBarbecue": "explicit",
    "evidence": [
      {"feature": "slab_rights", "quote": "uso exclusivo da laje"},
      {"feature": "balcony_barbecue", "quote": "varanda com churrasqueira"}
    ],
    "summary": "O anúncio menciona ambos, mas não comprova juridicamente a laje."
  }`);
  assert.equal(analysis.slabRights, "mentioned_unverified");
  assert.equal(analysis.balconyBarbecue, "explicit");
  assert.equal(analysis.evidence.length, 2);
});

test("rejeita estados inventados pelo modelo", () => {
  assert.throws(() =>
    parsePropertyFeatureAnalysis(`{
      "slabRights": "confirmed",
      "balconyBarbecue": "yes",
      "evidence": [],
      "summary": "Inválido"
    }`),
  );
});
