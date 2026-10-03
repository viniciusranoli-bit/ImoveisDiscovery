import assert from "node:assert/strict";
import test from "node:test";
import { saleHistorySections } from "../lib/sale-history";

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
  assert.equal(groups.length, 2);
  assert.equal(groups[0]?.items.length, 2);
  assert.equal(groups[1]?.items.length, 1);
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
