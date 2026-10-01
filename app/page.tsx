"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  matchesSearchFilters,
  type MultiPortalRun,
  type PropertyType,
  type SearchFilters,
} from "@/lib/listings";
import type { SavedPropertyAnalysis } from "@/lib/property-analysis";
import { southZoneNeighborhoods } from "@/lib/neighborhoods";
import { rentHistoryBands } from "@/lib/rent-history";
import { searchIntervalMs } from "@/lib/schedule";

const currency = (value?: number) =>
  value === undefined
    ? "Não informado"
    : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const neighborhoods = [...southZoneNeighborhoods];
const initialFilters: SearchFilters = {
  purpose: "sale",
  priceMax: 2_000_000,
  bedroomsMin: 2,
  parkingMin: 1,
  propertyTypes: ["apartment", "penthouse"],
};
type SuppressedHistoryItem = {
  searchRunId: string;
  propertyId: string;
  listingId: string;
  title: string;
  source: string;
  link: string;
  neighborhood: string;
  seenAt: string;
  suppressedUntil: string;
  analysisId: string;
  slabRights: "document_claimed" | "mentioned_unverified" | "not_mentioned" | "ambiguous";
  balconyBarbecue: "explicit" | "not_mentioned" | "ambiguous";
  summary: string;
  slabRightsAnswer?: "yes" | "no" | "unknown";
  balconyBarbecueAnswer?: "yes" | "no" | "unknown";
  category: "both" | "slab_rights" | "balcony_barbecue" | "none" | "ambiguous";
  purpose: "rent" | "sale";
  rentAmount?: number;
};
const historyCategories = [
  { id: "both", label: "Laje e churrasqueira na varanda" },
  { id: "slab_rights", label: "Direito à laje" },
  { id: "balcony_barbecue", label: "Churrasqueira na varanda" },
  { id: "ambiguous", label: "Precisam da sua resposta" },
  { id: "none", label: "Nenhuma característica encontrada" },
] as const;
type BatchSize = 5 | 10 | 15 | "all";
type AppSection = "search" | "results" | "history-sale" | "history-rent" | "schedule";
type SavedSearch = {
  id: string;
  title: string;
  neighborhood: string;
  neighborhoods: string[];
  filters: SearchFilters;
  savedAt: string;
  analysisIntervalMinutes: 60 | 180 | 360 | 720 | 1440;
  analysisBatchCount: BatchSize;
  lastSearchedAt: string | null;
  lastAnalyzedAt: string | null;
  latestSearchRunId: string | null;
  searchError: string | null;
  analysisError: string | null;
  analysisEnabled: boolean;
};
type SchedulerRun = {
  id: string;
  savedSearchId: string;
  title: string;
  jobKind: "search" | "analysis";
  status: "completed" | "failed";
  message: string | null;
  finishedAt: string;
};
const sections = [
  { id: "search", label: "Busca" },
  { id: "results", label: "Resultados" },
  { id: "history-sale", label: "Histórico de compra" },
  { id: "history-rent", label: "Histórico de aluguel" },
  { id: "schedule", label: "Agendamentos" },
] as const;
const dateTime = (value: string | null) =>
  value ? new Date(value).toLocaleString("pt-BR") : "Ainda não executado";
const scheduledMoment = (baseline: string | null, savedAt: string, intervalMs: number) => {
  const at = new Date(Date.parse(baseline ?? savedAt) + intervalMs);
  if (Number.isNaN(at.getTime())) return "horário ainda não calculado";
  const formatted = at.toLocaleString("pt-BR");
  return at.getTime() <= Date.now()
    ? `na verificação seguinte do agendador (desde ${formatted})`
    : formatted;
};

export default function Home() {
  const [city] = useState("Rio de Janeiro");
  const [selectedNeighborhoods, setSelectedNeighborhoods] = useState<string[]>(["Botafogo"]);
  const [error, setError] = useState("");
  const [collecting, setCollecting] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>(initialFilters);
  const [portalRun, setPortalRun] = useState<MultiPortalRun>();
  const [portalError, setPortalError] = useState("");
  const [collectingPortals, setCollectingPortals] = useState(false);
  const [propertyAnalyses, setPropertyAnalyses] = useState<Record<string, SavedPropertyAnalysis>>({});
  const [analyzingProperties, setAnalyzingProperties] = useState<Record<string, boolean>>({});
  const [propertyAnalysisErrors, setPropertyAnalysisErrors] = useState<Record<string, string>>({});
  const [batchSize, setBatchSize] = useState<BatchSize>(5);
  const [batchProgress, setBatchProgress] = useState<{ completed: number; failed: number; total: number }>();
  const batchLock = useRef(false);
  const [saleHistory, setSaleHistory] = useState<SuppressedHistoryItem[]>([]);
  const [rentHistory, setRentHistory] = useState<SuppressedHistoryItem[]>([]);
  const [answeringHistory, setAnsweringHistory] = useState<Record<string, boolean>>({});
  const [historyError, setHistoryError] = useState("");
  const [section, setSection] = useState<AppSection>("search");
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [schedulerRuns, setSchedulerRuns] = useState<SchedulerRun[]>([]);
  const [saveStatus, setSaveStatus] = useState("");
  const [editingSavedSearchId, setEditingSavedSearchId] = useState<string | null>(null);

  const visiblePortalListings = useMemo(
    () =>
      (portalRun?.listings.filter((listing) => matchesSearchFilters(listing, filters)) ?? []).sort(
        (first, second) =>
          (first.price ?? Number.POSITIVE_INFINITY) - (second.price ?? Number.POSITIVE_INFINITY) ||
          first.title.localeCompare(second.title, "pt-BR"),
      ),
    [filters, portalRun],
  );
  const saleListings = useMemo(
    () => visiblePortalListings.filter((listing) => listing.purpose !== "rent"),
    [visiblePortalListings],
  );
  const groupedHistory = useMemo(
    () =>
      section === "history-rent"
        ? rentHistoryBands(rentHistory)
        : historyCategories
            .map((category) => ({
              ...category,
              items: saleHistory.filter((item) => item.category === category.id),
            }))
            .filter((category) => category.items.length > 0),
    [rentHistory, saleHistory, section],
  );

  useEffect(() => {
    let active = true;
    fetch("/api/playwright/portals", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data as MultiPortalRun;
      })
      .then((data) => {
        if (active) {
          setPortalRun(data);
          setFilters({ ...initialFilters, ...data.filters });
        }
      })
      .catch(() => undefined);
    Promise.all(
      (["sale", "rent"] as const).map(async (purpose) => {
        const response = await fetch(`/api/history?purpose=${purpose}&limit=50`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return [purpose, data.items as SuppressedHistoryItem[]] as const;
      }),
    )
      .then((groups) => {
        if (!active) return;
        for (const [purpose, items] of groups) {
          if (purpose === "sale") setSaleHistory(items);
          else setRentHistory(items);
        }
      })
      .catch(() => undefined);
    fetch("/api/scheduler", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data as { searches: SavedSearch[]; runs: SchedulerRun[] };
      })
      .then((data) => {
        if (active) {
          setSavedSearches(data.searches);
          setSchedulerRuns(data.runs);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  async function refreshHistory(purpose: "sale" | "rent" = "sale") {
    const response = await fetch(`/api/history?purpose=${purpose}&limit=50`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) return;
    if (purpose === "sale") setSaleHistory(data.items);
    else setRentHistory(data.items);
  }

  async function answerAmbiguity(
    item: SuppressedHistoryItem,
    feature: "slab_rights" | "balcony_barbecue",
    answer: "yes" | "no" | "unknown",
  ) {
    const key = `${item.analysisId}:${feature}`;
    setAnsweringHistory((previous) => ({ ...previous, [key]: true }));
    setHistoryError("");
    try {
      const response = await fetch("/api/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ analysisId: item.analysisId, feature, answer }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      await refreshHistory();
    } catch (requestError) {
      setHistoryError(
        requestError instanceof Error ? requestError.message : "Falha ao salvar a resposta.",
      );
    } finally {
      setAnsweringHistory((previous) => ({ ...previous, [key]: false }));
    }
  }

  function updateFilter<Key extends keyof SearchFilters>(key: Key, value: SearchFilters[Key]) {
    setFilters((previous) => ({ ...previous, [key]: value }));
  }

  function togglePropertyType(type: PropertyType) {
    setFilters((previous) => ({
      ...previous,
      propertyTypes: previous.propertyTypes.includes(type)
        ? previous.propertyTypes.filter((item) => item !== type)
        : [...previous.propertyTypes, type],
    }));
  }

  async function collectSearch(event: FormEvent) {
    event.preventDefault();
    setCollecting(true);
    setError("");
    setPortalRun(undefined);
    setPortalError("");
    setPropertyAnalyses({});
    setPropertyAnalysisErrors({});
    try {
      const response = await fetch("/api/collect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ city, neighborhoods: selectedNeighborhoods, filters }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setCollectingPortals(true);
      const portalResponse = await fetch("/api/playwright/portals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ collectionId: data.id, filters }),
      });
      const portalData = await portalResponse.json();
      if (!portalResponse.ok) throw new Error(portalData.error);
      setPortalRun(portalData);
      setSection("results");
      await refreshHistory();
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Falha na consulta.";
      setError(message);
      setPortalError(message);
    } finally {
      setCollecting(false);
      setCollectingPortals(false);
    }
  }

  async function saveCurrentSearch() {
    setSaveStatus("");
    const editing = editingSavedSearchId;
    try {
      const response = await fetch("/api/saved-searches", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(editing ? { id: editing } : {}),
          city,
          neighborhoods: selectedNeighborhoods,
          filters,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSavedSearches((previous) => [
        data.item as SavedSearch,
        ...previous.filter((item) => item.id !== data.item.id),
      ]);
      setEditingSavedSearchId(null);
      setSaveStatus(editing ? "Agendamento atualizado." : "Pesquisa salva.");
      if (editing) setSection("schedule");
    } catch (requestError) {
      setSaveStatus(
        requestError instanceof Error ? requestError.message : "Não foi possível salvar a pesquisa.",
      );
    }
  }

  function editSavedSearch(saved: SavedSearch) {
    setSelectedNeighborhoods(
      saved.neighborhoods?.length ? saved.neighborhoods : [saved.neighborhood],
    );
    setFilters({ ...initialFilters, ...saved.filters });
    setEditingSavedSearchId(saved.id);
    setSection("search");
    setSaveStatus(`Editando “${saved.title}”. Salve para atualizar este agendamento.`);
  }

  async function deleteSavedSearch(saved: SavedSearch) {
    if (!window.confirm(`Apagar a busca automática “${saved.title}” e a análise ligada a ela?`)) return;
    setSaveStatus("");
    try {
      const response = await fetch(`/api/saved-searches?id=${encodeURIComponent(saved.id)}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSavedSearches((previous) => previous.filter((item) => item.id !== saved.id));
      setSchedulerRuns((previous) => previous.filter((run) => run.savedSearchId !== saved.id));
      if (editingSavedSearchId === saved.id) setEditingSavedSearchId(null);
      setSaveStatus("Agendamento apagado.");
    } catch (requestError) {
      setSaveStatus(
        requestError instanceof Error ? requestError.message : "Não foi possível apagar o agendamento.",
      );
    }
  }

  async function deleteSchedulerExecution(run: SchedulerRun) {
    const kind = run.jobKind === "search" ? "busca" : "análise";
    if (!window.confirm(`Apagar a execução de ${kind} “${run.title}”?`)) return;
    setSaveStatus("");
    try {
      const response = await fetch(`/api/scheduler?id=${encodeURIComponent(run.id)}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSchedulerRuns(data.runs);
      setSaveStatus("Execução apagada.");
    } catch (requestError) {
      setSaveStatus(
        requestError instanceof Error ? requestError.message : "Não foi possível apagar a execução.",
      );
    }
  }

  function editSchedulerExecution(run: SchedulerRun) {
    const saved = savedSearches.find((item) => item.id === run.savedSearchId);
    if (!saved) {
      setSaveStatus("A pesquisa desta execução não está mais salva.");
      return;
    }
    editSavedSearch(saved);
  }

  async function updateSchedule(
    saved: SavedSearch,
    patch: Partial<Pick<SavedSearch, "analysisIntervalMinutes" | "analysisBatchCount" | "analysisEnabled">>,
  ) {
    setSaveStatus("");
    try {
      const response = await fetch("/api/scheduler", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: saved.id,
          analysisIntervalMinutes: patch.analysisIntervalMinutes ?? saved.analysisIntervalMinutes,
          analysisBatchCount: patch.analysisBatchCount ?? saved.analysisBatchCount,
          analysisEnabled: patch.analysisEnabled ?? saved.analysisEnabled,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSavedSearches(data.searches);
      setSchedulerRuns(data.runs);
      setSaveStatus("Agendamento atualizado.");
    } catch (requestError) {
      setSaveStatus(
        requestError instanceof Error ? requestError.message : "Não foi possível atualizar o agendamento.",
      );
    }
  }

  function loadSavedSearch(id: string) {
    const saved = savedSearches.find((item) => item.id === id);
    if (!saved) return;
    setSelectedNeighborhoods(
      saved.neighborhoods?.length ? saved.neighborhoods : [saved.neighborhood],
    );
    setFilters({ ...initialFilters, ...saved.filters });
    setSaveStatus(`Filtros de “${saved.title}” carregados.`);
  }

  async function analyzeProperty(listingId: string, refresh = true) {
    if (!portalRun) return;
    setAnalyzingProperties((previous) => ({ ...previous, [listingId]: true }));
    setPropertyAnalysisErrors((previous) => ({ ...previous, [listingId]: "" }));
    try {
      const response = await fetch("/api/analyze-property", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: portalRun.id, listingId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setPropertyAnalyses((previous) => ({ ...previous, [listingId]: data }));
      setPortalRun((previous) =>
        previous
          ? {
              ...previous,
              listings: previous.listings.filter((listing) => listing.id !== listingId),
            }
          : previous,
      );
      if (refresh) await refreshHistory();
      return true;
    } catch (requestError) {
      setPropertyAnalysisErrors((previous) => ({
        ...previous,
        [listingId]:
          requestError instanceof Error ? requestError.message : "Falha na análise da IA.",
      }));
      return false;
    } finally {
      setAnalyzingProperties((previous) => ({ ...previous, [listingId]: false }));
    }
  }

  async function analyzeBatch() {
    if (!portalRun || batchLock.current) return;
    const targets = saleListings.slice(0, batchSize === "all" ? saleListings.length : batchSize);
    if (!targets.length) return;
    batchLock.current = true;
    const total = targets.length;
    setBatchProgress({ completed: 0, failed: 0, total });
    setPortalError("");
    try {
      const response = await fetch("/api/analyze-batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: portalRun.id, count: batchSize }),
      });
      const data = (await response.json()) as {
        analyzedListingIds?: string[];
        failures?: Array<{ listingId: string; error: string }>;
        selectedCount?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error);

      const analyzedListingIds = data.analyzedListingIds ?? [];
      const failures = data.failures ?? [];
      setPropertyAnalysisErrors((previous) => ({
        ...previous,
        ...Object.fromEntries(failures.map((failure) => [failure.listingId, failure.error])),
      }));
      setPortalRun((previous) =>
        previous
          ? {
              ...previous,
              listings: previous.listings.filter(
                (listing) => !analyzedListingIds.includes(listing.id),
              ),
            }
          : previous,
      );
      setBatchProgress({
        completed: analyzedListingIds.length + failures.length,
        failed: failures.length,
        total: data.selectedCount ?? total,
      });
      await refreshHistory();
    } catch (requestError) {
      setPortalError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível concluir a análise em lote.",
      );
    } finally {
      batchLock.current = false;
      setBatchProgress(undefined);
    }
  }

  return (
    <div className="app-shell">
      <aside className="side-nav">
        <p className="eyebrow">Radar</p>
        <strong>Imóveis</strong>
        <nav aria-label="Seções">
          {sections.map((item) => (
            <button
              type="button"
              className={section === item.id ? "active" : ""}
              onClick={() => setSection(item.id)}
              key={item.id}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <small>Busca automática a cada hora para cada filtro salvo.</small>
      </aside>
      <main>
      {section === "search" && (
      <header className="hero">
        <p className="eyebrow">Rio de Janeiro · aluguel e compra</p>
        <h1>Radar de imóveis</h1>
        <p className="subtitle">Descobre portais, coleta os anúncios e reaplica filtros verificáveis antes de exibir os resultados.</p>
        <form onSubmit={collectSearch} className="filter-form">
          <label>
            Cidade
            <select value={city} disabled><option>Rio de Janeiro</option></select>
          </label>
          <fieldset className="neighborhood-combo">
            <legend>Bairros da Zona Sul</legend>
            <details>
              <summary>
                {selectedNeighborhoods.length
                  ? selectedNeighborhoods.join(", ")
                  : "Selecione um ou mais bairros"}
              </summary>
              <div>
                {neighborhoods.map((item) => (
                  <label key={item}>
                    <input
                      type="checkbox"
                      checked={selectedNeighborhoods.includes(item)}
                      onChange={() =>
                        setSelectedNeighborhoods((current) =>
                          current.includes(item)
                            ? current.filter((neighborhood) => neighborhood !== item)
                            : [...current, item],
                        )
                      }
                    />
                    {item}
                  </label>
                ))}
              </div>
            </details>
          </fieldset>
          <label>
            Finalidade
            <select
              value={filters.purpose}
              onChange={(event) => updateFilter("purpose", event.target.value as SearchFilters["purpose"])}
            >
              <option value="sale">Compra</option>
              <option value="rent">Aluguel</option>
            </select>
          </label>
          <label>
            {filters.purpose === "rent" ? "Aluguel mínimo" : "Preço mínimo"}
            <input
              type="number"
              min="0"
              step="100"
              placeholder="Sem mínimo"
              value={filters.priceMin ?? ""}
              onChange={(event) => updateFilter("priceMin", event.target.value ? Number(event.target.value) : undefined)}
            />
          </label>
          <label>
            {filters.purpose === "rent" ? "Aluguel máximo" : "Preço máximo"}
            <input
              type="number"
              min="0"
              step="100"
              placeholder="2.000.000"
              value={filters.priceMax ?? ""}
              onChange={(event) => updateFilter("priceMax", event.target.value ? Number(event.target.value) : undefined)}
            />
          </label>
          <label>
            Quartos mínimos
            <input
              type="number"
              min="0"
              max="10"
              value={filters.bedroomsMin}
              onChange={(event) => updateFilter("bedroomsMin", Number(event.target.value))}
            />
          </label>
          <label>
            Vagas mínimas
            <input
              type="number"
              min="0"
              max="10"
              value={filters.parkingMin}
              onChange={(event) => updateFilter("parkingMin", Number(event.target.value))}
            />
          </label>
          <fieldset className="property-types">
            <legend>Tipo de imóvel</legend>
            <label>
              <input
                type="checkbox"
                checked={filters.propertyTypes.includes("apartment")}
                onChange={() => togglePropertyType("apartment")}
              />
              Apartamento
            </label>
            <label>
              <input
                type="checkbox"
                checked={filters.propertyTypes.includes("penthouse")}
                onChange={() => togglePropertyType("penthouse")}
              />
              Cobertura
            </label>
          </fieldset>
          <button className="collect-button" disabled={collecting || filters.propertyTypes.length === 0 || selectedNeighborhoods.length === 0}>
            {collectingPortals
              ? "Coletando nos portais…"
              : collecting
                ? "Descobrindo portais…"
                : "Buscar em todos os sites"}
          </button>
        </form>
        <div className="saved-search-controls">
          <label>
            Pesquisas salvas
            <select
              value=""
              onChange={(event) => {
                if (event.target.value) loadSavedSearch(event.target.value);
              }}
            >
              <option value="">Carregar filtros salvos</option>
              {savedSearches.map((saved) => (
                <option key={saved.id} value={saved.id}>{saved.title}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={saveCurrentSearch}>
            {editingSavedSearchId ? "Atualizar agendamento" : "Salvar pesquisa"}
          </button>
          {editingSavedSearchId && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setEditingSavedSearchId(null);
                setSaveStatus("Edição cancelada.");
              }}
            >
              Cancelar edição
            </button>
          )}
          {saveStatus && <p role="status">{saveStatus}</p>}
        </div>
        {collecting && (
          <section className="search-progress" aria-live="polite">
            <div className="progress-copy">
              <strong>
                {collectingPortals ? "Analisando os portais encontrados" : "Descobrindo portais"}
              </strong>
              <span>{collectingPortals ? "Etapa 2 de 2" : "Etapa 1 de 2"}</span>
            </div>
            <div
              className="progress-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={collectingPortals ? 72 : 24}
            >
              <span className={collectingPortals ? "portal-phase" : "discovery-phase"} />
            </div>
            <small>
              {collectingPortals
                ? "O Chrome pode abrir enquanto cada domínio é processado. Sites bloqueados não interrompem os demais."
                : "Montando a lista de páginas de busca conforme os filtros selecionados."}
            </small>
          </section>
        )}
        <p className="hint">Preço, quartos, vagas e tipo são filtrados na descoberta e novamente após a normalização. Dados ausentes não são presumidos.</p>
      </header>
      )}

      {section === "search" && error && <p className="error" role="alert">{error}</p>}
      {section === "results" && (
      <section className="playwright-panel" aria-labelledby="playwright-title">
        <div className="section-heading playwright-heading">
          <div>
            <p className="eyebrow">Coleta direta · múltiplos portais</p>
            <h2 id="playwright-title">Resultado consolidado</h2>
            <p className="list-description">
              Cada domínio descoberto recebe um resultado ou um motivo explícito de falha.
            </p>
          </div>
          {portalRun && <time>{new Date(portalRun.collectedAt).toLocaleString("pt-BR")}</time>}
        </div>

        {portalError && <p className="error" role="alert">{portalError}</p>}
        {portalRun ? (
          <>
            <div className="playwright-metrics">
              <article>
                <span>Total coletado</span>
                <strong>{portalRun.totalCollected ?? portalRun.listings.length}</strong>
                <small>antes da regra semestral</small>
              </article>
              <article>
                <span>Imóveis novos</span>
                <strong className="status-ok">
                  {visiblePortalListings.length}
                </strong>
                <small>liberados para análise</small>
              </article>
              <article>
                <span>Reencontrados após IA</span>
                <strong className={(portalRun.suppressedCount ?? 0) > 0 ? "status-blocked" : ""}>
                  {portalRun.suppressedCount ?? 0}
                </strong>
                <small>visíveis somente no histórico</small>
              </article>
              <article>
                <span>Portais consultados</span>
                <strong>{portalRun.sources.length}</strong>
                <small>{portalRun.sources.filter((source) => source.status === "ok").length} com resultado</small>
              </article>
            </div>

            <div className="source-grid" aria-label="Status das fontes">
              {portalRun.sources.map((source) => (
                <article key={source.searchUrl}>
                  <div>
                    <strong>{source.source}</strong>
                    <span className={`source-status ${source.status}`}>
                      {source.status === "ok"
                        ? "Coletado"
                        : source.status === "blocked"
                          ? "Bloqueado"
                          : source.status === "empty"
                            ? "Sem compatíveis"
                            : "Erro"}
                    </span>
                  </div>
                  <p>{source.found} imóveis · {(source.durationMs / 1_000).toFixed(1)}s</p>
                  {source.message && <small>{source.message}</small>}
                  <a href={source.searchUrl} target="_blank" rel="noreferrer">Abrir busca ↗</a>
                </article>
              ))}
            </div>

            {visiblePortalListings.length > 0 ? (
              <>
                {saleListings.length > 0 && (
                <div className="batch-analysis">
                  <div>
                    <strong>Análise da IA em lote</strong>
                    <p>A lista e a execução seguem a ordem do menor preço para o maior.</p>
                  </div>
                  <label>
                    Quantidade
                    <select
                      value={batchSize}
                      disabled={Boolean(batchProgress)}
                      onChange={(event) => setBatchSize(event.target.value === "all" ? "all" : Number(event.target.value) as BatchSize)}
                    >
                      <option value={5}>5</option>
                      <option value={10}>10</option>
                      <option value={15}>15</option>
                      <option value="all">Todos ({saleListings.length})</option>
                    </select>
                  </label>
                  <button type="button" disabled={Boolean(batchProgress)} onClick={analyzeBatch}>
                    {batchProgress
                      ? `Analisando ${batchProgress.completed}/${batchProgress.total}`
                      : "Analisar com IA"}
                  </button>
                  {batchProgress && (
                    <p className="batch-progress">
                      {batchProgress.failed
                        ? `${batchProgress.failed} análise(s) falharam; os demais resultados foram salvos.`
                        : "O imóvel é removido desta lista ao concluir e vai para o histórico."}
                    </p>
                  )}
                </div>
                )}
                <div className="playwright-listings">
                {visiblePortalListings.map((listing) => {
                  const analysis = propertyAnalyses[listing.id];
                  return (
                    <article key={listing.id}>
                      <span className="source-label">{listing.sources.join(" + ")}</span>
                      <h3>{listing.title}</h3>
                      {listing.purpose === "rent" && <span className="source-label">Aluguel</span>}
                      <strong className="captured-price">{currency(listing.price)}</strong>
                      <p>
                        {listing.bedrooms ?? "—"} quartos · {listing.parkingSpaces ?? "—"} vagas · {listing.areaM2 ?? "—"} m²
                      </p>
                      <p>{listing.neighborhood} · {listing.propertyType === "penthouse" ? "Cobertura" : "Apartamento"}</p>
                      {listing.purpose === "rent" ? (
                        <p className="rent-note">Aluguel não passa pela análise de laje e churrasqueira.</p>
                      ) : (
                      <button
                        type="button"
                        className="ai-analysis-button"
                        disabled={analyzingProperties[listing.id] || Boolean(analysis) || Boolean(batchProgress)}
                        onClick={() => analyzeProperty(listing.id)}
                      >
                        {analyzingProperties[listing.id]
                          ? "Lendo descrição e analisando…"
                          : analysis
                            ? "Análise concluída"
                            : "Analisar laje e churrasqueira com IA"}
                        </button>
                      )}
                      {propertyAnalysisErrors[listing.id] && (
                        <p className="inline-error" role="alert">{propertyAnalysisErrors[listing.id]}</p>
                      )}
                      {analysis && (
                        <section className="ai-analysis-result">
                          <strong>Análise da descrição</strong>
                          <dl>
                            <div>
                              <dt>Direito à laje</dt>
                              <dd>
                                {analysis.slabRights === "document_claimed"
                                  ? "Documento alegado"
                                  : analysis.slabRights === "mentioned_unverified"
                                    ? "Mencionado, não verificado"
                                    : analysis.slabRights === "ambiguous"
                                      ? "Ambíguo"
                                      : "Não mencionado"}
                              </dd>
                            </div>
                            <div>
                              <dt>Churrasqueira na varanda</dt>
                              <dd>
                                {analysis.balconyBarbecue === "explicit"
                                  ? "Menção explícita"
                                  : analysis.balconyBarbecue === "ambiguous"
                                    ? "Ambígua"
                                    : "Não mencionada"}
                              </dd>
                            </div>
                          </dl>
                          <p>{analysis.summary}</p>
                          {analysis.evidence.length > 0 && (
                            <details>
                              <summary>Ver evidências</summary>
                              <ul>
                                {analysis.evidence.map((item, index) => (
                                  <li key={`${item.feature}-${index}`}>“{item.quote}”</li>
                                ))}
                              </ul>
                            </details>
                          )}
                          <small>Direito à laje exige verificação documental independente.</small>
                        </section>
                      )}
                      <a href={listing.link} target="_blank" rel="noreferrer">
                        Abrir anúncio <span aria-hidden>↗</span>
                      </a>
                    </article>
                  );
                })}
                </div>
              </>
            ) : (
              <section className="empty portal-empty">
                <h3>Nenhum imóvel compatível nesta coleta</h3>
                <p>Consulte os estados das fontes acima ou amplie os filtros.</p>
              </section>
            )}
          </>
        ) : (
          <section className="empty portal-empty">
            <h3>Nenhuma coleta multiportal disponível</h3>
            <p>Defina os filtros e use “Buscar em todos os sites”.</p>
          </section>
        )}
      </section>
      )}
      {(section === "history-sale" || section === "history-rent") && (
      <section className="semester-history" aria-labelledby="semester-history-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Controle de repetição</p>
            <h2 id="semester-history-title">{section === "history-rent" ? "Histórico de aluguel" : "Histórico de compra"}</h2>
            <p className="list-description">
              {section === "history-rent"
                ? "Os imóveis de aluguel ficam separados entre até R$ 12.000 e acima desse valor. O valor mostrado é o aluguel encontrado no anúncio."
                : "Imóveis de compra analisados pela IA ficam registrados por seis meses, separados por imobiliária."}
            </p>
          </div>
          <span className="count">{(section === "history-rent" ? rentHistory : saleHistory).length}</span>
        </div>
        {historyError && <p className="error" role="alert">{historyError}</p>}
        {(section === "history-rent" ? rentHistory : saleHistory).length ? (
          <div className="history-groups">
            {groupedHistory.map((group) => (
              <section className="history-group" key={group.id}>
                <div className="history-group-heading">
                  <h3>{group.label}</h3>
                  <span>{group.items.length}</span>
                </div>
                <div className="history-list">
                  {group.items.map((item) => (
                    <article key={`${item.propertyId}:${item.source}`}>
                      <div className="history-property">
                        <span className="source-label">{item.source} · {item.neighborhood}</span>
                        <h3>{item.title}</h3>
                        <p>{item.summary}</p>
                      </div>
                      <dl>
                        {section === "history-rent" && (
                          <div>
                            <dt>Aluguel</dt>
                            <dd>{currency(item.rentAmount)}</dd>
                          </div>
                        )}
                        <div>
                          <dt>Analisado em</dt>
                          <dd>{new Date(item.seenAt).toLocaleDateString("pt-BR")}</dd>
                        </div>
                        <div>
                          <dt>{section === "history-rent" ? "Repetição" : "Nova pesquisa após"}</dt>
                          <dd>{section === "history-rent" ? "Sem bloqueio semestral" : new Date(item.suppressedUntil).toLocaleDateString("pt-BR")}</dd>
                        </div>
                      </dl>
                      <div className="history-actions">
                        {section === "history-sale" && item.analysisId && item.slabRights === "ambiguous" && (
                          <fieldset className="ambiguity-question">
                            <legend>O imóvel tem direito à laje?</legend>
                            {(["yes", "no", "unknown"] as const).map((answer) => (
                              <button
                                type="button"
                                className={item.slabRightsAnswer === answer ? "chosen" : ""}
                                disabled={answeringHistory[`${item.analysisId}:slab_rights`]}
                                onClick={() => answerAmbiguity(item, "slab_rights", answer)}
                                key={answer}
                              >
                                {answer === "yes" ? "Sim" : answer === "no" ? "Não" : "Não sei"}
                              </button>
                            ))}
                          </fieldset>
                        )}
                        {section === "history-sale" && item.analysisId && item.balconyBarbecue === "ambiguous" && (
                          <fieldset className="ambiguity-question">
                            <legend>Há churrasqueira na varanda?</legend>
                            {(["yes", "no", "unknown"] as const).map((answer) => (
                              <button
                                type="button"
                                className={item.balconyBarbecueAnswer === answer ? "chosen" : ""}
                                disabled={answeringHistory[`${item.analysisId}:balcony_barbecue`]}
                                onClick={() => answerAmbiguity(item, "balcony_barbecue", answer)}
                                key={answer}
                              >
                                {answer === "yes" ? "Sim" : answer === "no" ? "Não" : "Não sei"}
                              </button>
                            ))}
                          </fieldset>
                        )}
                        <a href={item.link} target="_blank" rel="noreferrer">Abrir anúncio ↗</a>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <p className="history-empty">{section === "history-rent" ? "Nenhum imóvel de aluguel foi coletado." : "Nenhum imóvel de compra foi analisado pela IA nos últimos seis meses."}</p>
        )}
      </section>
      )}
      {section === "schedule" && (
        <section className="schedule-panel" aria-labelledby="schedule-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Automação</p>
              <h2 id="schedule-title">Agendamentos</h2>
              <p className="list-description">Cada pesquisa salva tem a busca na API e, na compra, a chamada da IA. As duas podem ser editadas ou apagadas.</p>
            </div>
          </div>
          {saveStatus && <p role="status">{saveStatus}</p>}
          <h3>Busca na API</h3>
          {savedSearches.length ? (
            <div className="schedule-list">
              {savedSearches.map((saved) => (
                <article key={`search-${saved.id}`}>
                  <div>
                    <h3>Busca · {saved.title}</h3>
                    <p>A cada 1 hora · última em {dateTime(saved.lastSearchedAt)}</p>
                    <p>Próxima busca: {scheduledMoment(saved.lastSearchedAt, saved.savedAt, searchIntervalMs)}</p>
                    {saved.searchError && <small>{saved.searchError}</small>}
                  </div>
                  <div className="schedule-actions">
                    <button type="button" className="secondary-button" onClick={() => editSavedSearch(saved)}>Editar</button>
                    {saved.filters.purpose !== "rent" && !saved.analysisEnabled && (
                      <button type="button" className="secondary-button" onClick={() => updateSchedule(saved, { analysisEnabled: true })}>
                        Agendar análise
                      </button>
                    )}
                    <button type="button" className="danger-button" onClick={() => deleteSavedSearch(saved)}>Apagar</button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="history-empty">Salve uma pesquisa para ativar a busca de hora em hora.</p>
          )}
          <h3>Chamada da IA</h3>
          {savedSearches.some((saved) => saved.filters.purpose !== "rent" && saved.analysisEnabled) ? (
            <div className="schedule-list">
              {savedSearches.filter((saved) => saved.filters.purpose !== "rent" && saved.analysisEnabled).map((saved) => (
                <article key={`analysis-${saved.id}`}>
                  <div>
                    <h3>Análise · {saved.title}</h3>
                    <p>
                      Próxima análise: {saved.latestSearchRunId
                        ? scheduledMoment(saved.lastAnalyzedAt, saved.savedAt, saved.analysisIntervalMinutes * 60 * 1000)
                        : "depois da primeira busca concluída"}
                      {" "}· última em {dateTime(saved.lastAnalyzedAt)}
                    </p>
                    {saved.analysisError && <small>{saved.analysisError}</small>}
                  </div>
                  <label>
                    Intervalo
                    <select
                      value={saved.analysisIntervalMinutes}
                      onChange={(event) =>
                        updateSchedule(saved, {
                          analysisIntervalMinutes: Number(event.target.value) as SavedSearch["analysisIntervalMinutes"],
                        })
                      }
                    >
                      <option value={60}>A cada 1 hora</option>
                      <option value={180}>A cada 3 horas</option>
                      <option value={360}>A cada 6 horas</option>
                      <option value={720}>A cada 12 horas</option>
                      <option value={1440}>A cada 24 horas</option>
                    </select>
                  </label>
                  <label>
                    Quantidade
                    <select
                      value={saved.analysisBatchCount}
                      onChange={(event) =>
                        updateSchedule(saved, {
                          analysisBatchCount: event.target.value === "all" ? "all" : Number(event.target.value) as BatchSize,
                        })
                      }
                    >
                      <option value={5}>5</option>
                      <option value={10}>10</option>
                      <option value={15}>15</option>
                      <option value="all">Todos</option>
                    </select>
                  </label>
                  <div className="schedule-actions">
                    <button type="button" className="secondary-button" onClick={() => editSavedSearch(saved)}>Editar</button>
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => {
                        if (window.confirm(`Parar a análise automática de “${saved.title}”? A busca de hora em hora continua.`)) {
                          void updateSchedule(saved, { analysisEnabled: false });
                        }
                      }}
                    >
                      Apagar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="history-empty">Nenhuma análise automática está ligada. Aluguel não usa a IA de laje e churrasqueira.</p>
          )}
          {schedulerRuns.length > 0 && (
            <div className="scheduler-runs">
              <h3>Execuções</h3>
              {schedulerRuns.map((run) => (
                <div key={run.id}>
                  <p>
                    <b>{run.jobKind === "search" ? "Busca" : "Análise"} · {run.title}</b>
                    {" "}{run.status === "completed" ? "concluída" : "com falha"} em {dateTime(run.finishedAt)}. {run.message}
                  </p>
                  <div className="schedule-actions">
                    <button type="button" className="secondary-button" onClick={() => editSchedulerExecution(run)}>Editar</button>
                    <button type="button" className="danger-button" onClick={() => deleteSchedulerExecution(run)}>Apagar</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      </main>
    </div>
  );
}
