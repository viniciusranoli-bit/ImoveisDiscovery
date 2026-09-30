"use client";

import { FormEvent, useMemo, useState } from "react";
import type { Listing, SearchRun, SerperCollection } from "@/lib/listings";

const currency = (value?: number) =>
  value === undefined ? "Não informado" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const monthlyExtras = (listing: Listing) =>
  listing.condo === undefined || listing.iptu === undefined
    ? "Não informado"
    : currency(listing.condo + listing.iptu);

const feedbackActions = ["Gostei", "Não gostei", "Muito caro", "Muito longe", "Quero visitar", "Não mostrar mais", "Não abre o link"] as const;
const classificationActions = ["Priorizar cobertura", "Descartar cobertura", "Revisar cobertura"] as const;
type FeedbackAction = (typeof feedbackActions)[number] | (typeof classificationActions)[number];
const neighborhoods = ["Botafogo", "Catete", "Copacabana", "Cosme Velho", "Flamengo", "Gávea", "Glória", "Humaitá", "Ipanema", "Jardim Botânico", "Lagoa", "Laranjeiras", "Leblon", "Leme", "São Conrado", "Urca"];

export default function Home() {
  const [count, setCount] = useState(10);
  const [city] = useState("Rio de Janeiro");
  const [neighborhood, setNeighborhood] = useState("Botafogo");
  const [collection, setCollection] = useState<SerperCollection>();
  const [run, setRun] = useState<SearchRun>();
  const [error, setError] = useState("");
  const [collecting, setCollecting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [siteStatus, setSiteStatus] = useState<{ analyzedSites: string[]; unanalysedSites: string[] }>();
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const summary = useMemo(() => {
    if (!run) return null;
    const high = run.listings.filter((listing) => listing.priority === "Alta").length;
    return { high, best: run.listings[0] };
  }, [run]);

  async function collectSearch(event: FormEvent) {
    event.preventDefault();
    setCollecting(true);
    setError("");
    setRun(undefined);
    setSiteStatus(undefined);
    try {
      const response = await fetch("/api/collect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ city, neighborhood }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setCollection(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Falha na consulta.");
    } finally {
      setCollecting(false);
    }
  }

  async function analyzeSearch(event: FormEvent) {
    event.preventDefault();
    if (!collection) return;
    setAnalyzing(true);
    setError("");
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ collectionId: collection.id, count }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setRun(data);
      setSiteStatus({ analyzedSites: data.analyzedSites, unanalysedSites: data.unanalysedSites });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Falha na análise.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function sendFeedback(listing: Listing, action: FeedbackAction) {
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ link: listing.link, action, note: notes[listing.id] }),
      });
      if (!response.ok) throw new Error();
      setFeedback((previous) => ({ ...previous, [listing.id]: action }));
    } catch {
      setError("Não foi possível salvar o feedback.");
    }
  }

  return (
    <main>
      <header className="hero">
        <p className="eyebrow">Rio de Janeiro · aluguel residencial</p>
        <h1>Radar de aluguel</h1>
        <p className="subtitle">Coleta anúncios da Zona Sul e permite analisar uma quantidade escolhida com IA.</p>
        <form onSubmit={collectSearch} className="search-form">
          <label>
            Cidade
            <select value={city} disabled><option>Rio de Janeiro</option></select>
          </label>
          <label>
            Bairro da Zona Sul
            <select value={neighborhood} onChange={(event) => setNeighborhood(event.target.value)}>
              {neighborhoods.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <button disabled={collecting}>{collecting ? "Coletando…" : "Buscar na Serper"}</button>
        </form>
        {collection && (
          <>
            <section className="collection-notice">
              <b>Serper consultada: {collection.neighborhood}, {collection.city}.</b> Foram coletados {collection.results.length} resultados e todos os dados disponíveis foram gravados em <code>json/serper</code>.
            </section>
            <details className="serper-json" open>
              <summary>Resposta completa da Serper — lista enviada para a LLM</summary>
              <pre>{JSON.stringify(collection.rawResponse, null, 2)}</pre>
            </details>
          </>
        )}
        <form onSubmit={analyzeSearch} className="search-form analysis-form">
          <label>
            Quantidade para análise pela IA
            <input aria-label="Quantidade de imóveis" type="number" min="1" max="25" value={count} onChange={(event) => setCount(Number(event.target.value))} />
          </label>
          <button disabled={!collection || analyzing}>{analyzing ? "Analisando…" : "Analisar com IA"}</button>
        </form>
        <p className="hint">A coleta não utiliza IA. A análise usa o conteúdo já salvo e mantém campos ausentes como “não informado”.</p>
      </header>

      {error && <p className="error" role="alert">{error}</p>}
      {siteStatus && (
        <section className="site-status">
          <article><h2>Sites analisados ({siteStatus.analyzedSites.length})</h2><p>{siteStatus.analyzedSites.join(", ") || "Nenhum site retornou anúncio estruturado."}</p></article>
          <article><h2>Sites não analisados ({siteStatus.unanalysedSites.length})</h2><p>{siteStatus.unanalysedSites.join(", ") || "Todos os sites coletados foram analisados."}</p></article>
        </section>
      )}

      {summary && (
        <>
          <section className="summary" aria-label="Resumo da consulta">
            <article><span>Novos resultados</span><strong>{run?.listings.length}</strong></article>
            <article><span>Prioridade alta</span><strong>{summary.high}</strong></article>
            <article><span>Melhor oportunidade</span><strong>{summary.best ? `${summary.best.score}/100` : "—"}</strong><small>{summary.best?.alerts[0] ?? "Sem alerta crítico identificado"}</small></article>
          </section>

          {run?.listings.length === 0 ? (
            <section className="empty"><h2>Nenhum novo imóvel elegível</h2><p>Aumente a quantidade ou faça uma nova consulta mais tarde.</p></section>
          ) : (
            <section className="results">
              <div className="section-heading"><div><p className="eyebrow">Resultado da consulta</p><h2>Imóveis encontrados</h2></div><time>{new Date(run!.searchedAt).toLocaleString("pt-BR")}</time></div>
              <div className="cards">
                {run?.listings.map((listing) => (
                  <article className="listing" key={listing.id}>
                    <div className="listing-top"><span className={`priority ${listing.priority.toLowerCase()}`}>{listing.priority}</span><span className="score">{listing.score}<small>/100</small></span></div>
                    <h3>{listing.title}</h3>
                    <p className="location">{listing.location || listing.neighborhood}</p>
                    <p className="price">{currency(listing.rent)} <span>/ mês</span></p>
                    <p className="costs">Condomínio + IPTU: {monthlyExtras(listing)} · Total: {currency(listing.totalMonthly)}</p>
                    <dl>
                      <div><dt>Quartos</dt><dd>{listing.bedrooms ?? "—"}</dd></div>
                      <div><dt>Vaga</dt><dd>{listing.parkingSpaces ?? "—"} · {listing.parkingType}</dd></div>
                      <div><dt>Trabalho</dt><dd>{listing.walkToWorkMin !== undefined ? `${listing.walkToWorkMin} min a pé` : "Não informado"}</dd></div>
                      <div><dt>Metrô</dt><dd>{listing.metroStation ? `${listing.metroStation} · ${listing.walkToMetroMin ?? "—"} min` : "Não informado"}</dd></div>
                    </dl>
                    <div className="reason"><b>Nota baseada em</b>{listing.scoreReasons.length ? <ul>{listing.scoreReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : <p>Informações publicadas insuficientes para detalhar a preferência.</p>}</div>
                    {listing.alerts.length > 0 && <p className="alerts">Atenção: {listing.alerts.join(" ")}</p>}
                    <a className="property-link" href={listing.link} target="_blank" rel="noreferrer">Abrir anúncio <span aria-hidden>↗</span></a>
                    <div className="feedback">
                      <label htmlFor={`note-${listing.id}`}>Feedback para próximas buscas</label>
                      <input id={`note-${listing.id}`} placeholder="Motivo opcional" value={notes[listing.id] ?? ""} onChange={(event) => setNotes((previous) => ({ ...previous, [listing.id]: event.target.value }))} />
                      <div className="feedback-actions">
                        {feedbackActions.map((action) => <button type="button" className={feedback[listing.id] === action ? "chosen" : ""} onClick={() => sendFeedback(listing, action)} key={action}>{action}</button>)}
                      </div>
                      {feedback[listing.id] && <small>Feedback “{feedback[listing.id]}” salvo em MEMORY.md.</small>}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
          {run && run.rejectedPenthouses.length > 0 && (
            <section className="results secondary-results">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Lista para aprendizado</p>
                  <h2>Coberturas fora do filtro obrigatório</h2>
                  <p className="list-description">Não atendem a quarto, vaga ou disponibilidade confirmada. Classifique para orientar buscas futuras.</p>
                </div>
                <span className="count">{run.rejectedPenthouses.length}</span>
              </div>
              <div className="cards">
                {run.rejectedPenthouses.map((listing) => (
                  <article className="listing" key={listing.id}>
                    <div className="listing-top"><span className="priority baixa">Fora do filtro</span><span className="score">{listing.score}<small>/100</small></span></div>
                    <h3>{listing.title}</h3>
                    <p className="location">{listing.location || listing.neighborhood}</p>
                    <p className="price">{currency(listing.rent)} <span>/ mês</span></p>
                    <dl>
                      <div><dt>Quartos</dt><dd>{listing.bedrooms ?? "Não informado"}</dd></div>
                      <div><dt>Vaga</dt><dd>{listing.parkingSpaces ?? "Não informado"} · {listing.parkingType}</dd></div>
                      <div><dt>Trabalho</dt><dd>{listing.walkToWorkMin !== undefined ? `${listing.walkToWorkMin} min a pé` : "Não informado"}</dd></div>
                      <div><dt>Motivo</dt><dd>{listing.alerts[0] ?? "Requisito obrigatório não confirmado"}</dd></div>
                    </dl>
                    <a className="property-link" href={listing.link} target="_blank" rel="noreferrer">Abrir anúncio <span aria-hidden>↗</span></a>
                    <div className="feedback classifier">
                      <label htmlFor={`classify-${listing.id}`}>Classificador de cobertura</label>
                      <input id={`classify-${listing.id}`} placeholder="Explique o que influencia sua decisão" value={notes[listing.id] ?? ""} onChange={(event) => setNotes((previous) => ({ ...previous, [listing.id]: event.target.value }))} />
                      <div className="feedback-actions">
                        {classificationActions.map((action) => <button type="button" className={feedback[listing.id] === action ? "chosen" : ""} onClick={() => sendFeedback(listing, action)} key={action}>{action}</button>)}
                      </div>
                      <small>{feedback[listing.id] ? `Classificação “${feedback[listing.id]}” salva no MEMORY.md.` : "Inclua um motivo para ensinar uma preferência específica."}</small>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
          <section className="bottom-grid">
            <article><h2>Melhores opções</h2>{run?.listings.slice(0, 3).map((item) => <p key={item.id}><b>{item.title}</b> — {item.scoreReasons[0] ?? "Dados confirmados no anúncio."}</p>)}</article>
            <article><h2>Pendências para confirmar</h2><p>Vaga, disponibilidade, valores extras e rota devem ser confirmados com o anunciante quando estiverem sinalizados.</p></article>
          </section>
        </>
      )}
    </main>
  );
}
