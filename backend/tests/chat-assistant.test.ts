import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chatClientContextSchema,
  normalizeChatContextPayload,
  sanitizeChatContext,
  truncateChatHistory,
} from "../src/lib/chat-assistant-service";

test("sanitizeChatContext normaliza filtros e limita resultados", () => {
  const context = sanitizeChatContext({
    city: "Rio de Janeiro",
    neighborhoods: ["Botafogo"],
    filters: { purpose: "rent", bedroomsMin: 0, parkingMin: 0, propertyTypes: ["apartment"] },
    resultsSummary: Array.from({ length: 40 }, (_, index) => ({
      title: `Imóvel ${index}`,
    })),
  });
  assert.equal(context.city, "Rio de Janeiro");
  assert.ok(context.filters);
  assert.equal((context.filters as { bedroomsMin: number }).bedroomsMin, 0);
  assert.equal((context.filters as { parkingMin: number }).parkingMin, 0);
  assert.equal(context.resultsSummary?.length, 30);
});

test("chatClientContextSchema rejeita payloads excessivos", () => {
  const parsed = chatClientContextSchema.safeParse({
    resultsSummary: Array.from({ length: 31 }, () => ({ title: "x" })),
  });
  assert.equal(parsed.success, false);
});

test("normalizeChatContextPayload encurta links longos de anúncios", () => {
  const longLink = `https://example.com/${"x".repeat(600)}`;
  const normalized = normalizeChatContextPayload({
    resultsSummary: [{ title: "Teste", link: longLink }],
  }) as { resultsSummary: Array<{ link: string }> };
  assert.equal(normalized.resultsSummary[0]?.link.length, 500);
  assert.equal(chatClientContextSchema.safeParse(normalized).success, true);
});

test("normalizeChatContextPayload remove price null dos snapshots do banco", () => {
  const normalized = normalizeChatContextPayload({
    resultsSummary: [{ title: "Sem preço", price: null, bedrooms: null, purpose: "sale" }],
  });
  assert.equal(chatClientContextSchema.safeParse(normalized).success, true);
  const row = (normalized as { resultsSummary: Array<{ price?: number }> }).resultsSummary[0];
  assert.equal(row?.price, undefined);
});

test("truncateChatHistory mantém apenas os últimos turnos", () => {
  const history = Array.from({ length: 25 }, (_, index) => ({
    role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
    content: `msg ${index}`,
  }));
  assert.equal(truncateChatHistory(history).length, 20);
  assert.equal(truncateChatHistory(history)[0]?.content, "msg 5");
});
