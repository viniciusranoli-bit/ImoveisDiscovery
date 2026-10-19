import assert from "node:assert/strict";
import test from "node:test";
import { saleHistorySections } from "../src/lib/sale-history";

test("sale history excludes dismissed penthouses", () => {
  const items = [
    { category: "both" as const, propertyType: "apartment" as const },
    { category: "none" as const, propertyType: "apartment" as const },
    {
      category: "slab_rights" as const,
      propertyType: "penthouse" as const,
      penthouseDisposition: "dismissed" as const,
    },
    { category: "ambiguous" as const, propertyType: "penthouse" as const },
  ];
  const groups = saleHistorySections(items, "all");
  assert.equal(groups.length, 3);
  assert.equal(groups[0]?.id, "interest");
  assert.equal(groups[0]?.items.length, 1);
  assert.equal(groups[1]?.id, "none");
  assert.equal(groups[1]?.items.length, 1);
  assert.equal(groups[2]?.id, "penthouse");
  assert.equal(groups[2]?.items.length, 1);
});

test("sale history filter keeps ambiguous only in interest group", () => {
  const items = [
    { category: "both" as const, propertyType: "apartment" as const },
    { category: "ambiguous" as const, propertyType: "apartment" as const },
  ];
  const groups = saleHistorySections(items, "ambiguous");
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.id, "interest");
  assert.equal(groups[0]?.items.length, 1);
  assert.equal(groups[0]?.items[0]?.category, "ambiguous");
});

test("coberturas não entram na classificação de laje e churrasqueira", () => {
  const items = [
    { category: "none" as const, propertyType: "penthouse" as const },
    { category: "ambiguous" as const, propertyType: "penthouse" as const },
    { category: "both" as const, propertyType: "apartment" as const },
  ];
  const groups = saleHistorySections(items, "all");
  const interest = groups.find((group) => group.id === "interest");
  const none = groups.find((group) => group.id === "none");
  const penthouse = groups.find((group) => group.id === "penthouse");
  assert.equal(interest?.items.length, 1);
  assert.equal(none, undefined);
  assert.equal(penthouse?.items.length, 2);
  assert.ok(penthouse?.items.every((item) => item.propertyType === "penthouse"));
});
