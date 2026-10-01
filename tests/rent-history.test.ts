import assert from "node:assert/strict";
import test from "node:test";
import { rentHistoryBands } from "../lib/rent-history";

test("separa o histórico de aluguel no teto de 12 mil", () => {
  const groups = rentHistoryBands([
    { id: "a", rentAmount: 12_000 },
    { id: "b", rentAmount: 12_001 },
    { id: "c", rentAmount: 8_000 },
    { id: "d" },
  ]);
  assert.deepEqual(
    groups.map((group) => [group.label, group.items.map((item) => item.id)]),
    [
      ["Até R$ 12.000", ["a", "c"]],
      ["Acima de R$ 12.000", ["b"]],
      ["Aluguel não informado", ["d"]],
    ],
  );
});
