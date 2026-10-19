"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  normalizeSearchFilters,
  type CollectedListing,
  type SearchFilters,
} from "@aluguel/shared/listings";
import { readApiJson } from "@/app/lib/api-proxy";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  metadata?: {
    filterSuggestion?: {
      filters: Partial<SearchFilters>;
      rationale: string;
    };
    citedRules?: string[];
  };
  createdAt: string;
};

type AssistantPayload = {
  reply: string;
  filterSuggestion?: {
    filters: Partial<SearchFilters>;
    rationale: string;
  };
  citedRules?: string[];
};

const quickPrompts = [
  "O que é elegível para aluguel?",
  "Como priorizar cobertura?",
  "Resuma os resultados atuais",
  "Quais filtros você sugere para apartamento com laje?",
];

function buildResultsSummary(listings: CollectedListing[]) {
  return listings.slice(0, 30).map((listing) => {
    const row: Record<string, string | number> = {
      title: listing.title,
      neighborhood: listing.neighborhood,
      purpose: listing.purpose,
      propertyType: listing.propertyType,
      link: listing.link.length > 500 ? listing.link.slice(0, 500) : listing.link,
    };
    if (typeof listing.price === "number" && Number.isFinite(listing.price)) row.price = listing.price;
    if (typeof listing.bedrooms === "number" && Number.isFinite(listing.bedrooms)) row.bedrooms = listing.bedrooms;
    if (typeof listing.parkingSpaces === "number" && Number.isFinite(listing.parkingSpaces)) {
      row.parkingSpaces = listing.parkingSpaces;
    }
    if (listing.locationStatus) row.locationStatus = listing.locationStatus;
    return row;
  });
}

type SearchAssistantChatProps = {
  city: string;
  neighborhoods: string[];
  filters: SearchFilters;
  listings: CollectedListing[];
  onApplyFilterSuggestion: (filters: SearchFilters) => void;
};

export function SearchAssistantChat({
  city,
  neighborhoods,
  filters,
  listings,
  onApplyFilterSuggestion,
}: SearchAssistantChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/chat/session", { cache: "no-store" })
      .then(async (response) => {
        const data = await readApiJson<{ messages?: ChatMessage[]; error?: string }>(response);
        if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar o assistente.");
        setMessages(data.messages ?? []);
        setSessionReady(true);
      })
      .catch((requestError) => {
        setError(requestError instanceof Error ? requestError.message : "Erro ao carregar sessão.");
      });
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError("");
    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    setMessages((previous) => [...previous, optimistic]);
    setInput("");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          context: {
            city,
            neighborhoods,
            filters,
            resultsSummary: buildResultsSummary(listings),
          },
        }),
      });
      const data = await readApiJson<{ message?: AssistantPayload; error?: string }>(response);
      if (!response.ok) throw new Error(data.error ?? "O assistente não respondeu.");
      const assistant = data.message;
      if (!assistant) throw new Error("Resposta vazia do assistente.");
      setMessages((previous) => [
        ...previous,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: assistant.reply,
          metadata: {
            filterSuggestion: assistant.filterSuggestion,
            citedRules: assistant.citedRules,
          },
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível enviar.");
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void sendMessage(input);
  }

  function applySuggestion(suggestion: NonNullable<ChatMessage["metadata"]>["filterSuggestion"]) {
    if (!suggestion?.filters) return;
    onApplyFilterSuggestion(
      normalizeSearchFilters({
        ...filters,
        ...suggestion.filters,
      }),
    );
  }

  return (
    <section className="assistant-panel" aria-labelledby="assistant-title">
      <header className="assistant-header">
        <p className="eyebrow">Assistente</p>
        <h2 id="assistant-title">Chat para facilitar pesquisas</h2>
        <p className="assistant-disclaimer">
          O assistente não inicia buscas nem altera favoritos; use Busca e Resultados para agir.
        </p>
      </header>
      {!sessionReady && !error && <p role="status">Carregando conversa…</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="assistant-quick-prompts" role="group" aria-label="Sugestões rápidas">
        {quickPrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            className="assistant-chip"
            disabled={loading || !sessionReady}
            onClick={() => void sendMessage(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>
      <div className="assistant-messages" ref={listRef} aria-live="polite">
        {messages.length === 0 && sessionReady && (
          <p className="hint">Pergunte sobre critérios, filtros ou peça um resumo dos resultados carregados.</p>
        )}
        {messages.map((message) => (
          <article
            key={message.id}
            className={`assistant-message assistant-message-${message.role}`}
          >
            <p>{message.content}</p>
            {message.metadata?.citedRules?.length ? (
              <ul className="assistant-cited-rules">
                {message.metadata.citedRules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            ) : null}
            {message.metadata?.filterSuggestion ? (
              <div className="assistant-suggestion">
                <p>{message.metadata.filterSuggestion.rationale}</p>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => applySuggestion(message.metadata?.filterSuggestion)}
                >
                  Aplicar filtros sugeridos
                </button>
              </div>
            ) : null}
          </article>
        ))}
        {loading && <p role="status">Assistente pensando…</p>}
      </div>
      <form className="assistant-compose" onSubmit={onSubmit}>
        <label className="sr-only" htmlFor="assistant-input">
          Mensagem para o assistente
        </label>
        <textarea
          id="assistant-input"
          rows={3}
          value={input}
          disabled={loading || !sessionReady}
          placeholder="Ex.: quais imóveis atuais parecem mais alinhados com Botafogo?"
          onChange={(event) => setInput(event.target.value)}
        />
        <button type="submit" disabled={loading || !sessionReady || !input.trim()}>
          Enviar
        </button>
      </form>
    </section>
  );
}
