import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatSearchQuota,
  formatSearchQuotaUsage,
  normalizeAdminSearchQuota,
  UNLIMITED_SEARCH_QUOTA,
} from "../lib/auth/search-quota";

test("aceita cotas 10, 100 e ilimitada", () => {
  assert.equal(normalizeAdminSearchQuota(10), 10);
  assert.equal(normalizeAdminSearchQuota(100), 100);
  assert.equal(normalizeAdminSearchQuota(UNLIMITED_SEARCH_QUOTA), UNLIMITED_SEARCH_QUOTA);
});

test("rejeita cotas fora do catálogo", () => {
  assert.throws(() => normalizeAdminSearchQuota(50), /10, 100 ou ilimitada/);
});

test("formata uso e cota ilimitada", () => {
  assert.equal(formatSearchQuota(10), "10");
  assert.equal(formatSearchQuota(UNLIMITED_SEARCH_QUOTA), "Ilimitada");
  assert.equal(formatSearchQuotaUsage(3, 10), "3/10");
  assert.equal(formatSearchQuotaUsage(12, UNLIMITED_SEARCH_QUOTA), "12 · ilimitada");
});
