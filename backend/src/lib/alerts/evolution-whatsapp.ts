import { existsSync } from "node:fs";
import type { AlertChannel, AlertSendInput, AlertSendResult } from "./channels";

/** Evolution costuma rodar no host (docker/evolution); o backend em container não alcança 127.0.0.1:8080 local. */
export function resolveEvolutionBaseUrl(raw: string) {
  const trimmed = raw.replace(/\/$/, "");
  const inContainer =
    process.env.BACKEND_IN_DOCKER === "true" || existsSync("/.dockerenv");
  if (!inContainer) return trimmed;
  return trimmed
    .replace(/:\/\/127\.0\.0\.1(?=[:/]|$)/i, "://host.docker.internal")
    .replace(/:\/\/localhost(?=[:/]|$)/i, "://host.docker.internal");
}

function evolutionConfig() {
  const configured = process.env.EVOLUTION_API_URL?.trim();
  const baseUrl = configured ? resolveEvolutionBaseUrl(configured) : undefined;  const apiKey = process.env.EVOLUTION_API_KEY?.trim();
  const instance = process.env.EVOLUTION_INSTANCE_NAME?.trim();
  if (!baseUrl || !apiKey || !instance) {
    throw new Error(
      "WhatsApp não configurado: defina EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE_NAME em backend/.env.",
    );
  }
  return { baseUrl, apiKey, instance };
}

function evolutionHeaders(apiKey: string, json = false) {
  const headers: Record<string, string> = { apikey: apiKey };
  if (json) headers["content-type"] = "application/json";
  return headers;
}

type EvolutionInstanceRow = {
  name?: string;
  instanceName?: string;
  instance?: { instanceName?: string; status?: string };
  connectionStatus?: string;
};

async function fetchEvolutionInstances(baseUrl: string, apiKey: string) {
  try {
    const response = await fetch(`${baseUrl}/instance/fetchInstances`, {
      headers: evolutionHeaders(apiKey),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as unknown;
    return Array.isArray(payload) ? (payload as EvolutionInstanceRow[]) : [];
  } catch {
    return [];
  }
}

function evolutionInstanceName(row: EvolutionInstanceRow) {
  return row.instanceName ?? row.name ?? row.instance?.instanceName ?? "";
}

export async function ensureEvolutionInstance() {
  const { baseUrl, apiKey, instance } = evolutionConfig();
  const instances = await fetchEvolutionInstances(baseUrl, apiKey);
  const exists = instances.some((row) => evolutionInstanceName(row) === instance);
  if (exists) return { created: false, instanceName: instance };

  const response = await fetch(`${baseUrl}/instance/create`, {
    method: "POST",
    headers: evolutionHeaders(apiKey, true),
    body: JSON.stringify({
      instanceName: instance,
      integration: "WHATSAPP-BAILEYS",
      qrcode: true,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Não foi possível criar a instância "${instance}" na Evolution (HTTP ${response.status}). ${detail.slice(0, 200)}`.trim(),
    );
  }
  return { created: true, instanceName: instance };
}

export async function readEvolutionConnectionHint() {
  const { baseUrl, apiKey, instance } = evolutionConfig();
  const instances = await fetchEvolutionInstances(baseUrl, apiKey);
  const row = instances.find((item) => evolutionInstanceName(item) === instance);
  if (!row) {
    return {
      instanceName: instance,
      exists: false,
      hint: `Instância "${instance}" ainda não existe. Use "Enviar teste" para criá-la ou POST /instance/create na Evolution.`,
    };
  }
  const status = row.connectionStatus ?? row.instance?.status ?? "unknown";
  return {
    instanceName: instance,
    exists: true,
    status,
    hint:
      status === "open"
        ? "WhatsApp conectado."
        : `Instância criada, mas WhatsApp não conectado (status: ${status}). Escaneie o QR: GET ${baseUrl}/instance/connect/${instance}`,
  };
}

function formatEvolutionSendError(error: unknown) {
  const message = error instanceof Error ? error.message : "Falha ao enviar WhatsApp.";
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|ECONNRESET/i.test(message)) {
    const inContainer =
      process.env.BACKEND_IN_DOCKER === "true" || existsSync("/.dockerenv");
    const url = process.env.EVOLUTION_API_URL ?? "http://127.0.0.1:8080";
    const resolved = resolveEvolutionBaseUrl(url);
    const dockerHint = inContainer
      ? ` Backend em Docker: Evolution no host em ${resolved}. Se a stack Evolution publicar só 127.0.0.1:8080, recrie com \`npm run docker:evolution:up\` (porta 8080:8080).`
      : "";
    return new Error(
      `Evolution API inacessível (${resolved}). Rode \`npm run docker:evolution:up\` (WSL/Docker Desktop), confira http://127.0.0.1:8080 no host e conecte o QR.${dockerHint}`,
    );
  }
  if (/HTTP 404/.test(message)) {
    const { instance } = evolutionConfig();
    return new Error(
      `Instância "${instance}" não existe na Evolution (HTTP 404). O teste tenta criá-la automaticamente; se persistir, abra ${process.env.EVOLUTION_API_URL?.replace(/\/$/, "")}/instance/connect/${instance} e escaneie o QR Code.`,
    );
  }
  return error instanceof Error ? error : new Error(message);
}

export function isEvolutionConfigured() {
  return Boolean(
    process.env.EVOLUTION_API_URL?.trim() &&
      process.env.EVOLUTION_API_KEY?.trim() &&
      process.env.EVOLUTION_INSTANCE_NAME?.trim(),
  );
}

export class EvolutionWhatsAppChannel implements AlertChannel {
  async send(input: AlertSendInput): Promise<AlertSendResult> {
    await ensureEvolutionInstance();
    const { baseUrl, apiKey, instance } = evolutionConfig();
    const number = input.to.replace(/\D/g, "");
    const url = `${baseUrl}/message/sendText/${encodeURIComponent(instance)}`;
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            apikey: apiKey,
          },
          body: JSON.stringify({ number, text: input.text.slice(0, 1500), linkPreview: true }),
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          throw new Error(`Evolution API respondeu HTTP ${response.status}. ${detail.slice(0, 240)}`.trim());
        }
        const payload = (await response.json()) as { key?: { id?: string } };
        return { providerMessageId: payload.key?.id };
      } catch (error) {
        lastError = formatEvolutionSendError(error);
      }
    }
    throw lastError ?? new Error("Falha ao enviar WhatsApp.");
  }
}

export type EvolutionDiagnosticEntry = {
  level: "info" | "ok" | "warn" | "error";
  message: string;
};

function maskApiKey(apiKey: string) {
  if (apiKey.length <= 4) return "****";
  return `***${apiKey.slice(-4)}`;
}

function extractQrFromConnectPayload(body: string) {
  try {
    const payload = JSON.parse(body) as Record<string, unknown>;
    const nested = payload.qrcode as Record<string, unknown> | undefined;
    const raw =
      payload.base64 ??
      nested?.base64 ??
      payload.code ??
      nested?.code ??
      (typeof payload.qrcode === "string" ? payload.qrcode : undefined);
    const pairingCode =
      typeof payload.pairingCode === "string"
        ? payload.pairingCode
        : typeof nested?.pairingCode === "string"
          ? nested.pairingCode
          : undefined;
    if (typeof raw !== "string" || !raw.trim()) {
      return { pairingCode };
    }
    const trimmed = raw.trim();
    const qrDataUrl = trimmed.startsWith("data:")
      ? trimmed
      : `data:image/png;base64,${trimmed.replace(/^data:image\/[a-z+]+;base64,/, "")}`;
    return { qrDataUrl, pairingCode };
  } catch {
    return {};
  }
}

async function evolutionHttpStep(
  log: EvolutionDiagnosticEntry[],
  label: string,
  run: () => Promise<Response>,
  options?: { logBody?: boolean },
) {
  try {
    const response = await run();
    const body = await response.text().catch(() => "");
    let snippet = "";
    if (options?.logBody !== false) {
      snippet = body.replace(/\s+/g, " ").slice(0, 280);
    }
    const level = response.ok ? "ok" : "warn";
    log.push({
      level,
      message: `${label}: HTTP ${response.status}${snippet ? ` — ${snippet}` : ""}`,
    });
    return { response, body };
  } catch (error) {
    const message = error instanceof Error ? error.message : "falha de rede";
    log.push({ level: "error", message: `${label}: ${message}` });
    return undefined;
  }
}

export async function readEvolutionWhatsAppQr() {
  const log: EvolutionDiagnosticEntry[] = [];
  try {
    if (!isEvolutionConfigured()) {
      return { ok: false, log, error: "Evolution não configurada no backend." };
    }
    const { baseUrl, apiKey, instance } = evolutionConfig();
    log.push({ level: "info", message: `Evolution efetiva: ${baseUrl}` });
    const instances = await fetchEvolutionInstances(baseUrl, apiKey);
    const row = instances.find((item) => evolutionInstanceName(item) === instance);
    const connectionStatus = row?.connectionStatus ?? row?.instance?.status ?? "unknown";

    let connect: Response;
    try {
      connect = await fetch(`${baseUrl}/instance/connect/${encodeURIComponent(instance)}`, {
        headers: evolutionHeaders(apiKey),
        signal: AbortSignal.timeout(25_000),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "falha de rede";
      log.push({ level: "error", message: `connect: ${message}` });
      return {
        ok: false,
        instanceName: instance,
        connectionStatus,
        log,
        error: formatEvolutionSendError(error).message,
      };
    }
    const body = await connect.text().catch(() => "");
    if (!connect.ok) {
      log.push({ level: "error", message: `connect HTTP ${connect.status}: ${body.slice(0, 200)}` });
      return {
        ok: false,
        instanceName: instance,
        connectionStatus,
        log,
        error: `Evolution respondeu HTTP ${connect.status} no connect.`,
      };
    }
    log.push({ level: "ok", message: "QR Code obtido da Evolution." });
    const { qrDataUrl, pairingCode } = extractQrFromConnectPayload(body);
    return {
      ok: true,
      instanceName: instance,
      connectionStatus,
      qrDataUrl,
      pairingCode,
      log,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao obter QR.";
    log.push({ level: "error", message });
    return { ok: false, log, error: formatEvolutionSendError(error).message };
  }
}

export async function runEvolutionWhatsAppDiagnostic(input?: { to?: string; text?: string }) {
  const log: EvolutionDiagnosticEntry[] = [];
  const push = (level: EvolutionDiagnosticEntry["level"], message: string) => log.push({ level, message });

  if (!isEvolutionConfigured()) {
    push("error", "Variáveis EVOLUTION_API_URL, EVOLUTION_API_KEY ou EVOLUTION_INSTANCE_NAME ausentes no backend.");
    return { ok: false, log };
  }

  let baseUrl: string;
  let apiKey: string;
  let instance: string;
  try {
    ({ baseUrl, apiKey, instance } = evolutionConfig());
  } catch (error) {
    push("error", error instanceof Error ? error.message : "Configuração inválida.");
    return { ok: false, log };
  }

  push("info", `Evolution URL: ${baseUrl}`);
  push("info", `Instância configurada: ${instance}`);
  push("info", `API key (backend): ${maskApiKey(apiKey)}`);

  const listed = await evolutionHttpStep(log, "GET /instance/fetchInstances", () =>
    fetch(`${baseUrl}/instance/fetchInstances`, {
      headers: evolutionHeaders(apiKey),
      signal: AbortSignal.timeout(15_000),
    }),
  );

  let instances: EvolutionInstanceRow[] = [];
  if (listed?.response.ok) {
    try {
      const payload = JSON.parse(listed.body) as unknown;
      instances = Array.isArray(payload) ? (payload as EvolutionInstanceRow[]) : [];
      const names = instances.map(evolutionInstanceName).filter(Boolean);
      push("info", names.length ? `Instâncias na Evolution: ${names.join(", ")}` : "Nenhuma instância listada ainda.");
    } catch {
      push("warn", "Resposta de fetchInstances não é JSON válido.");
    }
  }

  let connectionStatus = "unknown";
  const exists = instances.some((row) => evolutionInstanceName(row) === instance);
  if (!exists) {
    push("warn", `Instância "${instance}" não encontrada — tentando criar…`);
    const created = await evolutionHttpStep(log, "POST /instance/create", () =>
      fetch(`${baseUrl}/instance/create`, {
        method: "POST",
        headers: evolutionHeaders(apiKey, true),
        body: JSON.stringify({
          instanceName: instance,
          integration: "WHATSAPP-BAILEYS",
          qrcode: true,
        }),
        signal: AbortSignal.timeout(30_000),
      }),
    );
    if (!created?.response.ok) {
      push("error", "Não foi possível criar a instância. Verifique apikey (header apikey:) e logs do container Evolution.");
      return { ok: false, log };
    }
    push("ok", `Instância "${instance}" criada.`);
  } else {
    const row = instances.find((item) => evolutionInstanceName(item) === instance);
    connectionStatus = row?.connectionStatus ?? row?.instance?.status ?? "desconhecido";
    push("info", `Instância "${instance}" existe (status: ${connectionStatus}).`);
    if (connectionStatus !== "open") {
      push("warn", "WhatsApp ainda não conectado — use o botão «Mostrar QR» no painel e escaneie no celular.");
    }
  }

  const connect = await evolutionHttpStep(
    log,
    "GET /instance/connect",
    () =>
      fetch(`${baseUrl}/instance/connect/${encodeURIComponent(instance)}`, {
        headers: evolutionHeaders(apiKey),
        signal: AbortSignal.timeout(20_000),
      }),
    { logBody: false },
  );
  let qrDataUrl: string | undefined;
  let pairingCode: string | undefined;
  if (connect?.response.ok) {
    const qr = extractQrFromConnectPayload(connect.body);
    qrDataUrl = qr.qrDataUrl;
    pairingCode = qr.pairingCode;
    log.push({
      level: qrDataUrl || pairingCode ? "ok" : "warn",
      message: qrDataUrl
        ? "QR Code disponível no painel (Mostrar QR)."
        : pairingCode
          ? `Código de pareamento: ${pairingCode}`
          : "Connect OK, mas sem QR na resposta (pode já estar conectando).",
    });
  }

  const to = input?.to?.replace(/\D/g, "") ?? "";
  if (!to || to.length < 10) {
    push("info", "Informe um telefone no teste para enviar mensagem (mín. 10 dígitos).");
    return { ok: true, log, connectionOnly: true as const, connectionStatus, qrDataUrl, pairingCode };
  }

  if (connectionStatus !== "open") {
    push(
      "error",
      `Envio cancelado: status "${connectionStatus}" (precisa "open"). Escaneie o QR e aguarde ~30s antes de testar de novo.`,
    );
    return { ok: false, log, connectionStatus, qrDataUrl, pairingCode };
  }

  const message = input?.text ?? "Teste do radar de imóveis — Evolution API conectada.";
  push("info", `Enviando teste para ${to}…`);
  const sent = await evolutionHttpStep(log, "POST /message/sendText", () =>
    fetch(`${baseUrl}/message/sendText/${encodeURIComponent(instance)}`, {
      method: "POST",
      headers: evolutionHeaders(apiKey, true),
      body: JSON.stringify({ number: to, text: message.slice(0, 1500), linkPreview: true }),
      signal: AbortSignal.timeout(30_000),
    }),
  );

  if (!sent?.response.ok) {
    push("error", "Envio falhou. Se status ≠ open, conecte o QR antes de enviar.");
    return { ok: false, log };
  }

  let providerMessageId: string | undefined;
  try {
    const payload = JSON.parse(sent.body) as { key?: { id?: string } };
    providerMessageId = payload.key?.id;
    push("ok", providerMessageId ? `Mensagem enviada (id ${providerMessageId}).` : "Mensagem enviada.");
  } catch {
    push("ok", "Mensagem enviada (resposta sem JSON esperado).");
  }

  return { ok: true, log, providerMessageId, connectionStatus, qrDataUrl, pairingCode };
}

export async function sendEvolutionTestMessage(to: string, text: string) {
  const result = await runEvolutionWhatsAppDiagnostic({ to, text });
  if (!result.ok) {
    const detail = result.log.find((entry) => entry.level === "error")?.message ?? "Falha no teste WhatsApp.";
    const error = new Error(detail) as Error & { log?: EvolutionDiagnosticEntry[] };
    error.log = result.log;
    throw error;
  }
  return { providerMessageId: result.providerMessageId };
}
