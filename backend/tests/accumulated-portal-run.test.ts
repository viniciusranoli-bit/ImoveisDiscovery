import assert from "node:assert/strict";
import { test } from "node:test";

type Row = { propertyId: string; seenAt: string; price: number; runId: string };

function pickNewestByProperty(rows: Row[]) {
  const map = new Map<string, Row>();
  for (const row of rows) {
    const current = map.get(row.propertyId);
    if (!current || row.seenAt > current.seenAt) map.set(row.propertyId, row);
  }
  return [...map.values()];
}

test("incremento por agendamento mantém o snapshot mais recente por imóvel", () => {
  const rows: Row[] = [
    { propertyId: "p1", seenAt: "2026-01-01T10:00:00.000Z", price: 1_500_000, runId: "run-1" },
    { propertyId: "p1", seenAt: "2026-01-01T11:00:00.000Z", price: 1_450_000, runId: "run-2" },
    { propertyId: "p2", seenAt: "2026-01-01T11:00:00.000Z", price: 1_800_000, runId: "run-2" },
  ];
  const merged = pickNewestByProperty(rows);
  assert.equal(merged.length, 2);
  const updated = merged.find((item) => item.propertyId === "p1");
  assert.equal(updated?.price, 1_450_000);
  assert.equal(updated?.runId, "run-2");
});
