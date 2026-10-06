"use client";

import dynamic from "next/dynamic";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  historyToMapProperty,
  listingToMapProperty,
  mergeMapProperties,
} from "@/lib/map/collect-properties";
import type { MapProperty } from "@/lib/map/street-group";
import {
  matchesSearchFilters,
  type CollectedListing,
  type MultiPortalRun,
  type PropertyType,
  type SearchFilters,
} from "@/lib/listings";
import { saleHistoryFilters, saleHistorySections, type SaleHistoryFilter } from "@/lib/sale-history";
import type { SavedPropertyAnalysis } from "@/lib/property-analysis";
import { southZoneNeighborhoods } from "@/lib/neighborhoods";
import { rentHistoryBands, rentHistoryFilters, type RentHistoryFilter } from "@/lib/rent-history";
import {
  listingActionsHint,
  propertyTypeLabel,
  propertyTypesFilterLabel,
  purposeLabel,
  supportsSlabFeatureAnalysis,
} from "@/lib/listing-labels";
import { searchIntervalMs } from "@/lib/schedule";
import {
  formatSearchQuota,
  formatSearchQuotaUsage,
  isUnlimitedSearchQuota,
  UNLIMITED_SEARCH_QUOTA,
  userRoleLabel,
} from "@/lib/auth/search-quota";
import { AuthSetupGuide, type AuthSetupView } from "@/app/components/auth-setup-guide";

const PropertyMap = dynamic(
  () => import("@/app/components/property-map").then((module) => module.PropertyMap),
  { ssr: false, loading: () => <p role="status">Carregando mapa…</p> },
);

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
  location?: string;
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
  propertyType?: "apartment" | "penthouse";
  penthouseDisposition?: "saved" | "dismissed" | null;
  dismissed?: boolean;
  dismissedByAi?: boolean;
};
type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  role: "user" | "admin";
  searchQuota: number;
  searchesUsed: number;
  hasPassword?: boolean;
  hasGoogle?: boolean;
};
type ControlPanelData = {
  totals: {
    properties: number;
    searches: number;
    analyses: number;
    classifiedProperties: number;
  };
  byType: Array<{ label: string; count: number }>;
  byPurpose: Array<{ label: string; count: number }>;
  byLocationQuality: Array<{ label: string; count: number }>;
  byClassification: Array<{ label: string; count: number }>;
  researchers: Array<{ userId: string | null; name: string; searches: number }>;
  classifiers: Array<{
    userId: string | null;
    name: string;
    analyses: number;
    classifiedProperties: number;
  }>;
};
type BatchSize = 5 | 10 | 15 | "all";
type HistoryPropertyType = "all" | "apartment" | "penthouse";
type AppSection =
  | "search"
  | "results"
  | "history-sale"
  | "history-rent"
  | "favorites"
  | "dismissed"
  | "map"
  | "schedule"
  | "admin"
  | "control-panel";
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
  completedRunCount: number;
};
type ResultsView = { kind: "saved"; id: string } | { kind: "manual" } | { kind: "latest" };
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
  { id: "favorites", label: "Favoritos" },
  { id: "map", label: "Mapa" },
  { id: "history-sale", label: "Histórico de compra" },
  { id: "history-rent", label: "Histórico de aluguel" },
  { id: "schedule", label: "Agendamentos" },
  { id: "admin", label: "Usuários" },
  { id: "control-panel", label: "Control Painel" },
  { id: "dismissed", label: "Descartados" },
] as const;
const quotaSelectValue = (quota: number) =>
  quota === 10 || quota === 100 || quota === UNLIMITED_SEARCH_QUOTA ? String(quota) : "10";
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
  const [authUser, setAuthUser] = useState<AuthUser>();
  const [favoriteLinks, setFavoriteLinks] = useState<string[]>([]);
  const [favoriteItems, setFavoriteItems] = useState<CollectedListing[]>([]);
  const [dismissedItems, setDismissedItems] = useState<SuppressedHistoryItem[]>([]);
  const [dismissedPropertyType, setDismissedPropertyType] = useState<HistoryPropertyType>("all");
  const [saleHistoryFilter, setSaleHistoryFilter] = useState<SaleHistoryFilter>("all");
  const [rentHistoryFilter, setRentHistoryFilter] = useState<RentHistoryFilter>("all");
  const [historyPropertyType, setHistoryPropertyType] = useState<HistoryPropertyType>("all");
  const [adminUsers, setAdminUsers] = useState<AuthUser[]>([]);
  const [controlPanel, setControlPanel] = useState<ControlPanelData>();
  const [controlPanelError, setControlPanelError] = useState("");
  const [adminSetup, setAdminSetup] = useState<AuthSetupView>();
  const [adminStatus, setAdminStatus] = useState("");
  const [newUser, setNewUser] = useState({
    email: "",
    displayName: "",
    password: "",
    role: "user" as "user" | "admin",
    searchQuota: 10,
  });
  const [editingUser, setEditingUser] = useState<AuthUser | null>(null);
  const [editPassword, setEditPassword] = useState("");
  const [resultsView, setResultsView] = useState<ResultsView | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);

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
  const saleApartmentsForAi = useMemo(
    () => saleListings.filter((listing) => supportsSlabFeatureAnalysis(listing)),
    [saleListings],
  );
  const filteredHistory = useMemo(() => {
    const items = section === "history-rent" ? rentHistory : saleHistory;
    return historyPropertyType === "all"
      ? items
      : items.filter((item) => item.propertyType === historyPropertyType);
  }, [historyPropertyType, rentHistory, saleHistory, section]);
  const filteredDismissedItems = useMemo(
    () =>
      dismissedPropertyType === "all"
        ? dismissedItems
        : dismissedItems.filter((item) => item.propertyType === dismissedPropertyType),
    [dismissedItems, dismissedPropertyType],
  );
  const groupedHistory = useMemo(
    () =>
      section === "history-rent"
        ? rentHistoryBands(filteredHistory, rentHistoryFilter)
        : saleHistorySections(filteredHistory, saleHistoryFilter),
    [filteredHistory, rentHistoryFilter, section, saleHistoryFilter],
  );
  const visibleSections = useMemo(
    () =>
      sections.filter(
        (item) =>
          (item.id !== "admin" && item.id !== "control-panel") || authUser?.role === "admin",
      ),
    [authUser],
  );
  const manualSearchBlocked = useMemo(() => {
    if (!authUser) return false;
    if (isUnlimitedSearchQuota(authUser.searchQuota)) return false;
    return authUser.searchesUsed >= authUser.searchQuota;
  }, [authUser]);
  const mapProperties = useMemo(
    () =>
      mergeMapProperties([
        visiblePortalListings.map(listingToMapProperty),
        favoriteItems.map(listingToMapProperty),
        saleHistory.filter((item) => !item.dismissed && item.penthouseDisposition !== "dismissed").map(historyToMapProperty),
        rentHistory.filter((item) => !item.dismissed && item.penthouseDisposition !== "dismissed").map(historyToMapProperty),
      ]),
    [visiblePortalListings, favoriteItems, saleHistory, rentHistory],
  );

  function mapPropertyToListing(property: MapProperty): CollectedListing {
    const currentListing = visiblePortalListings.find((listing) => listing.link === property.link);
    if (currentListing) return currentListing;
    const favorite = favoriteItems.find((listing) => listing.link === property.link);
    if (favorite) return favorite;
    return {
      id: property.id,
      title: property.title,
      purpose: property.purpose,
      propertyType: property.propertyType ?? "unknown",
      price: property.price,
      location: property.location,
      neighborhood: property.neighborhood,
      link: property.link,
      source: property.source,
      sources: [property.source],
      sourceSearchUrl: property.link,
      collectedAt: new Date().toISOString(),
      evidence: [],
    };
  }

  function historyItemToListing(item: SuppressedHistoryItem): CollectedListing {
    return {
      id: item.listingId || item.link,
      title: item.title,
      purpose: item.purpose,
      propertyType: item.propertyType ?? "apartment",
      price: item.rentAmount,
      neighborhood: item.neighborhood,
      location: item.location,
      link: item.link,
      source: item.source,
      sources: [item.source],
      sourceSearchUrl: item.link,
      collectedAt: item.seenAt,
      evidence: [],
    };
  }

  function classifyMapProperty(property: MapProperty) {
    const listing = visiblePortalListings.find((item) => item.link === property.link);
    if (!listing) {
      setPortalError("A classificação por IA está disponível para imóveis nos resultados atuais.");
      return;
    }
    if (!supportsSlabFeatureAnalysis(listing)) {
      setPortalError("A classificação por IA é disponível apenas para apartamentos de compra.");
      return;
    }
    void analyzeProperty(listing.id);
  }

  function portalResultsUrl(view: ResultsView) {
    if (view.kind === "saved") {
      return `/api/playwright/portals?savedSearchId=${encodeURIComponent(view.id)}`;
    }
    if (view.kind === "manual") {
      return "/api/playwright/portals?scope=manual";
    }
    return "/api/playwright/portals?scope=latest";
  }

  async function loadPortalResults(view: ResultsView, applySavedFilters = false) {
    setLoadingResults(true);
    setPortalError("");
    try {
      const response = await fetch(portalResultsUrl(view), { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const run = data as MultiPortalRun;
      setPortalRun(run);
      if (view.kind === "saved" && applySavedFilters) {
        const saved = savedSearches.find((item) => item.id === view.id);
        if (saved) {
          setFilters({ ...initialFilters, ...saved.filters });
          setSelectedNeighborhoods(
            saved.neighborhoods?.length ? saved.neighborhoods : [saved.neighborhood],
          );
        }
      } else if (view.kind === "manual" || view.kind === "latest") {
        setFilters({ ...initialFilters, ...run.filters });
      }
    } catch (requestError) {
      setPortalRun(undefined);
      setPortalError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível carregar os resultados.",
      );
    } finally {
      setLoadingResults(false);
    }
  }

  function resultsViewSelectValue(view: ResultsView | null) {
    if (!view) return "";
    if (view.kind === "manual") return "manual";
    if (view.kind === "latest") return "latest";
    return view.id;
  }

  function handleResultsViewSelect(value: string) {
    const view: ResultsView =
      value === "manual"
        ? { kind: "manual" }
        : value === "latest"
          ? { kind: "latest" }
          : { kind: "saved", id: value };
    setResultsView(view);
    void loadPortalResults(view, view.kind === "saved");
  }

  async function refreshSession() {
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as { user: AuthUser };
    setAuthUser(data.user);
  }

  async function refreshFavorites() {
    const response = await fetch("/api/favorites", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as { items: CollectedListing[]; links: string[] };
    setFavoriteItems(data.items);
    setFavoriteLinks(data.links ?? data.items.map((item) => item.link));
  }

  async function refreshDismissed() {
    const response = await fetch("/api/listing-dismiss", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as { items: SuppressedHistoryItem[] };
    setDismissedItems(data.items);
  }

  async function refreshAdminUsers() {
    const response = await fetch("/api/admin/users", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as { users: AuthUser[]; setup?: AuthSetupView };
    setAdminUsers(data.users);
    if (data.setup) setAdminSetup(data.setup);
  }

  async function refreshControlPanel() {
    setControlPanelError("");
    const response = await fetch("/api/control-panel", { cache: "no-store" });
    const data = (await response.json()) as ControlPanelData & { error?: string };
    if (!response.ok) {
      setControlPanelError(data.error ?? "Não foi possível carregar o Control Painel.");
      return;
    }
    setControlPanel(data);
  }

  async function toggleFavorite(listing: CollectedListing) {
    const isFavorite = favoriteLinks.includes(listing.link);
    const response = await fetch(
      isFavorite ? `/api/favorites?link=${encodeURIComponent(listing.link)}` : "/api/favorites",
      isFavorite
        ? { method: "DELETE" }
        : {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ listing }),
          },
    );
    if (!response.ok) return;
    await refreshFavorites();
  }

  async function dismissListing(listing: CollectedListing) {
    const response = await fetch("/api/listing-dismiss", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ link: listing.link, listing }),
    });
    const data = await response.json();
    if (!response.ok) {
      setPortalError(data.error ?? "Não foi possível descartar o imóvel.");
      return;
    }
    if (favoriteLinks.includes(listing.link)) {
      await fetch(`/api/favorites?link=${encodeURIComponent(listing.link)}`, { method: "DELETE" });
      await refreshFavorites();
    }
    setPortalRun((previous) =>
      previous
        ? { ...previous, listings: previous.listings.filter((item) => item.link !== listing.link) }
        : previous,
    );
    await refreshHistory(listing.purpose === "rent" ? "rent" : "sale");
    await refreshDismissed();
  }

  async function createAdminUser(event: FormEvent) {
    event.preventDefault();
    setAdminStatus("");
    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(newUser),
    });
    const data = await response.json();
    if (!response.ok) {
      setAdminStatus(data.error ?? "Não foi possível criar o usuário.");
      return;
    }
    setAdminStatus("Usuário criado.");
    setNewUser({ email: "", displayName: "", password: "", role: "user", searchQuota: 10 });
    await refreshAdminUsers();
  }

  async function saveEditingUser(event: FormEvent) {
    event.preventDefault();
    if (!editingUser) return;
    setAdminStatus("");
    const response = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: editingUser.id,
        displayName: editingUser.displayName,
        role: editingUser.role,
        searchQuota: editingUser.searchQuota,
        ...(editPassword ? { password: editPassword } : {}),
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setAdminStatus(data.error ?? "Não foi possível salvar.");
      return;
    }
    setAdminStatus("Usuário atualizado.");
    setEditingUser(null);
    setEditPassword("");
    await refreshAdminUsers();
    await refreshSession();
  }

  async function deleteAdminUser(userId: string) {
    if (!window.confirm("Apagar este usuário e as sessões dele?")) return;
    setAdminStatus("");
    const response = await fetch(`/api/admin/users?id=${encodeURIComponent(userId)}`, {
      method: "DELETE",
    });
    const data = await response.json();
    if (!response.ok) {
      setAdminStatus(data.error ?? "Não foi possível apagar.");
      return;
    }
    setAdminStatus("Usuário removido.");
    if (editingUser?.id === userId) setEditingUser(null);
    await refreshAdminUsers();
  }

  useEffect(() => {
    let active = true;
    refreshSession().catch(() => undefined);
    refreshFavorites().catch(() => undefined);
    refreshDismissed().catch(() => undefined);
    Promise.all(
      (["sale", "rent"] as const).map(async (purpose) => {
        const response = await fetch(`/api/history?purpose=${purpose}&limit=200`, { cache: "no-store" });
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
        if (!active) return;
        setSavedSearches(data.searches);
        setSchedulerRuns(data.runs);
        const preferred = data.searches.find(
          (item) => item.completedRunCount > 0 || item.latestSearchRunId,
        );
        const initialView: ResultsView = preferred
          ? { kind: "saved", id: preferred.id }
          : { kind: "latest" };
        setResultsView(initialView);
        void loadPortalResults(initialView, Boolean(preferred));
      })
      .catch(() => {
        if (!active) return;
        const fallback: ResultsView = { kind: "latest" };
        setResultsView(fallback);
        void loadPortalResults(fallback, false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function refreshHistory(purpose: "sale" | "rent" = "sale") {
    const response = await fetch(`/api/history?purpose=${purpose}&limit=200`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) return;
    if (purpose === "sale") setSaleHistory(data.items);
    else setRentHistory(data.items);
  }

  useEffect(() => {
    if (section === "history-sale" || section === "history-rent") {
      void refreshHistory(section === "history-rent" ? "rent" : "sale");
    }
  }, [section]);

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
      if (data.searchQuota !== undefined) {
        setAuthUser((previous) =>
          previous
            ? {
                ...previous,
                searchesUsed: data.searchesUsed ?? previous.searchesUsed,
                searchQuota: data.searchQuota ?? previous.searchQuota,
              }
            : previous,
        );
      }
      setCollectingPortals(true);
      const portalResponse = await fetch("/api/playwright/portals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ collectionId: data.id, filters }),
      });
      const portalData = await portalResponse.json();
      if (!portalResponse.ok) throw new Error(portalData.error);
      setPortalRun(portalData);
      setResultsView({ kind: "manual" });
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
    const listing = visiblePortalListings.find((item) => item.id === listingId);
    const runId = listing?.lastSearchRunId ?? portalRun.id;
    setAnalyzingProperties((previous) => ({ ...previous, [listingId]: true }));
    setPropertyAnalysisErrors((previous) => ({ ...previous, [listingId]: "" }));
    try {
      const response = await fetch("/api/analyze-property", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId, listingId }),
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
      if (refresh) await Promise.all([refreshHistory(), refreshDismissed()]);
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
    const targets = saleApartmentsForAi.slice(
      0,
      batchSize === "all" ? saleApartmentsForAi.length : batchSize,
    );
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
          {visibleSections.map((item) => (
            <button
              type="button"
              className={section === item.id ? "active" : ""}
              onClick={() => {
                setSection(item.id);
                if (item.id === "admin") refreshAdminUsers().catch(() => undefined);
                if (item.id === "control-panel") refreshControlPanel().catch(() => undefined);
              }}
              key={item.id}
            >
              {item.label}
            </button>
          ))}
        </nav>
        {authUser && (
          <p className="user-badge">
            {authUser.displayName} · {userRoleLabel(authUser.role)} · buscas{" "}
            {formatSearchQuotaUsage(authUser.searchesUsed, authUser.searchQuota)}
          </p>
        )}
        <button
          type="button"
          className="secondary-button"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            window.location.href = "/login";
          }}
        >
          Sair
        </button>
        <small>Busca automática a cada hora para cada filtro salvo.</small>
      </aside>
      <main className={section === "map" ? "map-main" : undefined}>
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
              <option value="sale">Comprar</option>
              <option value="rent">Alugar</option>
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
          <label>
            Tipo de imóvel
            <select
              value={
                filters.propertyTypes.includes("apartment") && filters.propertyTypes.includes("penthouse")
                  ? "both"
                  : filters.propertyTypes.includes("penthouse")
                    ? "penthouse"
                    : "apartment"
              }
              onChange={(event) => {
                const value = event.target.value;
                updateFilter(
                  "propertyTypes",
                  value === "both"
                    ? ["apartment", "penthouse"]
                    : value === "penthouse"
                      ? ["penthouse"]
                      : ["apartment"],
                );
              }}
            >
              <option value="apartment">Apartamento</option>
              <option value="penthouse">Cobertura</option>
              <option value="both">Apartamento e cobertura</option>
            </select>
          </label>
          <button
            className="collect-button"
            disabled={
              collecting ||
              filters.propertyTypes.length === 0 ||
              selectedNeighborhoods.length === 0 ||
              manualSearchBlocked
            }
          >
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
                <option key={saved.id} value={saved.id}>
                  {saved.title.includes("Apartamento") || saved.title.includes("Cobertura")
                    ? saved.title
                    : `${saved.title} · ${propertyTypesFilterLabel(saved.filters.propertyTypes)}`}
                </option>
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
        {manualSearchBlocked && (
          <p className="error" role="alert">
            Sua cota de buscas manuais ({formatSearchQuota(authUser?.searchQuota ?? 10)}) foi atingida.
            Peça a um administrador para ampliar ou liberar buscas ilimitadas.
          </p>
        )}
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
              Escolha o agendamento para ver imóveis acumulados de todas as execuções dele. Cada nova
              hora incrementa a lista sem repetir o mesmo imóvel.
            </p>
          </div>
          {portalRun && <time>{new Date(portalRun.collectedAt).toLocaleString("pt-BR")}</time>}
        </div>
        <div className="results-source-bar">
          <label className="results-source-select">
            Fonte dos resultados
            <select
              value={resultsViewSelectValue(resultsView)}
              onChange={(event) => handleResultsViewSelect(event.target.value)}
              disabled={loadingResults}
            >
              {!resultsView && (
                <option value="" disabled>
                  Carregando agendamentos…
                </option>
              )}
              {savedSearches.map((saved) => (
                <option key={saved.id} value={saved.id}>
                  {saved.title}
                  {saved.completedRunCount > 0
                    ? ` · ${saved.completedRunCount} execução${saved.completedRunCount === 1 ? "" : "ões"}`
                    : " · ainda sem coleta"}
                </option>
              ))}
              <option value="manual">Busca manual (acumulada)</option>
              <option value="latest">Última coleta global</option>
            </select>
          </label>
          {loadingResults && <p role="status">Atualizando lista…</p>}
          {portalRun?.accumulatedRunCount && portalRun.accumulatedRunCount > 1 ? (
            <p className="results-source-note">
              {portalRun.savedSearchTitle ? `Agendamento “${portalRun.savedSearchTitle}” · ` : ""}
              {portalRun.accumulatedRunCount} execuções acumuladas · {visiblePortalListings.length}{" "}
              imóveis após filtros
            </p>
          ) : null}
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
                {saleApartmentsForAi.length > 0 && (
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
                      <option value="all">Todos ({saleApartmentsForAi.length})</option>
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
                      <div className="card-top">
                        <span className="source-label">{listing.sources.join(" + ")}</span>
                        <div className="card-listing-actions">
                          <button
                            type="button"
                            className={`favorite-star${favoriteLinks.includes(listing.link) ? " active" : ""}`}
                            aria-label={
                              favoriteLinks.includes(listing.link)
                                ? "Remover dos favoritos"
                                : "Adicionar aos favoritos"
                            }
                            onClick={() => toggleFavorite(listing)}
                          >
                            ★
                          </button>
                          <button
                            type="button"
                            className="danger-button"
                            onClick={() => dismissListing(listing)}
                          >
                            Descartar
                          </button>
                        </div>
                      </div>
                    <h3>{listing.title}</h3>
                      <p className="listing-model-badges">
                        <span className="badge-purpose">{purposeLabel(listing.purpose)}</span>
                        <span className="badge-type">{propertyTypeLabel(listing.propertyType)}</span>
                      </p>
                      <strong className="captured-price">{currency(listing.price)}</strong>
                      <p>
                        {listing.bedrooms ?? "—"} quartos · {listing.parkingSpaces ?? "—"} vagas · {listing.areaM2 ?? "—"} m²
                      </p>
                      <p>{listing.neighborhood}</p>
                      <p className="address-line">{listing.location ?? "Endereço não informado"}</p>
                      {listing.locationStatus !== "confirmed" && (
                        <p className="location-warning">Não foi possível determinar a cidade com segurança.</p>
                      )}
                      {supportsSlabFeatureAnalysis(listing) ? (
                        <button
                          type="button"
                          className="ai-analysis-button"
                          disabled={
                            analyzingProperties[listing.id] ||
                            Boolean(analysis) ||
                            Boolean(batchProgress)
                          }
                          onClick={() => analyzeProperty(listing.id)}
                        >
                          {analyzingProperties[listing.id]
                            ? "Lendo descrição e analisando…"
                            : analysis
                              ? "Análise concluída"
                              : "Analisar laje e churrasqueira com IA"}
                        </button>
                      ) : (
                        <p className="rent-note">{listingActionsHint(listing)}</p>
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
                : "Modelo comprar: listas por interesse (laje/churrasqueira) e sem essas características — tipo apartamento ou cobertura."}
            </p>
          </div>
          <span className="count">{filteredHistory.length}</span>
        </div>
        <div className="history-classifiers" role="group" aria-label="Filtrar histórico por tipo de imóvel">
          <span>Tipo de imóvel</span>
          {([
            ["all", "Todos"],
            ["apartment", "Apartamento"],
            ["penthouse", "Cobertura"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={historyPropertyType === id ? "active" : "secondary-button"}
              onClick={() => setHistoryPropertyType(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {section === "history-sale" && (
          <div className="history-classifiers" role="group" aria-label="Classificar histórico de compra">
            <span>Classificar por interesse</span>
            {saleHistoryFilters.map((option) => (
              <button
                key={option.id}
                type="button"
                className={saleHistoryFilter === option.id ? "active" : "secondary-button"}
                onClick={() => setSaleHistoryFilter(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
        {section === "history-rent" && (
          <div className="history-classifiers" role="group" aria-label="Classificar histórico de aluguel">
            <span>Classificar por valor do aluguel</span>
            {rentHistoryFilters.map((option) => (
              <button
                key={option.id}
                type="button"
                className={rentHistoryFilter === option.id ? "active" : "secondary-button"}
                onClick={() => setRentHistoryFilter(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
        {historyError && <p className="error" role="alert">{historyError}</p>}
        {filteredHistory.length ? (
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
                        <div className="card-top">
                          <span className="source-label">{item.source} · {item.neighborhood}</span>
                          <button
                            type="button"
                            className={`favorite-star${favoriteLinks.includes(item.link) ? " active" : ""}`}
                            aria-label={favoriteLinks.includes(item.link) ? "Remover dos favoritos" : "Favoritar"}
                            onClick={() => void toggleFavorite(historyItemToListing(item))}
                          >
                            ★
                          </button>
                        </div>
                        <h3>{item.title}</h3>
                        <p className="address-line">{item.location ?? "Endereço não informado"}</p>
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
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => void toggleFavorite(historyItemToListing(item))}
                        >
                          {favoriteLinks.includes(item.link) ? "Remover favorito" : "Favoritar"}
                        </button>
                        <button
                          type="button"
                          className="danger-button"
                          onClick={() => void dismissListing(historyItemToListing(item))}
                        >
                          Descartar
                        </button>
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
      {section === "map" && (
        <section className="map-panel semester-history" aria-labelledby="map-title">
              <div className="section-heading">
                <div>
              <p className="eyebrow">Localização</p>
              <h2 id="map-title">Mapa de imóveis</h2>
              <p className="list-description">
                Resultados atuais, favoritos e históricos. Apartamentos em verde claro, coberturas em
                verde escuro; sem rua no anúncio, usa o centro do bairro.
              </p>
                </div>
            <span className="count">{mapProperties.length}</span>
              </div>
          {mapProperties.length ? (
            <PropertyMap
              properties={mapProperties}
              favoriteLinks={favoriteLinks}
              onClassify={classifyMapProperty}
              onToggleFavorite={(property) => void toggleFavorite(mapPropertyToListing(property))}
              onDismiss={(property) => void dismissListing(mapPropertyToListing(property))}
            />
          ) : (
            <p className="history-empty">
              Nenhum imóvel com endereço disponível. Execute uma busca ou consulte o histórico.
            </p>
          )}
        </section>
      )}
      {section === "favorites" && (
        <section className="semester-history" aria-labelledby="favorites-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Lista pessoal</p>
              <h2 id="favorites-title">Favoritos</h2>
              <p className="list-description">Imóveis marcados com estrela em resultados ou histórico.</p>
            </div>
            <span className="count">{favoriteItems.length}</span>
          </div>
          {favoriteItems.length ? (
            <div className="playwright-listings">
              {favoriteItems.map((listing) => (
                <article key={listing.link}>
                  <div className="card-top">
                    <span className="source-label">{listing.source}</span>
                    <button
                      type="button"
                      className="favorite-star active"
                      aria-label="Remover dos favoritos"
                      onClick={() => toggleFavorite(listing)}
                    >
                      ★
                    </button>
                  </div>
                    <h3>{listing.title}</h3>
                  <p className="listing-model-badges">
                    <span className="badge-purpose">{purposeLabel(listing.purpose)}</span>
                    <span className="badge-type">{propertyTypeLabel(listing.propertyType)}</span>
                  </p>
                  <strong className="captured-price">{currency(listing.price)}</strong>
                  <p className="address-line">{listing.location ?? "Endereço não informado"}</p>
                  <p>{listing.neighborhood}</p>
                  <a href={listing.link} target="_blank" rel="noreferrer">
                    Abrir anúncio ↗
                  </a>
                </article>
              ))}
                      </div>
          ) : (
            <p className="history-empty">Nenhum favorito ainda. Use a estrela nos cards (qualquer tipo e modelo).</p>
          )}
        </section>
      )}
      {section === "dismissed" && (
        <section className="semester-history" aria-labelledby="dismissed-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Lista pessoal</p>
              <h2 id="dismissed-title">Descartados</h2>
              <p className="list-description">
                Imóveis descartados não aparecem em resultados, favoritos, históricos ou mapa.
              </p>
                    </div>
            <span className="count">{filteredDismissedItems.length}</span>
          </div>
          <div className="history-classifiers" role="group" aria-label="Filtrar descartados por tipo de imóvel">
            <span>Tipo de imóvel</span>
            {([
              ["all", "Todos"],
              ["apartment", "Apartamento"],
              ["penthouse", "Cobertura"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={dismissedPropertyType === id ? "active" : "secondary-button"}
                onClick={() => setDismissedPropertyType(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {filteredDismissedItems.length ? (
            <div className="playwright-listings">
              {filteredDismissedItems.map((item) => (
                <article key={`${item.propertyId}:${item.link}`}>
                  <span className="source-label">{item.source}</span>
                  <h3>{item.title}</h3>
                  <p className="listing-model-badges">
                    <span className="badge-purpose">{purposeLabel(item.purpose)}</span>
                    <span className="badge-type">{propertyTypeLabel(item.propertyType)}</span>
                  </p>
                  <strong className="captured-price">{currency(item.rentAmount)}</strong>
                  <p className="address-line">{item.location ?? "Endereço não informado"}</p>
                  <p>{item.neighborhood}</p>
                  {item.dismissedByAi && <p className="ai-dismissed-label">Descartado por IA</p>}
                  <p>Descartado em {new Date(item.seenAt).toLocaleDateString("pt-BR")}.</p>
                  <a href={item.link} target="_blank" rel="noreferrer">
                    Abrir anúncio ↗
                  </a>
                  </article>
                ))}
              </div>
          ) : (
            <p className="history-empty">Nenhum imóvel descartado para este tipo.</p>
          )}
            </section>
          )}
      {section === "control-panel" && authUser?.role === "admin" && (
        <section className="semester-history control-panel" aria-labelledby="control-panel-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Administração</p>
              <h2 id="control-panel-title">Control Painel</h2>
              <p className="list-description">
                Visão consolidada de imóveis, buscas, classificações e responsáveis.
              </p>
            </div>
            <button type="button" className="secondary-button" onClick={() => void refreshControlPanel()}>
              Atualizar
            </button>
          </div>
          {controlPanelError && <p className="error" role="alert">{controlPanelError}</p>}
          {!controlPanel ? (
            <p className="history-empty">Carregando indicadores…</p>
          ) : (
            <>
              <div className="control-metrics">
                <article><span>Imóveis únicos</span><strong>{controlPanel.totals.properties}</strong></article>
                <article><span>Buscas realizadas</span><strong>{controlPanel.totals.searches}</strong></article>
                <article><span>Classificações IA</span><strong>{controlPanel.totals.analyses}</strong></article>
                <article><span>Imóveis classificados</span><strong>{controlPanel.totals.classifiedProperties}</strong></article>
              </div>
              <div className="control-breakdowns">
                <section>
                  <h3>Por tipo de imóvel</h3>
                  <ul>{controlPanel.byType.map((item) => <li key={item.label}><span>{item.label}</span><strong>{item.count}</strong></li>)}</ul>
          </section>
                <section>
                  <h3>Por finalidade</h3>
                  <ul>{controlPanel.byPurpose.map((item) => <li key={item.label}><span>{item.label}</span><strong>{item.count}</strong></li>)}</ul>
                </section>
                <section>
                  <h3>Qualidade da localização</h3>
                  <ul>{controlPanel.byLocationQuality.map((item) => <li key={item.label}><span>{item.label}</span><strong>{item.count}</strong></li>)}</ul>
                </section>
                <section>
                  <h3>Por classificação</h3>
                  <ul>{controlPanel.byClassification.map((item) => <li key={item.label}><span>{item.label}</span><strong>{item.count}</strong></li>)}</ul>
                </section>
              </div>
              <div className="control-activity">
                <section>
                  <h3>Quem pesquisou</h3>
                  <div className="admin-users-table-wrap">
                    <table className="admin-users-table">
                      <thead><tr><th>Usuário</th><th>Buscas</th></tr></thead>
                      <tbody>{controlPanel.researchers.map((item) => (
                        <tr key={item.userId ?? item.name}><td>{item.name}</td><td>{item.searches}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                </section>
                <section>
                  <h3>Quem classificou</h3>
                  <div className="admin-users-table-wrap">
                    <table className="admin-users-table">
                      <thead><tr><th>Usuário</th><th>Análises</th><th>Imóveis classificados</th></tr></thead>
                      <tbody>{controlPanel.classifiers.map((item) => (
                        <tr key={item.userId ?? item.name}><td>{item.name}</td><td>{item.analyses}</td><td>{item.classifiedProperties}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                </section>
              </div>
            </>
          )}
        </section>
      )}
      {section === "admin" && authUser?.role === "admin" && (
        <section className="schedule-panel admin-panel" aria-labelledby="admin-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Administração</p>
              <h2 id="admin-title">Usuários cadastrados</h2>
              <p className="list-description">
                Administradores configuram o site e gerenciam contas. Usuários comuns usam buscas,
                favoritos e agendamentos, mas não acessam esta área. A cota limita apenas buscas
                manuais na tela Busca (10, 100 ou ilimitada).
              </p>
            </div>
            <span className="count">{adminUsers.length}</span>
          </div>
          {adminStatus && <p role="status">{adminStatus}</p>}
          <h3>Contas cadastradas</h3>
          {adminUsers.length ? (
            <div className="admin-users-table-wrap">
              <table className="admin-users-table">
                <thead>
                  <tr>
                    <th scope="col">Nome</th>
                    <th scope="col">E-mail</th>
                    <th scope="col">Perfil</th>
                    <th scope="col">Cota</th>
                    <th scope="col">Buscas usadas</th>
                    <th scope="col">Login</th>
                    <th scope="col">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {adminUsers.map((user) => (
                    <tr key={user.id}>
                      <td>{user.displayName}</td>
                      <td>{user.email}</td>
                      <td>{userRoleLabel(user.role)}</td>
                      <td>{formatSearchQuota(user.searchQuota)}</td>
                      <td>{formatSearchQuotaUsage(user.searchesUsed, user.searchQuota)}</td>
                      <td>
                        {[user.hasPassword ? "Senha" : null, user.hasGoogle ? "Google" : null]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </td>
                      <td>
                        <div className="admin-user-actions">
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => setEditingUser(user)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="danger-button"
                            onClick={() => deleteAdminUser(user.id)}
                            disabled={user.id === authUser.id}
                          >
                            Apagar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="history-empty">Nenhum usuário cadastrado ainda.</p>
          )}
          <details className="admin-tech-details">
            <summary>Configuração técnica do login (Google, variáveis)</summary>
            {adminSetup && <AuthSetupGuide setup={adminSetup} />}
          </details>
          <h3>Novo usuário</h3>
          <form className="admin-crud-form" onSubmit={createAdminUser}>
            <label>
              Nome
              <input
                value={newUser.displayName}
                onChange={(event) => setNewUser((c) => ({ ...c, displayName: event.target.value }))}
                required
              />
            </label>
            <label>
              E-mail
              <input
                type="email"
                value={newUser.email}
                onChange={(event) => setNewUser((c) => ({ ...c, email: event.target.value }))}
                required
              />
            </label>
            <label>
              Senha
              <input
                type="password"
                minLength={8}
                value={newUser.password}
                onChange={(event) => setNewUser((c) => ({ ...c, password: event.target.value }))}
                required
              />
            </label>
            <label>
              Perfil
              <select
                value={newUser.role}
                onChange={(event) =>
                  setNewUser((c) => ({ ...c, role: event.target.value as "user" | "admin" }))
                }
              >
                <option value="user">Comum</option>
                <option value="admin">Administrador</option>
              </select>
            </label>
            <label>
              Cota de buscas manuais
              <select
                value={quotaSelectValue(newUser.searchQuota)}
                onChange={(event) =>
                  setNewUser((c) => ({ ...c, searchQuota: Number(event.target.value) }))
                }
              >
                <option value="10">10 buscas</option>
                <option value="100">100 buscas</option>
                <option value={UNLIMITED_SEARCH_QUOTA}>Ilimitada</option>
              </select>
            </label>
            <button type="submit">Criar usuário</button>
          </form>
          {editingUser && (
            <>
              <h3>Editar {editingUser.email}</h3>
              <form className="admin-crud-form" onSubmit={saveEditingUser}>
                <label>
                  Nome
                  <input
                    value={editingUser.displayName}
                    onChange={(event) =>
                      setEditingUser((c) => (c ? { ...c, displayName: event.target.value } : c))
                    }
                    required
                  />
                </label>
                <label>
                  Perfil
                  <select
                    value={editingUser.role}
                    onChange={(event) =>
                      setEditingUser((c) =>
                        c ? { ...c, role: event.target.value as "user" | "admin" } : c,
                      )
                    }
                  >
                    <option value="user">Comum</option>
                    <option value="admin">Administrador</option>
                  </select>
                </label>
                <label>
                  Cota de buscas manuais
                  <select
                    value={quotaSelectValue(editingUser.searchQuota)}
                    onChange={(event) =>
                      setEditingUser((c) =>
                        c ? { ...c, searchQuota: Number(event.target.value) } : c,
                      )
                    }
                  >
                    <option value="10" disabled={editingUser.searchesUsed > 10}>
                      10 buscas
                    </option>
                    <option value="100" disabled={editingUser.searchesUsed > 100}>
                      100 buscas
                    </option>
                    <option value={UNLIMITED_SEARCH_QUOTA}>Ilimitada</option>
                  </select>
                </label>
                <label>
                  Nova senha (opcional)
                  <input
                    type="password"
                    minLength={8}
                    value={editPassword}
                    onChange={(event) => setEditPassword(event.target.value)}
                    placeholder="Deixe vazio para manter"
                  />
                </label>
                <button type="submit">Salvar</button>
                <button type="button" className="secondary-button" onClick={() => setEditingUser(null)}>
                  Cancelar
                </button>
              </form>
            </>
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
                  {run.status !== "completed" && (
                    <div className="schedule-actions">
                      <button type="button" className="secondary-button" onClick={() => editSchedulerExecution(run)}>Editar</button>
                      <button type="button" className="danger-button" onClick={() => deleteSchedulerExecution(run)}>Apagar</button>
                    </div>
                  )}
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
