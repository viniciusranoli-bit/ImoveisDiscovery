"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { readApiJson } from "@/app/lib/api-proxy";

type SaleCategory = "slab_rights" | "balcony_barbecue" | "both" | "ambiguous" | "none";

type WhatsAppRule = {
  id: string;
  name: string;
  enabled: boolean;
  config: {
    name: string;
    purpose: "rent" | "sale" | "both";
    propertyTypes: Array<"apartment" | "penthouse">;
    priceMin?: number;
    priceMax?: number;
    bedroomsMin?: number;
    parkingMin?: number;
    locationStatuses: Array<"confirmed" | "unknown">;
    saleApartmentCategories: SaleCategory[];
    notifyPhonesE164: string[];
    cooldownMinutes: number;
  };
};

type Delivery = {
  id: string;
  ruleName: string;
  listingLink: string | null;
  status: string;
  error: string | null;
  sentAt: string;
};

type LogEntry = {
  id: string;
  at: string;
  level: "info" | "ok" | "warn" | "error";
  message: string;
};

type DiagnosticLogLine = { level: LogEntry["level"]; message: string };

const defaultForm = {
  name: "Alerta compra interesse",
  purpose: "sale" as const,
  propertyTypes: ["apartment", "penthouse"] as Array<"apartment" | "penthouse">,
  priceMax: 2_000_000,
  bedroomsMin: 2,
  parkingMin: 1,
  locationConfirmed: true,
  locationUnknown: false,
  categories: ["both", "slab_rights", "balcony_barbecue", "ambiguous"] as SaleCategory[],
  cooldownMinutes: 1440,
};

type PropertyType = "apartment" | "penthouse";

function togglePropertyType(current: PropertyType[], value: PropertyType, checked: boolean): PropertyType[] {
  return checked ? [...new Set([...current, value])] : current.filter((item) => item !== value);
}

function stampLog(prefix: string, lines: DiagnosticLogLine[]): LogEntry[] {
  const at = new Date().toLocaleTimeString("pt-BR");
  return lines.map((line, index) => ({
    id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    at,
    level: line.level,
    message: `${prefix}${line.message}`,
  }));
}

type WhatsAppAlertRulesAdminProps = {
  isAdmin?: boolean;
};

export function WhatsAppAlertRulesAdmin({ isAdmin = false }: WhatsAppAlertRulesAdminProps) {
  const [rules, setRules] = useState<WhatsAppRule[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [evolutionConfigured, setEvolutionConfigured] = useState(false);
  const [profilePhone, setProfilePhone] = useState<string | null>(null);
  const [evolutionHint, setEvolutionHint] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState(defaultForm);
  const [testPhone, setTestPhone] = useState("");
  const [activityLog, setActivityLog] = useState<LogEntry[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null);

  const appendLog = useCallback((lines: DiagnosticLogLine[], prefix = "") => {
    if (!lines.length) return;
    setActivityLog((previous) => [...stampLog(prefix, lines), ...previous].slice(0, 120));
  }, []);

  const pushLocal = useCallback((level: LogEntry["level"], message: string) => {
    appendLog([{ level, message }], "[UI] ");
  }, [appendLog]);

  const refresh = useCallback(async () => {
    pushLocal("info", "Carregando regras e entregas…");
    const [rulesResponse, deliveriesResponse] = await Promise.all([
      fetch("/api/whatsapp-alert-rules", { cache: "no-store" }),
      fetch("/api/whatsapp-alert-deliveries?limit=30", { cache: "no-store" }),
    ]);
    const rulesData = await readApiJson<{
      rules?: WhatsAppRule[];
      evolutionConfigured?: boolean;
      whatsappPhoneE164?: string | null;
      evolutionConnection?: { hint?: string; status?: string; exists?: boolean } | null;
      error?: string;
    }>(rulesResponse);
    const deliveriesData = await readApiJson<{ deliveries?: Delivery[]; error?: string }>(deliveriesResponse);
    if (!rulesResponse.ok) throw new Error(rulesData.error ?? "Não foi possível carregar regras.");
    if (!deliveriesResponse.ok) throw new Error(deliveriesData.error ?? "Não foi possível carregar entregas.");
    setRules(rulesData.rules ?? []);
    setEvolutionConfigured(Boolean(rulesData.evolutionConfigured));
    setProfilePhone(rulesData.whatsappPhoneE164 ?? null);
    setEvolutionHint(rulesData.evolutionConnection?.hint ?? null);
    setDeliveries(deliveriesData.deliveries ?? []);
    pushLocal("ok", `Regras: ${rulesData.rules?.length ?? 0}; entregas: ${deliveriesData.deliveries?.length ?? 0}.`);
  }, [pushLocal]);

  const applyDiagnosticMeta = useCallback(
    (data: { qrDataUrl?: string; pairingCode?: string; connectionStatus?: string }) => {
      if (data.qrDataUrl) setQrDataUrl(data.qrDataUrl);
      if (data.pairingCode) setPairingCode(data.pairingCode);
      if (data.connectionStatus) setConnectionStatus(data.connectionStatus);
    },
    [],
  );

  const loadQr = useCallback(async () => {
    pushLocal("info", "Obtendo QR Code…");
    let response: Response;
    try {
      response = await fetch("/api/admin/whatsapp-evolution/qr", {
        cache: "no-store",
        signal: AbortSignal.timeout(90_000),
      });
    } catch (requestError) {
      const hint =
        requestError instanceof Error && requestError.name === "TimeoutError"
          ? "Tempo esgotado — Evolution demorou ou API offline."
          : "Rede/API indisponível. Dev: npm run dev (3005→3006). Docker: localhost:3000 e backend healthy.";
      throw new Error(hint);
    }
    let data: {
      log?: DiagnosticLogLine[];
      qrDataUrl?: string;
      pairingCode?: string;
      connectionStatus?: string;
      error?: string;
    };
    try {
      data = await readApiJson(response);
    } catch {
      throw new Error(`Resposta inválida (HTTP ${response.status}). Reinicie backend/frontend após deploy.`);
    }
    if (data.log?.length) appendLog(data.log, "[qr] ");
    applyDiagnosticMeta(data);
    if (!response.ok) throw new Error(data.error ?? "Não foi possível obter o QR.");
    if (data.connectionStatus === "open") {
      pushLocal("ok", "WhatsApp já conectado (status open).");
      setQrDataUrl(null);
    } else if (data.qrDataUrl) {
      pushLocal("ok", "QR exibido — escaneie no WhatsApp (Aparelhos conectados).");
    } else if (data.pairingCode) {
      pushLocal("warn", `Use o código de pareamento: ${data.pairingCode}`);
    }
  }, [appendLog, applyDiagnosticMeta, pushLocal]);

  const runDiagnostic = useCallback(async () => {
    pushLocal("info", "Diagnóstico Evolution (sem enviar mensagem)…");
    const response = await fetch("/api/admin/whatsapp-evolution/diagnostic", { cache: "no-store" });
    const data = await readApiJson<{
      log?: DiagnosticLogLine[];
      ok?: boolean;
      error?: string;
      qrDataUrl?: string;
      pairingCode?: string;
      connectionStatus?: string;
    }>(response);
    if (data.log?.length) appendLog(data.log, "[diag] ");
    applyDiagnosticMeta(data);
    if (!response.ok) throw new Error(data.error ?? "Diagnóstico falhou.");
    pushLocal(data.ok ? "ok" : "warn", data.ok ? "Diagnóstico concluído." : "Diagnóstico com avisos.");
  }, [applyDiagnosticMeta, pushLocal]);

  useEffect(() => {
    refresh().catch((requestError) => {
      setError(requestError instanceof Error ? requestError.message : "Erro ao carregar WhatsApp.");
    });
  }, [refresh]);

  useEffect(() => {
    if (!isAdmin || !evolutionConfigured) return;
    runDiagnostic().catch((requestError) => {
      pushLocal("error", requestError instanceof Error ? requestError.message : "Diagnóstico falhou.");
    });
  }, [isAdmin, evolutionConfigured, runDiagnostic, pushLocal]);

  async function submitRule(event: FormEvent) {
    event.preventDefault();
    setError("");
    setStatus("");
    pushLocal("info", "Criando regra…");
    const locationStatuses: Array<"confirmed" | "unknown"> = [];
    if (form.locationConfirmed) locationStatuses.push("confirmed");
    if (form.locationUnknown) locationStatuses.push("unknown");
    const response = await fetch("/api/whatsapp-alert-rules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        config: {
          name: form.name,
          purpose: form.purpose,
          propertyTypes: form.propertyTypes,
          priceMax: form.priceMax,
          bedroomsMin: form.bedroomsMin,
          parkingMin: form.parkingMin,
          locationStatuses: locationStatuses.length ? locationStatuses : ["confirmed"],
          saleApartmentCategories: form.categories.filter((item) => item !== "none"),
          cooldownMinutes: form.cooldownMinutes,
        },
      }),
    });
    const data = await readApiJson<{ error?: string }>(response);
    if (!response.ok) throw new Error(data.error ?? "Não foi possível salvar.");
    setStatus("Regra criada.");
    pushLocal("ok", `Regra "${form.name}" criada.`);
    await refresh();
  }

  async function toggleRule(rule: WhatsAppRule) {
    await fetch("/api/whatsapp-alert-rules", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: rule.id, enabled: !rule.enabled }),
    });
    await refresh();
  }

  async function removeRule(id: string) {
    await fetch(`/api/whatsapp-alert-rules?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await refresh();
  }

  async function sendTest() {
    setError("");
    setStatus("");
    pushLocal("info", `Teste Evolution para ${testPhone || "(vazio)"}…`);
    let response: Response;
    try {
      response = await fetch("/api/admin/whatsapp-alert-rules/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: testPhone }),
      });
    } catch {
      throw new Error(
        "Não foi possível contactar a API. Dev: `npm run dev` (3005/3006). Docker: frontend :3000 → backend :3001; Evolution no host (8080) com host.docker.internal no backend.",
      );
    }
    const data = await readApiJson<{
      error?: string;
      log?: DiagnosticLogLine[];
      ok?: boolean;
      providerMessageId?: string;
      qrDataUrl?: string;
      pairingCode?: string;
      connectionStatus?: string;
    }>(response);
    if (data.log?.length) appendLog(data.log, "[teste] ");
    applyDiagnosticMeta(data);
    if (!response.ok) throw new Error(data.error ?? "Teste falhou.");
    setStatus(data.providerMessageId ? `Mensagem enviada (id ${data.providerMessageId}).` : "Mensagem de teste enviada.");
    pushLocal("ok", "Teste concluído com sucesso.");
  }

  return (
    <div className="whatsapp-admin-layout">
      <section className="whatsapp-admin" aria-labelledby="whatsapp-admin-title">
        <h3 id="whatsapp-admin-title">Alertas WhatsApp</h3>
        <p className="hint">
          Os avisos são enviados somente para o WhatsApp cadastrado no seu usuário
          {profilePhone ? ` (${profilePhone}).` : " — peça ao administrador para cadastrar o número."}
          {isAdmin && (
            <>
              {" "}
              Evolution local: <code>docker/evolution</code>.
              {evolutionConfigured
                ? " Variáveis no backend OK — suba a stack Docker e conecte o QR."
                : " Variáveis Evolution ausentes no backend."}
            </>
          )}
        </p>
        {evolutionHint && <p className="hint">{evolutionHint}</p>}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {status && <p role="status">{status}</p>}
        <form
          className="whatsapp-admin-form"
          onSubmit={(event) => void submitRule(event).catch((e) => setError(String(e)))}
        >
          <label>
            Nome da regra
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </label>
          <label>
            Finalidade
            <select
              value={form.purpose}
              onChange={(event) => setForm({ ...form, purpose: event.target.value as typeof form.purpose })}
            >
              <option value="sale">Compra</option>
              <option value="rent">Aluguel</option>
              <option value="both">Ambos</option>
            </select>
          </label>
          <label>
            Preço máximo
            <input
              type="number"
              value={form.priceMax}
              onChange={(event) => setForm({ ...form, priceMax: Number(event.target.value) })}
            />
          </label>
          <fieldset>
            <legend>Tipos</legend>
            <label>
              <input
                type="checkbox"
                checked={form.propertyTypes.includes("apartment")}
                onChange={(event) =>
                  setForm({
                    ...form,
                    propertyTypes: togglePropertyType(form.propertyTypes, "apartment", event.target.checked),
                  })
                }
              />
              Apartamento
            </label>
            <label>
              <input
                type="checkbox"
                checked={form.propertyTypes.includes("penthouse")}
                onChange={(event) =>
                  setForm({
                    ...form,
                    propertyTypes: togglePropertyType(form.propertyTypes, "penthouse", event.target.checked),
                  })
                }
              />
              Cobertura
            </label>
          </fieldset>
          <fieldset>
            <legend>Apartamento compra — categorias IA</legend>
            {(["both", "slab_rights", "balcony_barbecue", "ambiguous"] as SaleCategory[]).map((category) => (
              <label key={category}>
                <input
                  type="checkbox"
                  checked={form.categories.includes(category)}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      categories: event.target.checked
                        ? [...form.categories, category]
                        : form.categories.filter((item) => item !== category),
                    })
                  }
                />
                {category}
              </label>
            ))}
          </fieldset>
          {!profilePhone && (
            <p className="hint" role="status">
              Sem WhatsApp no seu usuário, a regra é salva mas os avisos só passam a ser enviados depois que o número for
              cadastrado (Admin → usuários).
            </p>
          )}
          <button type="submit">Criar regra</button>
        </form>
        {isAdmin && (
          <div className="whatsapp-test-row">
            <input
              value={testPhone}
              onChange={(event) => setTestPhone(event.target.value)}
              placeholder="Telefone teste"
            />
            <button
              type="button"
              className="secondary-button"
              onClick={() => void sendTest().catch((e) => setError(String(e)))}
            >
              Enviar teste Evolution
            </button>
          </div>
        )}
        <h4>Regras</h4>
        <ul className="whatsapp-rules-list">
          {rules.map((rule) => (
            <li key={rule.id}>
              <strong>{rule.name}</strong> · {rule.enabled ? "ativa" : "inativa"}
              {profilePhone ? ` · envio para ${profilePhone}` : ""}
              <div>
                <button type="button" onClick={() => void toggleRule(rule)}>
                  {rule.enabled ? "Desativar" : "Ativar"}
                </button>
                <button type="button" className="danger-button" onClick={() => void removeRule(rule.id)}>
                  Apagar
                </button>
              </div>
            </li>
          ))}
        </ul>
        <h4>Entregas recentes</h4>
        <div className="admin-users-table-wrap">
          <table className="admin-users-table">
            <thead>
              <tr>
                <th>Regra</th>
                <th>Status</th>
                <th>Quando</th>
                <th>Erro</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((item) => (
                <tr key={item.id}>
                  <td>{item.ruleName}</td>
                  <td>{item.status}</td>
                  <td>{new Date(item.sentAt).toLocaleString("pt-BR")}</td>
                  <td>{item.error ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {isAdmin && (
        <aside className="whatsapp-activity-log" aria-label="Log de atividade WhatsApp">
          <h4>Log ao vivo</h4>
          {connectionStatus && (
            <p className="hint" style={{ color: "#94a3b8", margin: "0 0 8px" }}>
              Status Evolution: <strong>{connectionStatus}</strong>
              {connectionStatus !== "open" ? " — escaneie o QR antes de enviar." : " — pronto para enviar."}
            </p>
          )}
          {qrDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="QR Code WhatsApp Evolution" style={{ width: "100%", maxWidth: 280, marginBottom: 10, background: "#fff", borderRadius: 8 }} />
          )}
          {pairingCode && !qrDataUrl && (
            <p className="hint" style={{ color: "#fde047" }}>
              Código pareamento: {pairingCode}
            </p>
          )}
          <div className="whatsapp-log-toolbar">
            <button type="button" className="secondary-button" onClick={() => void loadQr().catch((e) => setError(e instanceof Error ? e.message : String(e)))}>
              Mostrar QR
            </button>
            <button type="button" className="secondary-button" onClick={() => void runDiagnostic().catch((e) => setError(e instanceof Error ? e.message : String(e)))}>
              Diagnóstico
            </button>
            <button type="button" className="secondary-button" onClick={() => setActivityLog([])}>
              Limpar
            </button>
          </div>
          {activityLog.length ? (
            <ol>
              {activityLog.map((entry) => (
                <li key={entry.id} data-level={entry.level}>
                  [{entry.at}] {entry.message}
                </li>
              ))}
            </ol>
          ) : (
            <p>Aguardando ações…</p>
          )}
        </aside>
      )}
    </div>
  );
}
