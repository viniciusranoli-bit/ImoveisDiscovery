import { randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import Fastify, { type FastifyRequest } from "fastify";
import { z } from "zod";
import { analyzePropertyBatchFromRun, analyzePropertyFromRun } from "./lib/property-analysis-service";
import { authFailureMessage } from "./lib/auth/errors";
import { exchangeGoogleCode, googleAuthorizeUrl, googleOAuthEnabled } from "./lib/auth/google";
import { SESSION_COOKIE, createSession, deleteSession, readSessionFromToken, sessionCookieOptions } from "./lib/auth/session";
import { authSetupStatus, assertAuthConfigured } from "./lib/auth/setup";
import {
  adminCreateUser,
  adminDeleteUser,
  adminUpdateUser,
  consumeSearchQuota,
  listUsersForAdmin,
  registerLocalUser,
  upsertGoogleUser,
  verifyLocalPassword,
} from "./lib/auth/users";
import {
  addFavorite,
  answerAnalysisAmbiguity,
  assignSearchRunUser,
  deleteSavedSearch,
  deleteSchedulerRun,
  dismissListingForUser,
  favoriteListingKey,
  readControlPanelData,
  readDismissedListingHistory,
  readFavorites,
  readRentHistory,
  readSavedSearches,
  readSuppressedHistory,
  removeFavorite,
  resolvePropertyIdByLink,
  saveSavedSearch,
  setPenthouseDisposition,
  readUserResearchInventory,
  updateSavedSearch,
  updateSavedSearchSchedule,
} from "./lib/db/repository";
import { listingEventData, recordDecisionEvent, readDecisionEvents } from "./lib/decision-events";
import { normalizeSearchFilters, type CollectedListing, type MultiPortalRun, type SearchFilters } from "./lib/listings";
import { geocodeMapProperties } from "./lib/map/geocode-service";
import { normalizeNeighborhoods } from "./lib/neighborhoods";
import { isAnalysisBatchCount, isAnalysisInterval, type AnalysisIntervalMinutes } from "./lib/schedule";
import { readSchedulerStatus, startScheduler } from "./lib/scheduler";
import { analyzeSerperCollection, collectSerperResults, runSearch } from "./lib/search";
import { appendFeedback, readMultiPortalRunView, readSerperCollection, saveMultiPortalRun, saveSearch, saveSerperCollection } from "./lib/storage";
import { collectPortals } from "./lib/collectors";
import { buildChatInventorySummaries } from "./lib/chat-research-inventory";
import {
  chatClientContextSchema,
  normalizeChatContextPayload,
  runChatAssistantTurn,
  sanitizeChatContext,
} from "./lib/chat-assistant-service";
import {
  appendChatMessage,
  countUserChatTurnsLastHour,
  getOrCreateChatSession,
  readRecentChatMessages,
} from "./lib/db/chat-repository";
import { normalizeAlertRuleConfig } from "./lib/alerts/alert-rule-engine";
import { evaluateAlertsForRun } from "./lib/alerts/evaluate-and-send";
import {
  isEvolutionConfigured,
  readEvolutionConnectionHint,
  readEvolutionWhatsAppQr,
  runEvolutionWhatsAppDiagnostic,
} from "./lib/alerts/evolution-whatsapp";
import {
  assertWhatsAppRuleAccess,
  createWhatsAppAlertRule,
  deleteWhatsAppAlertRule,
  listWhatsAppAlertRules,
  readRecentWhatsAppDeliveries,
  updateWhatsAppAlertRule,
} from "./lib/db/whatsapp-alert-repository";

const app = Fastify({ logger: true });

await app.register(cookie);
await app.register(cors, {
  origin: (origin, callback) => callback(null, !origin || origin === process.env.FRONTEND_ORIGIN),
  credentials: true,
});

const cookieOptions = (expiresAt: Date) => ({
  ...sessionCookieOptions(expiresAt),
  domain: undefined,
});

async function currentUser(request: FastifyRequest) {
  return readSessionFromToken(request.cookies[SESSION_COOKIE]);
}

async function requireUser(request: FastifyRequest) {
  const user = await currentUser(request);
  if (!user) throw new Error("Faça login para continuar.");
  return user;
}

function sendError(error: unknown, fallback: string, status = 500) {
  const message = error instanceof Error ? error.message : fallback;
  return { statusCode: status, error: message };
}

function portalReadHttpStatus(error: unknown) {
  if (!(error instanceof Error)) return 500;
  if (error.message.includes("Faça login")) return 401;
  if (
    error.message.includes("não encontrado") ||
    error.message.includes("ainda não concluiu") ||
    error.message.includes("Nenhuma busca manual")
  ) {
    return 404;
  }
  return 500;
}

app.get("/health", async () => ({ status: "ok" }));

app.post("/api/auth/login", async (request, reply) => {
  try {
    assertAuthConfigured();
    const body = z.object({ email: z.string(), password: z.string() }).parse(request.body);
    const user = await verifyLocalPassword(body.email, body.password);
    const session = await createSession(user.id);
    reply.setCookie(SESSION_COOKIE, session.token, cookieOptions(session.expiresAt));
    return { user };
  } catch (error) {
    const message = authFailureMessage(error, "Não foi possível entrar.");
    return reply.code(message.includes("Banco de dados") ? 503 : 401).send({ error: message });
  }
});

app.post("/api/auth/register", async (request, reply) => {
  try {
    assertAuthConfigured();
    const body = z.object({
      email: z.string(),
      password: z.string(),
      displayName: z.string(),
    }).parse(request.body);
    const user = await registerLocalUser(body);
    const session = await createSession(user.id);
    reply.setCookie(SESSION_COOKIE, session.token, cookieOptions(session.expiresAt));
    return { user };
  } catch (error) {
    const message = authFailureMessage(error, "Não foi possível criar a conta.");
    return reply.code(message.includes("Banco de dados") ? 503 : 400).send({ error: message });
  }
});

app.post("/api/auth/logout", async (request, reply) => {
  const token = request.cookies[SESSION_COOKIE];
  if (token) await deleteSession(token).catch(() => undefined);
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
  return { ok: true };
});

app.get("/api/auth/session", async (request, reply) => {
  const user = await currentUser(request);
  if (!user) return reply.code(401).send({ error: "Não autenticado." });
  return { user, googleEnabled: googleOAuthEnabled() };
});

app.get("/api/auth/setup", async (request) =>
  authSetupStatus(new Request(`${request.protocol}://${request.headers.host ?? request.hostname}${request.url}`)),
);

const GOOGLE_STATE_COOKIE = "ad_oauth_state";

app.get("/api/auth/google", async (request, reply) => {
  if (!googleOAuthEnabled()) {
    return reply.code(503).send({ error: "Login com Google não configurado." });
  }
  const state = randomUUID();
  const origin = `${request.protocol}://${request.headers.host ?? request.hostname}`;
  reply.setCookie(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return reply.redirect(googleAuthorizeUrl(new Request(origin), state));
});

app.get("/api/auth/google/callback", async (request, reply) => {
  try {
    const query = request.query as { code?: string; state?: string };
    const expected = request.cookies[GOOGLE_STATE_COOKIE];
    if (!query.code || !query.state || query.state !== expected) {
      throw new Error("Estado OAuth inválido.");
    }
    const origin = `${request.protocol}://${request.headers.host ?? request.hostname}`;
    const profile = await exchangeGoogleCode(new Request(`${origin}${request.url}`), query.code);
    const user = await upsertGoogleUser(profile);
    const session = await createSession(user.id);
    reply.clearCookie(GOOGLE_STATE_COOKIE, { path: "/" });
    reply.setCookie(SESSION_COOKIE, session.token, cookieOptions(session.expiresAt));
    return reply.redirect(process.env.FRONTEND_ORIGIN ?? "http://localhost:3005");
  } catch (error) {
    const destination = new URL("/login", process.env.FRONTEND_ORIGIN ?? "http://localhost:3005");
    destination.searchParams.set("error", error instanceof Error ? error.message : "Falha no login com Google.");
    return reply.redirect(destination.toString());
  }
});

app.get("/api/favorites", async (request, reply) => {
  try {
    const user = await requireUser(request);
    const items = await readFavorites(user.id);
    return { items, links: items.map((item) => item.link) };
  } catch (error) {
    return reply.code(401).send(sendError(error, "Não foi possível carregar favoritos.", 401));
  }
});

app.post("/api/favorites", async (request, reply) => {
  try {
    const user = await requireUser(request);
    const listing = (request.body as { listing?: CollectedListing }).listing;
    if (!listing?.link) return reply.code(400).send({ error: "Informe o imóvel." });
    const propertyId = await resolvePropertyIdByLink(listing.link);
    const listingKey = await addFavorite(user.id, listing, propertyId);
    await recordDecisionEvent({
      propertyId,
      listingId: listing.id,
      userId: user.id,
      eventType: "favorite_added",
      source: "interface",
      purpose: listing.purpose,
      afterData: listingEventData(listing),
      reason: "Favoritado pelo usuário.",
    });
    return { listingKey };
  } catch (error) {
    return reply.code(400).send(sendError(error, "Não foi possível salvar favorito.", 400));
  }
});

app.delete("/api/favorites", async (request, reply) => {
  try {
    const user = await requireUser(request);
    const query = request.query as { link?: string; key?: string };
    const key = query.key ?? (query.link ? favoriteListingKey(query.link) : "");
    if (!key) return reply.code(400).send({ error: "Informe o favorito." });
    await removeFavorite(user.id, key);
    return { removed: true };
  } catch (error) {
    return reply.code(400).send(sendError(error, "Não foi possível remover favorito.", 400));
  }
});

app.get("/api/listing-dismiss", async (request, reply) => {
  try {
    const user = await requireUser(request);
    const [sale, rent] = await Promise.all([
      readDismissedListingHistory("sale", 100, user.id),
      readDismissedListingHistory("rent", 100, user.id),
    ]);
    return { items: [...sale, ...rent] };
  } catch (error) {
    return reply.code(401).send(sendError(error, "Não foi possível carregar os descartados.", 401));
  }
});

app.post("/api/listing-dismiss", async (request, reply) => {
  try {
    const user = await requireUser(request);
    const body = request.body as { link?: string; listing?: CollectedListing; propertyId?: string };
    if (!body.link || !body.listing?.title) return reply.code(400).send({ error: "Informe o imóvel para descartar." });
    await dismissListingForUser({ userId: user.id, link: body.link, listing: body.listing, propertyId: body.propertyId });
    await recordDecisionEvent({
      propertyId: body.propertyId ?? await resolvePropertyIdByLink(body.link),
      listingId: body.listing.id,
      userId: user.id,
      eventType: "property_dismissed",
      source: "interface",
      purpose: body.listing.purpose,
      afterData: listingEventData(body.listing),
      reason: "Imóvel descartado pelo usuário.",
    });
    return { dismissed: true };
  } catch (error) {
    return reply.code(400).send(sendError(error, "Não foi possível descartar o imóvel.", 400));
  }
});

app.get("/api/history", async (request, reply) => {
  try {
    const query = request.query as { limit?: string; purpose?: string };
    const purpose = query.purpose === "rent" ? "rent" : "sale";
    const user = await currentUser(request);
    const limit = Math.max(1, Math.min(200, Number(query.limit) || 50));
    const researched = purpose === "rent"
      ? await readRentHistory(limit, user?.id)
      : await readSuppressedHistory(limit, "sale", user?.id);
    const dismissed = await readDismissedListingHistory(purpose, limit, user?.id);
    const seen = new Set(researched.map((item) => item.link));
    return { items: [...researched, ...dismissed.filter((item) => !seen.has(item.link))].slice(0, limit) };
  } catch (error) {
    return reply.code(500).send(sendError(error, "Não foi possível carregar o histórico.", 500));
  }
});

app.post("/api/history", async (request, reply) => {
  try {
    const body = request.body as {
      analysisId?: string;
      feature?: "slab_rights" | "balcony_barbecue";
      answer?: "yes" | "no" | "unknown";
    };
    if (
      !body.analysisId ||
      !body.feature ||
      !body.answer ||
      !["slab_rights", "balcony_barbecue"].includes(body.feature) ||
      !["yes", "no", "unknown"].includes(body.answer)
    ) {
      return reply.code(400).send({ error: "Resposta de revisão inválida." });
    }
    const answered = await answerAnalysisAmbiguity({
      analysisId: body.analysisId,
      feature: body.feature,
      answer: body.answer,
    });
    const user = await currentUser(request);
    await recordDecisionEvent({
      propertyId: answered.propertyId,
      listingId: answered.listingId,
      userId: user?.id,
      eventType: "ambiguity_answered",
      source: "interface",
      afterData: { feature: body.feature, answer: body.answer },
      reason: "Resposta manual a uma ambiguidade da análise.",
    });
    return { saved: true };
  } catch (error) {
    return reply.code(400).send(sendError(error, "Não foi possível salvar a resposta.", 400));
  }
});

app.post("/api/analyze-property", async (request, reply) => {
  try {
    const user = await requireUser(request);
    const body = request.body as { runId?: string; listingId?: string };
    if (!body.runId || !body.listingId) return reply.code(400).send({ error: "Informe a coleta e o imóvel para análise." });
    return analyzePropertyFromRun(body.runId, body.listingId, user.id);
  } catch (error) {
    return reply.code(500).send(sendError(error, "Não foi possível analisar o imóvel.", 500));
  }
});

app.post("/api/analyze-batch", async (request, reply) => {
  try {
    const user = await requireUser(request);
    const body = request.body as { runId?: string; count?: 5 | 10 | 15 | "all" };
    if (!body.runId || ![5, 10, 15, "all"].includes(body.count ?? 0)) {
      return reply.code(400).send({ error: "Informe uma coleta e uma quantidade válida." });
    }
    const result = await analyzePropertyBatchFromRun(body.runId, body.count!, user.id);
    void evaluateAlertsForRun(body.runId!, { requireAnalysis: true }).catch(() => undefined);
    return result;
  } catch (error) {
    return reply.code(500).send(sendError(error, "Não foi possível concluir a análise.", 500));
  }
});

app.post("/api/collect", async (request, reply) => {
  try {
    const user = await requireUser(request);
    const body = request.body as { city?: string; neighborhood?: string; neighborhoods?: string[]; filters?: Partial<SearchFilters> };
    const neighborhoods = normalizeNeighborhoods(body.neighborhoods ?? body.neighborhood);
    if (body.city !== "Rio de Janeiro" || !neighborhoods.length) {
      return reply.code(400).send({ error: "Selecione ao menos um bairro válido da Zona Sul do Rio de Janeiro." });
    }
    const filters = normalizeSearchFilters(body.filters ?? {});
    const discovered = await collectSerperResults(body.city, neighborhoods, filters);
    const collection = {
      id: randomUUID(), collectedAt: new Date().toISOString(), city: body.city,
      neighborhood: neighborhoods.join(", "), query: discovered.query, filters,
      results: discovered.results, rawResponse: discovered.rawResponse,
    } as const;
    await saveSerperCollection(collection, user.id);
    const updated = await consumeSearchQuota(user.id);
    return { ...collection, searchesUsed: updated.searchesUsed, searchQuota: updated.searchQuota };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível consultar os portais.";
    return reply.code(message.includes("Limite") ? 403 : 500).send({ error: message });
  }
});

app.post("/api/search", async (request, reply) => {
  try {
    const count = Number((request.body as { count?: unknown }).count);
    if (!Number.isInteger(count) || count < 1 || count > 25) {
      return reply.code(400).send({ error: "Informe uma quantidade entre 1 e 25." });
    }
    const result = await runSearch(count);
    const run = { id: randomUUID(), searchedAt: new Date().toISOString(), requestedCount: count, ...result };
    await saveSearch(run);
    return run;
  } catch (error) {
    return reply.code(500).send(sendError(error, "Não foi possível pesquisar os anúncios.", 500));
  }
});

app.post("/api/analyze", async (request, reply) => {
  try {
    const body = request.body as { collectionId?: string; count?: unknown };
    const count = Number(body.count);
    if (!body.collectionId || !Number.isInteger(count) || count < 1 || count > 25) {
      return reply.code(400).send({ error: "Informe uma coleta e uma quantidade entre 1 e 25." });
    }
    const collection = await readSerperCollection(body.collectionId);
    const result = await analyzeSerperCollection(collection, count);
    const run = { id: randomUUID(), searchedAt: new Date().toISOString(), requestedCount: count, ...result };
    await saveSearch(run);
    return { ...run, collectionId: collection.id };
  } catch (error) {
    return reply.code(500).send(sendError(error, "Não foi possível analisar a coleta.", 500));
  }
});

app.post("/api/feedback", async (request, reply) => {
  const schema = z.object({
    link: z.url(),
    action: z.enum(["Gostei", "Não gostei", "Muito caro", "Muito longe", "Quero visitar", "Não mostrar mais", "Não abre o link", "Priorizar cobertura", "Descartar cobertura", "Revisar cobertura"]),
    note: z.string().max(500).optional(),
  });
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "Feedback inválido." });
  await appendFeedback({
    ...parsed.data,
    learning: `Feedback explícito: ${parsed.data.action}.`,
  });
  const user = await currentUser(request);
  await recordDecisionEvent({
    propertyId: await resolvePropertyIdByLink(parsed.data.link),
    userId: user?.id,
    eventType: `feedback_${parsed.data.action.toLowerCase().replaceAll(" ", "_")}`,
    source: "interface",
    reason: parsed.data.note ?? parsed.data.action,
    evidence: [parsed.data.link],
  });
  return { ok: true };
});

app.get("/api/playwright/portals", async (request, reply) => {
  try {
    const user = await requireUser(request);
    const query = request.query as { savedSearchId?: string; scope?: "manual" | "latest" };
    return readMultiPortalRunView({ savedSearchId: query.savedSearchId, scope: query.scope, userId: user.id });
  } catch (error) {
    const status = portalReadHttpStatus(error);
    return reply.code(status).send(sendError(error, "Não foi possível ler a coleta multiportal.", status));
  }
});

app.post("/api/playwright/portals", async (request, reply) => {
  try {
    const user = await requireUser(request);
    const body = request.body as { collectionId?: string; filters?: Partial<SearchFilters> };
    if (!body.collectionId) return reply.code(400).send({ error: "Informe a coleta." });
    await assignSearchRunUser(body.collectionId, user.id);
    const collection = await readSerperCollection(body.collectionId);
    const filters = normalizeSearchFilters(body.filters ?? collection.filters ?? {});
    const urls = collection.results.map((item) => item.url ?? item.link).filter((item): item is string => Boolean(item));
    const collected = await collectPortals({ urls, neighborhoods: normalizeNeighborhoods(collection.neighborhood), filters });
    const run: MultiPortalRun = {
      id: collection.id, collectionId: collection.id, collectedAt: new Date().toISOString(),
      filters, listings: collected.listings, sources: collected.sources,
    };
    const persisted = await saveMultiPortalRun(run);
    void evaluateAlertsForRun(persisted.id, { requireAnalysis: false }).catch(() => undefined);
    return { ...persisted, browser: collected.browser };
  } catch (error) {
    return reply.code(500).send(sendError(error, "Não foi possível executar a coleta multiportal.", 500));
  }
});

app.post("/api/map/geocode", async (request, reply) => {
  try {
    await requireUser(request);
    const properties = (request.body as { properties?: Parameters<typeof geocodeMapProperties>[0] }).properties ?? [];
    if (properties.length > 500) return reply.code(400).send({ error: "O mapa aceita no máximo 500 imóveis por vez." });
    return properties.length ? geocodeMapProperties(properties) : { groups: [], markers: [], mappedCount: 0, skippedCount: 0, inputCount: 0 };
  } catch (error) {
    return reply.code(500).send(sendError(error, "Não foi possível montar o mapa.", 500));
  }
});

app.get("/api/control-panel", async (request, reply) => {
  try {
    const user = await requireUser(request);
    if (user.role !== "admin") return reply.code(403).send({ error: "Acesso restrito ao administrador." });
    return readControlPanelData();
  } catch (error) {
    return reply.code(401).send(sendError(error, "Não autenticado.", 401));
  }
});

app.get("/api/saved-searches", async (request, reply) => {
  try {
    const user = await requireUser(request);
    return { items: await readSavedSearches(50, user.id) };
  } catch (error) {
    return reply.code(401).send(sendError(error, "Não foi possível carregar pesquisas salvas.", 401));
  }
});

app.post("/api/saved-searches", async (request, reply) => {
  try {
    const user = await requireUser(request);
    const body = request.body as {
      city?: string; neighborhood?: string; neighborhoods?: string[]; filters?: Partial<SearchFilters>;
    };
    const neighborhoods = normalizeNeighborhoods(body.neighborhoods ?? body.neighborhood);
    if (!body.city?.trim() || !neighborhoods.length || !body.filters) {
      return reply.code(400).send({ error: "Informe cidade, ao menos um bairro e filtros válidos." });
    }
    return {
      item: await saveSavedSearch({
        userId: user.id,
        city: body.city.trim(),
        neighborhoods,
        filters: normalizeSearchFilters(body.filters),
      }),
    };
  } catch (error) {
    return reply.code(500).send(sendError(error, "Não foi possível salvar a pesquisa.", 500));
  }
});

app.patch("/api/saved-searches", async (request, reply) => {
  try {
    await requireUser(request);
    const body = request.body as {
      id?: string; city?: string; neighborhood?: string; neighborhoods?: string[]; filters?: Partial<SearchFilters>;
    };
    const neighborhoods = normalizeNeighborhoods(body.neighborhoods ?? body.neighborhood);
    if (!body.id?.trim() || !body.city?.trim() || !neighborhoods.length || !body.filters) {
      return reply.code(400).send({ error: "Informe o agendamento, a cidade, ao menos um bairro e filtros válidos." });
    }
    return {
      item: await updateSavedSearch({
        id: body.id.trim(), city: body.city.trim(), neighborhoods,
        filters: normalizeSearchFilters(body.filters),
      }),
    };
  } catch (error) {
    return reply.code(500).send(sendError(error, "Não foi possível atualizar o agendamento.", 500));
  }
});

app.delete("/api/saved-searches", async (request, reply) => {
  try {
    await requireUser(request);
    const id = (request.query as { id?: string }).id?.trim();
    if (!id) return reply.code(400).send({ error: "Informe o agendamento." });
    await deleteSavedSearch(id);
    return { ok: true };
  } catch (error) {
    return reply.code(500).send(sendError(error, "Não foi possível apagar o agendamento.", 500));
  }
});

app.get("/api/scheduler", async (request, reply) => {
  try {
    startScheduler();
    const user = await requireUser(request);
    return readSchedulerStatus(user.id);
  } catch (error) {
    return reply.code(401).send(sendError(error, "Não foi possível carregar o agendamento.", 401));
  }
});

app.patch("/api/scheduler", async (request, reply) => {
  try {
    const user = await requireUser(request);
    const body = request.body as {
      id?: string; analysisIntervalMinutes?: number; analysisBatchCount?: 5 | 10 | 15 | "all"; analysisEnabled?: boolean;
    };
    if (!body.id || typeof body.analysisEnabled !== "boolean" || !isAnalysisInterval(Number(body.analysisIntervalMinutes)) || !isAnalysisBatchCount(body.analysisBatchCount)) {
      return reply.code(400).send({ error: "Informe a pesquisa, o intervalo e a quantidade da análise." });
    }
    const item = await updateSavedSearchSchedule({
      id: body.id,
      analysisIntervalMinutes: Number(body.analysisIntervalMinutes) as AnalysisIntervalMinutes,
      analysisBatchCount: body.analysisBatchCount,
      analysisEnabled: body.analysisEnabled,
    });
    return { item, ...(await readSchedulerStatus(user.id)) };
  } catch (error) {
    return reply.code(400).send(sendError(error, "Não foi possível salvar o agendamento.", 400));
  }
});

app.delete("/api/scheduler", async (request, reply) => {
  try {
    await requireUser(request);
    const id = (request.query as { id?: string }).id?.trim();
    if (!id) return reply.code(400).send({ error: "Informe a execução." });
    await deleteSchedulerRun(id);
    return { ok: true, ...(await readSchedulerStatus()) };
  } catch (error) {
    return reply.code(500).send(sendError(error, "Não foi possível apagar a execução.", 500));
  }
});

app.post("/api/penthouse-disposition", async (request, reply) => {
  try {
    const user = await requireUser(request);
    const body = request.body as { link?: string; disposition?: "saved" | "dismissed" };
    if (!body.link || !body.disposition || !["saved", "dismissed"].includes(body.disposition)) {
      return reply.code(400).send({ error: "Informe o imóvel e a ação." });
    }
    const propertyId = await resolvePropertyIdByLink(body.link);
    if (!propertyId) return reply.code(404).send({ error: "Imóvel ainda não está no banco." });
    await setPenthouseDisposition({ userId: user.id, propertyId, link: body.link, disposition: body.disposition });
    return { saved: true };
  } catch (error) {
    return reply.code(400).send(sendError(error, "Não foi possível registrar a escolha.", 400));
  }
});

app.get("/api/admin/users", async (request, reply) => {
  const user = await requireUser(request).catch(() => undefined);
  if (!user || user.role !== "admin") return reply.code(403).send({ error: "Acesso restrito ao administrador." });
  return { users: await listUsersForAdmin() };
});

app.post("/api/admin/users", async (request, reply) => {
  try {
    const actor = await requireUser(request);
    if (actor.role !== "admin") return reply.code(403).send({ error: "Acesso restrito ao administrador." });
    const body = request.body as Parameters<typeof adminCreateUser>[0];
    return { user: await adminCreateUser(body) };
  } catch (error) {
    return reply.code(400).send(sendError(error, "Não foi possível criar o usuário.", 400));
  }
});

app.patch("/api/admin/users", async (request, reply) => {
  try {
    const actor = await requireUser(request);
    if (actor.role !== "admin") return reply.code(403).send({ error: "Acesso restrito ao administrador." });
    const body = request.body as Parameters<typeof adminUpdateUser>[0];
    return { user: await adminUpdateUser(body) };
  } catch (error) {
    return reply.code(400).send(sendError(error, "Não foi possível atualizar o usuário.", 400));
  }
});

app.delete("/api/admin/users", async (request, reply) => {
  try {
    const actor = await requireUser(request);
    if (actor.role !== "admin") return reply.code(403).send({ error: "Acesso restrito ao administrador." });
    const id = (request.query as { id?: string }).id;
    if (!id) return reply.code(400).send({ error: "Informe o usuário." });
    await adminDeleteUser(id, actor.id);
    return { removed: true };
  } catch (error) {
    return reply.code(400).send(sendError(error, "Não foi possível apagar o usuário.", 400));
  }
});

const CHAT_HOURLY_LIMIT = 60;

app.get("/api/chat/session", async (request, reply) => {
  try {
    const user = await requireUser(request);
    const sessionId = await getOrCreateChatSession(user.id);
    const messages = await readRecentChatMessages(sessionId, 40);
    return { sessionId, messages };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não autenticado.";
    return reply.code(message.includes("login") ? 401 : 500).send({ error: message });
  }
});

app.post("/api/chat", async (request, reply) => {
  try {
    const user = await requireUser(request);
    const turns = await countUserChatTurnsLastHour(user.id);
    if (turns >= CHAT_HOURLY_LIMIT) {
      return reply.code(429).send({ error: "Limite de mensagens do assistente atingido. Tente novamente em alguns minutos." });
    }
    const body = z
      .object({
        message: z.string().min(1).max(4000),
        context: z.preprocess(
          (value) => (value === undefined ? undefined : normalizeChatContextPayload(value)),
          chatClientContextSchema.optional(),
        ),
      })
      .parse(request.body);
    const sessionId = await getOrCreateChatSession(user.id);
    const prior = await readRecentChatMessages(sessionId, 40);
    const context = sanitizeChatContext(body.context);
    const researchInventory = buildChatInventorySummaries(
      await readUserResearchInventory(user.id),
    );
    await appendChatMessage({
      sessionId,
      role: "user",
      content: body.message.trim(),
    });
    const history = prior.map((item) => ({
      role: item.role,
      content: item.content,
    }));
    const assistant = await runChatAssistantTurn({
      userId: user.id,
      message: body.message,
      context,
      history,
      researchInventory,
    });
    await appendChatMessage({
      sessionId,
      role: "assistant",
      content: assistant.reply,
      metadata: {
        filterSuggestion: assistant.filterSuggestion,
        citedRules: assistant.citedRules,
        inScope: assistant.inScope,
        refused: assistant.refused,
      },
    });
    await recordDecisionEvent({
      userId: user.id,
      eventType: "chat_turn",
      source: "interface",
      reason: assistant.refused
        ? `off_topic:${body.message.trim().slice(0, 400)}`
        : body.message.trim().slice(0, 500),
      learningStatus: "pending",
    });
    return { sessionId, message: assistant };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return reply.code(400).send({
        error:
          "Contexto do assistente inválido (dados da tela). Atualize a página e tente de novo; se persistir, rebuild do backend.",
        details: error.issues.slice(0, 3),
      });
    }
    const message = error instanceof Error ? error.message : "Não foi possível conversar com o assistente.";
    const status = message.includes("login")
      ? 401
      : message.includes("OPENAI_API_KEY")
        ? 503
        : message.includes("Limite")
          ? 429
          : 400;
    return reply.code(status).send({ error: message });
  }
});

const whatsappRuleBodySchema = z.object({
  id: z.string().uuid().optional(),
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

function normalizeWhatsAppRuleConfigInput(
  config: Parameters<typeof normalizeAlertRuleConfig>[0],
) {
  return normalizeAlertRuleConfig({ ...config, notifyPhonesE164: [] });
}

async function whatsappRulesPayload(user: { id: string; role: "user" | "admin"; whatsappPhoneE164?: string }) {
  const admin = user.role === "admin";
  let evolutionConnection: Awaited<ReturnType<typeof readEvolutionConnectionHint>> | null = null;
  if (isEvolutionConfigured()) {
    try {
      evolutionConnection = await readEvolutionConnectionHint();
    } catch {
      evolutionConnection = null;
    }
  }
  return {
    rules: await listWhatsAppAlertRules({ userId: user.id, admin }),
    evolutionConfigured: isEvolutionConfigured(),
    evolutionConnection,
    whatsappPhoneE164: user.whatsappPhoneE164 ?? null,
  };
}

app.get("/api/whatsapp-alert-rules", async (request, reply) => {
  try {
    const user = await requireUser(request);
    return whatsappRulesPayload(user);
  } catch (error) {
    return reply.code(401).send(sendError(error, "Não autenticado.", 401));
  }
});

app.post("/api/whatsapp-alert-rules", async (request, reply) => {
  try {
    const user = await requireUser(request);
    const body = whatsappRuleBodySchema.parse(request.body);
    if (!body.config) return reply.code(400).send({ error: "Informe a configuração da regra." });
    const rule = await createWhatsAppAlertRule({
      config: normalizeWhatsAppRuleConfigInput(
        body.config as Parameters<typeof normalizeAlertRuleConfig>[0],
      ),
      createdBy: user.id,
    });
    return { rule };
  } catch (error) {
    return reply.code(400).send(sendError(error, "Não foi possível criar a regra.", 400));
  }
});

app.patch("/api/whatsapp-alert-rules", async (request, reply) => {
  try {
    const user = await requireUser(request);
    const body = whatsappRuleBodySchema.parse(request.body);
    if (!body.id) return reply.code(400).send({ error: "Informe a regra." });
    await assertWhatsAppRuleAccess(body.id, user.id, user.role === "admin");
    const rule = await updateWhatsAppAlertRule({
      id: body.id,
      enabled: body.enabled,
      config: body.config
        ? normalizeWhatsAppRuleConfigInput(
            body.config as Parameters<typeof normalizeAlertRuleConfig>[0],
          )
        : undefined,
    });
    return { rule };
  } catch (error) {
    return reply.code(400).send(sendError(error, "Não foi possível atualizar a regra.", 400));
  }
});

app.delete("/api/whatsapp-alert-rules", async (request, reply) => {
  try {
    const user = await requireUser(request);
    const id = (request.query as { id?: string }).id?.trim();
    if (!id) return reply.code(400).send({ error: "Informe a regra." });
    await assertWhatsAppRuleAccess(id, user.id, user.role === "admin");
    await deleteWhatsAppAlertRule(id);
    return { ok: true };
  } catch (error) {
    return reply.code(400).send(sendError(error, "Não foi possível apagar a regra.", 400));
  }
});

app.get("/api/whatsapp-alert-deliveries", async (request, reply) => {
  try {
    const user = await requireUser(request);
    const limit = Number((request.query as { limit?: string }).limit ?? 50);
    return {
      deliveries: await readRecentWhatsAppDeliveries(limit, {
        userId: user.id,
        admin: user.role === "admin",
      }),
    };
  } catch (error) {
    return reply.code(401).send(sendError(error, "Não autenticado.", 401));
  }
});

app.get("/api/admin/whatsapp-alert-rules", async (request, reply) => {
  try {
    const user = await requireUser(request);
    if (user.role !== "admin") return reply.code(403).send({ error: "Acesso restrito ao administrador." });
    return whatsappRulesPayload(user);
  } catch (error) {
    return reply.code(401).send(sendError(error, "Não autenticado.", 401));
  }
});

app.get("/api/admin/whatsapp-evolution/qr", async (request, reply) => {
  try {
    const user = await requireUser(request);
    if (user.role !== "admin") return reply.code(403).send({ error: "Acesso restrito ao administrador." });
    const result = await readEvolutionWhatsAppQr();
    if (!result.ok) {
      return reply.code(503).send(result);
    }
    return result;
  } catch (error) {
    return reply.code(400).send(sendError(error, "Não foi possível obter o QR.", 400));
  }
});

app.get("/api/admin/whatsapp-evolution/diagnostic", async (request, reply) => {
  try {
    const user = await requireUser(request);
    if (user.role !== "admin") return reply.code(403).send({ error: "Acesso restrito ao administrador." });
    return await runEvolutionWhatsAppDiagnostic();
  } catch (error) {
    return reply.code(400).send(sendError(error, "Diagnóstico falhou.", 400));
  }
});

app.post("/api/admin/whatsapp-alert-rules/test", async (request, reply) => {
  try {
    const user = await requireUser(request);
    if (user.role !== "admin") return reply.code(403).send({ error: "Acesso restrito ao administrador." });
    const body = z
      .object({ phone: z.string().min(10), text: z.string().min(1).max(500).optional() })
      .parse(request.body);
    const result = await runEvolutionWhatsAppDiagnostic({
      to: body.phone,
      text: body.text ?? "Teste do radar de imóveis — Evolution API conectada.",
    });
    if (!result.ok) {
      const message = result.log.find((entry) => entry.level === "error")?.message ?? "Falha no teste WhatsApp.";
      return reply.code(400).send({
        error: message,
        log: result.log,
        ok: false,
        connectionStatus: result.connectionStatus,
        qrDataUrl: result.qrDataUrl,
        pairingCode: result.pairingCode,
      });
    }
    return {
      ok: true,
      providerMessageId: result.providerMessageId,
      log: result.log,
      connectionStatus: result.connectionStatus,
      qrDataUrl: result.qrDataUrl,
      pairingCode: result.pairingCode,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no teste WhatsApp.";
    const log = (error as { log?: unknown }).log;
    const status = message.includes("não configurado") ? 503 : 400;
    return reply.code(status).send({ error: message, log: Array.isArray(log) ? log : undefined, ok: false });
  }
});

app.get("/api/admin/decision-events", async (request, reply) => {
  try {
    const user = await requireUser(request);
    if (user.role !== "admin") return reply.code(403).send({ error: "Acesso restrito ao administrador." });
    return { items: await readDecisionEvents({}) };
  } catch (error) {
    return reply.code(401).send(sendError(error, "Não autenticado.", 401));
  }
});

app.setNotFoundHandler((request, reply) =>
  reply.code(404).send({ error: `Rota não encontrada: ${request.method} ${request.url}` }),
);

startScheduler();
const port = Number(process.env.API_PORT ?? 3001);
await app.listen({ port, host: process.env.API_HOST ?? "0.0.0.0" });
