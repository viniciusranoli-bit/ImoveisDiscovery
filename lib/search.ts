import {
  deduplicate,
  isEligible,
  scoreListing,
  type RawListing,
  type SearchFilters,
  type SearchRun,
  type SerperCollection,
  type SerperResult,
} from "./listings";
import { getSeenLinks, readAgentContext } from "./storage";

type SearchResult = SerperResult;

async function externalFetch(service: string, input: RequestInfo | URL, init: RequestInit) {
  try {
    return await fetch(input, init);
  } catch (error) {
    const cause = error instanceof Error && "cause" in error ? error.cause : undefined;
    const code =
      cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string"
        ? ` (${cause.code})`
        : "";
    throw new Error(`${service}: não foi possível conectar ao serviço externo${code}.`);
  }
}

async function searchWeb(query: string) {
  const endpoint = process.env.SEARCH_API_ENDPOINT || "https://google.serper.dev/search";
  const key = process.env.SEARCH_API_KEY;
  if (!key) {
    throw new Error("Configure SEARCH_API_KEY no arquivo backend/.env para pesquisar anúncios ao vivo.");
  }

  const response = await externalFetch("Busca", endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", "X-API-KEY": key },
    body: JSON.stringify({ q: query, num: 100 }),
    cache: "no-store",
  });
  if (!response.ok) {
    const details = await response.text();
    const safeDetails = details.replace(/["']?(?:api[_-]?key|authorization)["']?\s*[:=]\s*["']?[^"',}\s]+/gi, "[redigido]");
    throw new Error(
      `A API de busca retornou ${response.status}${safeDetails ? `: ${safeDetails.slice(0, 300)}` : "."}`,
    );
  }
  const payload = (await response.json()) as { results?: SearchResult[]; organic?: SearchResult[] };
  return { results: payload.results ?? payload.organic ?? [], rawResponse: payload };
}

export async function collectSerperResults(
  city: "Rio de Janeiro",
  neighborhood: string | string[],
  filters: SearchFilters,
) {
  const purpose = filters.purpose === "sale" ? "comprar" : "alugar";
  const types = filters.propertyTypes
    .map((type) => (type === "penthouse" ? "cobertura" : "apartamento"))
    .join(" ou ");
  const price = [
    filters.priceMin !== undefined ? `a partir de R$ ${filters.priceMin}` : "",
    filters.priceMax !== undefined ? `até R$ ${filters.priceMax}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const places = (Array.isArray(neighborhood) ? neighborhood : [neighborhood]).join(" ou ");
  const query = `${types} para ${purpose} ${places} ${city} ${filters.bedroomsMin}+ quartos ${filters.parkingMin}+ vagas ${price}`.trim();
  const { results, rawResponse } = await searchWeb(query);
  return { query, results, rawResponse };
}

function jsonFromModel(content: string) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? content;
  const parsed = JSON.parse(fenced) as { listings?: RawListing[] } | RawListing[];
  return Array.isArray(parsed) ? parsed : parsed.listings ?? [];
}

async function extractListings(results: SearchResult[], count: number) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Configure OPENAI_API_KEY para analisar os resultados da busca.");
  const { agent, memory } = await readAgentContext();
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const prompt = `Você estrutura anúncios imobiliários no Rio de Janeiro. Use somente dados presentes no material de busca. Nunca invente dados. Retorne JSON puro com {"listings":[...]}, no máximo ${count * 2} elementos. Cada elemento deve conter: title, platform, link, location, neighborhood, publishedAt, rent, condo, iptu, areaM2, bedrooms, bathrooms, parkingSpaces, parkingType, furnished, barbecueBalcony, isPenthouse, walkToWorkMin, walkToWorkSource, metroStation, walkToMetroMin, available, evidence. Marque isPenthouse=true apenas se título, descrição ou tipo disser explicitamente cobertura/penthouse. Valores ausentes devem ser omitidos. Só considere available como true quando o resultado indicar anúncio atual/coerente. Para esta tela, retorne todo anúncio com link verificável, mesmo se não atender aos requisitos obrigatórios; os requisitos serão classificados depois e não devem eliminar itens da resposta.\n\nREGRAS:\n${agent}\n\nMEMÓRIA:\n${memory}\n\nRESULTADOS DE BUSCA:\n${JSON.stringify(results)}`;

  const response = await externalFetch("OpenAI", "https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Você extrai dados verificáveis e preserva incertezas." },
        { role: "user", content: prompt },
      ],
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    const details = await response.text();
    const safeDetails = details.replace(/["']?(?:api[_-]?key|authorization)["']?\s*[:=]\s*["']?[^"',}\s]+/gi, "[redigido]");
    throw new Error(
      `O modelo retornou ${response.status}${safeDetails ? `: ${safeDetails.slice(0, 300)}` : "."}`,
    );
  }
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("O modelo não retornou uma resposta utilizável.");
  return jsonFromModel(content);
}

export async function runSearch(count: number): Promise<Pick<SearchRun, "listings" | "rejectedPenthouses">> {
  // Consultas amplas, sem requisitos de bairro, quartos ou vaga, deixam a Serper retornar
  // o conjunto disponível. Os requisitos são classificados apenas após a coleta.
  const [regularResponse, penthouseResponse, seen] = await Promise.all([
    searchWeb("imóveis para alugar Rio de Janeiro"),
    searchWeb("coberturas para alugar Rio de Janeiro"),
    getSeenLinks(),
  ]);
  const seenSet = new Set(seen);
  const extracted = await extractListings([...regularResponse.results, ...penthouseResponse.results], count);
  const fresh = deduplicate(extracted.map(scoreListing)).filter((listing) => !seenSet.has(listing.link));
  return {
    listings: fresh
      .filter((listing) => !listing.isPenthouse || isEligible(listing))
      .sort((a, b) => b.score - a.score)
      .slice(0, count),
    rejectedPenthouses: fresh
      .filter((listing) => listing.isPenthouse && !isEligible(listing))
      .sort((a, b) => b.score - a.score)
      .slice(0, count),
  };
}

export async function analyzeSerperCollection(
  collection: SerperCollection,
  count: number,
): Promise<Pick<SearchRun, "listings" | "rejectedPenthouses">> {
  const [extracted, seen] = await Promise.all([extractListings(collection.results, count), getSeenLinks()]);
  const seenSet = new Set(seen);
  const fresh = deduplicate(extracted.map(scoreListing)).filter((listing) => !seenSet.has(listing.link));
  return {
    listings: fresh
      .filter((listing) => !listing.isPenthouse || isEligible(listing))
      .sort((a, b) => b.score - a.score)
      .slice(0, count),
    rejectedPenthouses: fresh
      .filter((listing) => listing.isPenthouse && !isEligible(listing))
      .sort((a, b) => b.score - a.score)
      .slice(0, count),
  };
}
