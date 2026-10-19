import assert from "node:assert/strict";
import test from "node:test";
import { isAnalysisDue, isHourlySearchDue } from "../src/lib/schedule";

const savedAt = "2026-09-30T08:00:00.000Z";

test("busca automática espera 30 minutos após salvar ou após a última execução", () => {
  assert.equal(isHourlySearchDue(savedAt, null, Date.parse("2026-09-30T08:29:00.000Z")), false);
  assert.equal(isHourlySearchDue(savedAt, null, Date.parse("2026-09-30T08:30:00.000Z")), true);
  assert.equal(
    isHourlySearchDue(savedAt, "2026-09-30T10:00:00.000Z", Date.parse("2026-09-30T10:30:00.000Z")),
    true,
  );
});

test("análise automática respeita o intervalo e exige uma coleta concluída", () => {
  assert.equal(isAnalysisDue(savedAt, null, null, 360, Date.parse("2026-09-30T20:00:00.000Z")), false);
  assert.equal(
    isAnalysisDue(savedAt, null, "run-1", 360, Date.parse("2026-09-30T13:59:00.000Z")),
    false,
  );
  assert.equal(
    isAnalysisDue(savedAt, null, "run-1", 360, Date.parse("2026-09-30T14:00:00.000Z")),
    true,
  );
});
