import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CHAT_OFF_TOPIC_REPLY,
  finalizeChatAssistantScope,
  isObviouslyOffTopicUserMessage,
} from "../src/lib/chat-scope-guard";

test("pré-filtro recusa assuntos claramente fora de imóveis", () => {
  assert.equal(isObviouslyOffTopicUserMessage("Me dá uma receita de bolo de chocolate"), true);
  assert.equal(isObviouslyOffTopicUserMessage("Como aprender Python do zero?"), true);
  assert.equal(isObviouslyOffTopicUserMessage("Quais coberturas em Botafogo até 12 mil?"), false);
});

test("camada inScope=false substitui resposta canônica", () => {
  const result = finalizeChatAssistantScope(
    { inScope: false, reply: "A capital da França é Paris." },
    "capital da frança",
  );
  assert.equal(result.refused, true);
  assert.equal(result.reply, CHAT_OFF_TOPIC_REPLY);
});

test("pergunta on-topic mantém resposta do modelo", () => {
  const result = finalizeChatAssistantScope(
    { inScope: true, reply: "Priorize coberturas com vaga confirmada." },
    "como priorizar cobertura?",
  );
  assert.equal(result.refused, false);
  assert.match(result.reply, /coberturas/i);
});
