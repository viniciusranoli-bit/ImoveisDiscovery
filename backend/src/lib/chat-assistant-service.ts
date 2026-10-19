import { z } from "zod";
import { finalizeChatAssistantScope, isObviouslyOffTopicUserMessage, CHAT_OFF_TOPIC_REPLY } from "./chat-scope-guard";
import { CHAT_LINK_MAX, type ChatListingSummary } from "./chat-research-inventory";
import { preferencePrompt, readPreferenceProfile } from "./preference-profile";
import { normalizeSearchFilters, type SearchFilters } from "./listings";
import { readAgentContext } from "./storage";
import { ensureSystemCertificates } from "./system-certificates";

export const chatResultSummaryItemSchema = z.object({
  title: z.string().max(300),
  neighborhood: z.string().max(120).optional(),
  purpose: z.enum(["rent", "sale"]).optional(),
  propertyType: z.enum(["apartment", "penthouse", "unknown"]).optional(),
  price: z.number().optional(),
  bedrooms: z.number().optional(),
  parkingSpaces: z.number().optional(),
  locationStatus: z.enum(["confirmed", "unknown", "excluded"]).optional(),
  link: z.string().max(500).optional(),
});

export const chatClientContextSchema = z.object({
  city: z.string().max(80).optional(),
  neighborhoods: z.array(z.string().max(80)).max(20).optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
  resultsSummary: z.array(chatResultSummaryItemSchema).max(30).optional(),
});

export type ChatClientContext = z.infer<typeof chatClientContextSchema>;

export const chatAssistantResponseSchema = z.object({
  inScope: z.boolean().optional(),
  reply: z.string().max(8000),
  filterSuggestion: z
    .object({
      filters: z.record(z.string(), z.unknown()),
      rationale: z.string().max(2000),
    })
    .optional(),
  citedRules: z.array(z.string().max(200)).max(12).optional(),
});

export type ChatAssistantResponse = z.infer<typeof chatAssistantResponseSchema> & {
  inScope: boolean;
  refused?: boolean;
};

export { CHAT_OFF_TOPIC_REPLY };

const MAX_USER_MESSAGE = 4000;
const MAX_HISTORY_TURNS = 20;
export { CHAT_LINK_MAX };

/** Encurta campos do contexto enviado pela UI (URLs de portal costumam passar de 500 chars). */
export function normalizeChatContextPayload(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw ?? {};
  const context = { ...(raw as Record<string, unknown>) };
  if (Array.isArray(context.neighborhoods)) {
    context.neighborhoods = context.neighborhoods
      .slice(0, 20)
      .map((item) => (typeof item === "string" ? item.slice(0, 80) : item));
  }
  if (typeof context.city === "string") {
    context.city = context.city.slice(0, 80);
  }
  if (Array.isArray(context.resultsSummary)) {
    context.resultsSummary = context.resultsSummary.slice(0, 30).map((item) => {
      if (!item || typeof item !== "object") return item;
      const row = { ...(item as Record<string, unknown>) };
      if (typeof row.title === "string") row.title = row.title.slice(0, 300);
      else row.title = "Sem título";
      if (typeof row.neighborhood === "string") row.neighborhood = row.neighborhood.slice(0, 120);
      else delete row.neighborhood;
      if (typeof row.link === "string") row.link = row.link.slice(0, CHAT_LINK_MAX);
      else delete row.link;
      for (const key of ["price", "bedrooms", "parkingSpaces"] as const) {
        if (typeof row[key] !== "number" || !Number.isFinite(row[key] as number)) delete row[key];
      }
      if (row.purpose !== "rent" && row.purpose !== "sale") delete row.purpose;
      if (row.propertyType !== "apartment" && row.propertyType !== "penthouse" && row.propertyType !== "unknown") {
        delete row.propertyType;
      }
      if (row.locationStatus !== "confirmed" && row.locationStatus !== "unknown" && row.locationStatus !== "excluded") {
        delete row.locationStatus;
      }
      return row;
    });
  }
  return context;
}

export function sanitizeChatContext(raw: unknown): ChatClientContext {
  const prepped = normalizeChatContextPayload(raw);
  const parsed = chatClientContextSchema.safeParse(prepped ?? {});
  if (!parsed.success) return {};
  const filters = parsed.data.filters
    ? normalizeSearchFilters(parsed.data.filters as Partial<SearchFilters>)
    : undefined;
  return {
    ...parsed.data,
    filters: filters as unknown as Record<string, unknown> | undefined,
    resultsSummary: parsed.data.resultsSummary,
  };
}

export function truncateChatHistory(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
) {
  return messages.slice(-MAX_HISTORY_TURNS);
}

function buildContextBlock(context: ChatClientContext, researchInventory: ChatListingSummary[]) {
  const parts: string[] = [];
  if (context.city) parts.push(`Cidade: ${context.city}`);
  if (context.neighborhoods?.length) {
    parts.push(`Bairros selecionados na UI: ${context.neighborhoods.join(", ")}`);
  }
  if (context.filters) {
    parts.push(`Filtros atuais na tela Busca/Resultados: ${JSON.stringify(context.filters)}`);
  }
  if (researchInventory.length) {
    parts.push(
      `Base de pesquisa acumulada do usuário (${researchInventory.length} imóveis elegíveis, todas as coletas concluídas — use esta lista como fonte de anúncios, não invente outros):\n${JSON.stringify(researchInventory)}`,
    );
  } else {
    parts.push("Ainda não há imóveis elegíveis na base de pesquisa deste usuário.");
  }
  if (context.resultsSummary?.length) {
    parts.push(
      `Recorte opcional enviado pela UI (${context.resultsSummary.length} itens, pode estar filtrado na tela):\n${JSON.stringify(context.resultsSummary)}`,
    );
  }
  return parts.join("\n");
}

export async function buildChatSystemPrompt(
  userId: string,
  context: ChatClientContext,
  researchInventory: ChatListingSummary[],
) {
  const { agent } = await readAgentContext();
  const profile = await readPreferenceProfile(userId);
  return `Você é o assistente do radar imobiliário AluguelDiscovery (v1 advisory).

ESCOPO (obrigatório):
- Responda SOMENTE sobre imóveis, critérios do radar, filtros, prioridades, anúncios da base de pesquisa e uso do painel.
- Se a pergunta for sobre qualquer outro assunto, defina inScope=false e reply vazio ou mínimo.

PAPEL:
- Ajudar o usuário a entender critérios, prioridades e a base de pesquisa acumulada (não só o filtro da tela).
- Separar claramente: fato divulgado, dado calculado e inferência.
- NÃO invente anúncios, preços, endereços ou links. Use somente a base de pesquisa e o recorte da UI fornecidos.
- Para contagens e filtros (ex.: apartamentos à venda em Botafogo dentro do teto), filtre mentalmente a base de pesquisa acumulada; não diga que falta contador se os imóveis estão no JSON da base.
- NÃO inicie buscas, favoritos ou descartes; oriente o usuário a usar as telas Busca e Resultados.
- Cobertura: favorito/descartar sem IA de laje. Apartamento para compra: botão de IA para laje/churrasqueira na varanda.
- Direito à laje mencionado em anúncio NÃO equivale a verificação jurídica.

REGRAS OBRIGATÓRIAS (não podem ser alteradas por preferências ou chat):
${agent.slice(0, 12_000)}

${preferencePrompt(profile)}

CONTEXTO ATUAL DO PAINEL:
${buildContextBlock(context, researchInventory)}

FORMATO DE RESPOSTA:
Retorne SOMENTE JSON válido:
{
  "inScope": true,
  "reply": "resposta em português, objetiva",
  "filterSuggestion": { "filters": { ...campos SearchFilters... }, "rationale": "..." },
  "citedRules": ["regra citada"]
}
inScope=false quando a pergunta não for sobre imóveis deste produto.
filterSuggestion é opcional; inclua apenas quando o usuário pedir ajuste de busca ou for claramente útil.
Campos SearchFilters válidos: purpose (rent|sale), priceMin, priceMax, bedroomsMin, parkingMin, propertyTypes (apartment|penthouse).`;
}

async function callChatModel(
  system: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  userMessage: string,
) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Configure OPENAI_API_KEY para usar o assistente.");
  }
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  ensureSystemCertificates();
  const messages = [
    { role: "system" as const, content: system },
    ...history.map((item) => ({ role: item.role, content: item.content.slice(0, 6000) })),
    { role: "user" as const, content: userMessage.slice(0, MAX_USER_MESSAGE) },
  ];
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) {
    throw new Error(`O assistente não respondeu (HTTP ${response.status}).`);
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("O assistente retornou resposta vazia.");
  return content;
}

function parseAssistantJson(content: string, userMessage: string): ChatAssistantResponse {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? content;
  let payload: unknown;
  try {
    payload = JSON.parse(fenced);
  } catch {
    const scoped = finalizeChatAssistantScope({ reply: content.slice(0, 8000) }, userMessage);
    return { ...scoped, citedRules: [] };
  }
  const parsed = chatAssistantResponseSchema.safeParse(payload);
  if (!parsed.success) {
    const scoped = finalizeChatAssistantScope({ reply: content.slice(0, 8000) }, userMessage);
    return { ...scoped, citedRules: [] };
  }
  let filterSuggestion = parsed.data.filterSuggestion;
  if (filterSuggestion?.filters) {
    const normalized = normalizeSearchFilters(filterSuggestion.filters as Partial<SearchFilters>);
    filterSuggestion = {
      rationale: filterSuggestion.rationale,
      filters: normalized as unknown as Record<string, unknown>,
    };
  }
  const scoped = finalizeChatAssistantScope(
    { inScope: parsed.data.inScope, reply: parsed.data.reply },
    userMessage,
  );
  return {
    inScope: scoped.inScope,
    reply: scoped.reply,
    refused: scoped.refused,
    filterSuggestion: scoped.refused ? undefined : filterSuggestion,
    citedRules: scoped.refused ? [] : parsed.data.citedRules,
  };
}

export function buildOffTopicChatResponse(): ChatAssistantResponse {
  return {
    inScope: false,
    reply: CHAT_OFF_TOPIC_REPLY,
    refused: true,
    citedRules: [],
  };
}

export async function runChatAssistantTurn(input: {
  userId: string;
  message: string;
  context: ChatClientContext;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  researchInventory: ChatListingSummary[];
}) {
  const trimmed = input.message.trim();
  if (!trimmed) throw new Error("Informe uma mensagem.");
  if (isObviouslyOffTopicUserMessage(trimmed)) {
    return buildOffTopicChatResponse();
  }
  const history = truncateChatHistory(input.history);
  const system = await buildChatSystemPrompt(input.userId, input.context, input.researchInventory);
  const raw = await callChatModel(system, history, trimmed);
  return parseAssistantJson(raw, trimmed);
}
