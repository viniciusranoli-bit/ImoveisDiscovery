import assert from "node:assert/strict";
import test from "node:test";
import { acceptQuotedAddress, extractPublishedAddress } from "../lib/collectors/address";
import { adapterFor } from "../lib/collectors/adapters";
import { classifyLocationText, parseListingCandidate } from "../lib/collectors/parser";
import {
  deduplicateCollectedListings,
  matchesSearchFilters,
  normalizeSearchFilters,
  propertyIdentityKey,
  type SearchFilters,
} from "../lib/listings";
import {
  genericPenthouseCandidate,
  vivaRealApartmentCandidate,
} from "./fixtures/portal-candidates";

const saleFilters: SearchFilters = {
  purpose: "sale",
  priceMin: 700_000,
  priceMax: 1_000_000,
  bedroomsMin: 2,
  parkingMin: 1,
  propertyTypes: ["apartment", "penthouse"],
};

test("normaliza filtros inválidos sem enfraquecer quartos e vaga padrão", () => {
  const filters = normalizeSearchFilters({
    purpose: "sale",
    bedroomsMin: Number.NaN,
    parkingMin: -2,
    propertyTypes: [],
  });
  assert.equal(filters.purpose, "sale");
  assert.equal(filters.bedroomsMin, 2);
  assert.equal(filters.parkingMin, 1);
  assert.deepEqual(filters.propertyTypes, ["apartment", "penthouse"]);
});

test("adapta finalidade na URL dos portais conhecidos", () => {
  const viva = adapterFor("https://www.vivareal.com.br/aluguel/rj/rio-de-janeiro/");
  assert.match(
    viva.buildSearchUrl("https://www.vivareal.com.br/aluguel/rj/rio-de-janeiro/", saleFilters),
    /\/venda\//,
  );
  const quinto = adapterFor("https://www.quintoandar.com.br/alugar/imovel/botafogo");
  assert.match(
    quinto.buildSearchUrl("https://www.quintoandar.com.br/alugar/imovel/botafogo", saleFilters),
    /\/comprar\//,
  );
});

test("extrai o logradouro publicado e rejeita endereço inventado pela IA", () => {
  const card =
    "Botafogo, Rio de JaneiroRua São ClementeTamanho do imóvel 70 m²Quantidade de quartos 2";
  assert.equal(extractPublishedAddress(card), "Rua São Clemente");
  assert.equal(
    acceptQuotedAddress(card, "Rua São Clemente", "Rio de JaneiroRua São ClementeTamanho"),
    "Rua São Clemente",
  );
  assert.equal(acceptQuotedAddress(card, "Rua Inventada", "Rua Inventada"), undefined);
});

test("classifica localização confirmada, desconhecida e incompatível", () => {
  assert.equal(classifyLocationText("Rua São Clemente, Botafogo, Rio de Janeiro/RJ", "Botafogo"), "confirmed");
  assert.equal(classifyLocationText("Rua São Clemente, Botafogo", "Botafogo"), "unknown");
  assert.equal(classifyLocationText("Rua Doutor Armando Barbedo, Tristeza, Porto Alegre/RS", "Leme"), "excluded");
});

test("estrutura cartão do Viva Real e aplica os filtros locais", () => {
  const listing = parseListingCandidate({
    candidate: vivaRealApartmentCandidate,
    source: "Viva Real",
    searchUrl: "https://www.vivareal.com.br/venda/",
    neighborhood: "Botafogo",
    filters: saleFilters,
    collectedAt: "2026-09-30T00:00:00.000Z",
  });
  assert.ok(listing);
  assert.equal(listing.price, 775_000);
  assert.equal(listing.bedrooms, 2);
  assert.equal(listing.parkingSpaces, 1);
  assert.equal(listing.propertyType, "apartment");
  assert.equal(matchesSearchFilters(listing, saleFilters), true);
});

test("fallback genérico interpreta JSON-LD sanitizado", () => {
  const filters = { ...saleFilters, priceMax: 3_000_000 };
  const listing = parseListingCandidate({
    candidate: genericPenthouseCandidate,
    source: "example.com",
    searchUrl: "https://example.com/botafogo",
    neighborhood: "Botafogo",
    filters,
    collectedAt: "2026-09-30T00:00:00.000Z",
  });
  assert.ok(listing);
  assert.equal(listing.propertyType, "penthouse");
  assert.equal(listing.price, 2_000_000);
  assert.equal(listing.bedrooms, 3);
  assert.equal(listing.parkingSpaces, 2);
});

test("normaliza preço com espaços e elimina resultado de outro bairro", () => {
  const rentFilters: SearchFilters = {
    purpose: "rent",
    bedroomsMin: 2,
    parkingMin: 1,
    propertyTypes: ["apartment"],
  };
  const botafogo = parseListingCandidate({
    candidate: {
      href: "https://example.com/imovel/apartamento-botafogo-123",
      text: "Apartamento em Botafogo, 3 quartos, 1 vaga. Aluguel: R$ 8. 000, 00.",
    },
    source: "example.com",
    searchUrl: "https://example.com/busca/botafogo",
    neighborhood: "Botafogo",
    filters: rentFilters,
    collectedAt: "2026-09-30T00:00:00.000Z",
  });
  assert.ok(botafogo);
  assert.equal(botafogo.price, 8_000);

  const tijuca = parseListingCandidate({
    candidate: {
      href: "https://example.com/imovel/apartamento-tijuca-456",
      text: "Apartamento na Tijuca, 3 quartos, 1 vaga. Aluguel: R$ 4.000.",
    },
    source: "example.com",
    searchUrl: "https://example.com/busca/botafogo",
    neighborhood: "Botafogo",
    filters: rentFilters,
    collectedAt: "2026-09-30T00:00:00.000Z",
  });
  assert.equal(tijuca, null);

  const copacabana = parseListingCandidate({
    candidate: {
      href: "https://example.com/imovel/apartamento-copacabana-789",
      text: "Apartamento em Copacabana, 2 quartos, 1 vaga. Aluguel: R$ 7.500.",
    },
    source: "example.com",
    searchUrl: "https://example.com/busca/zona-sul",
    neighborhoods: ["Botafogo", "Copacabana"],
    filters: rentFilters,
    collectedAt: "2026-09-30T00:00:00.000Z",
  });
  assert.equal(copacabana?.neighborhood, "Copacabana");
  assert.equal(copacabana?.purpose, "rent");
});

test("distingue aluguel do total conforme a ordem exibida pelo portal", () => {
  const filters: SearchFilters = {
    purpose: "rent",
    bedroomsMin: 2,
    parkingMin: 1,
    propertyTypes: ["apartment"],
  };
  const quinto = parseListingCandidate({
    candidate: {
      href: "https://example.com/imovel/895660694/alugar/apartamento-2-quartos-botafogo",
      text: "R$ 5.600 aluguel R$ 7.697 total 75 m² · 2 quartos · 1 vaga Botafogo",
    },
    source: "QuintoAndar",
    searchUrl: "https://example.com/botafogo",
    neighborhood: "Botafogo",
    filters,
    collectedAt: "2026-09-30T00:00:00.000Z",
  });
  assert.equal(quinto?.price, 5_600);

  const lopes = parseListingCandidate({
    candidate: {
      href: "https://example.com/imovel/REO969248/aluguel-apartamento-botafogo",
      text: "Total R$ 9.450/mês Apartamento 90m² 2 quartos 1 vaga Aluguel: R$ 7.500 Botafogo",
    },
    source: "Lopes",
    searchUrl: "https://example.com/botafogo",
    neighborhood: "Botafogo",
    filters,
    collectedAt: "2026-09-30T00:00:00.000Z",
  });
  assert.equal(lopes?.price, 7_500);
});

test("deduplica o mesmo identificador externo preservando as fontes", () => {
  const viva = parseListingCandidate({
    candidate: vivaRealApartmentCandidate,
    source: "Viva Real",
    searchUrl: "https://www.vivareal.com.br/venda/",
    neighborhood: "Botafogo",
    filters: saleFilters,
    collectedAt: "2026-09-30T00:00:00.000Z",
  });
  const zap = parseListingCandidate({
    candidate: {
      ...vivaRealApartmentCandidate,
      href: vivaRealApartmentCandidate.href.replace("vivareal.com.br", "zapimoveis.com.br"),
    },
    source: "ZAP Imóveis",
    searchUrl: "https://www.zapimoveis.com.br/venda/",
    neighborhood: "Botafogo",
    filters: saleFilters,
    collectedAt: "2026-09-30T00:00:00.000Z",
  });
  assert.ok(viva && zap);
  const [deduplicated] = deduplicateCollectedListings([viva, zap]);
  assert.equal(deduplicateCollectedListings([viva, zap]).length, 1);
  assert.deepEqual(deduplicated.sources, ["Viva Real", "ZAP Imóveis"]);
});

test("identidade persistente não muda quando o preço muda", () => {
  const listing = parseListingCandidate({
    candidate: vivaRealApartmentCandidate,
    source: "Viva Real",
    searchUrl: "https://www.vivareal.com.br/venda/",
    neighborhood: "Botafogo",
    filters: saleFilters,
    collectedAt: "2026-09-30T00:00:00.000Z",
  });
  assert.ok(listing);
  assert.equal(
    propertyIdentityKey(listing),
    propertyIdentityKey({ ...listing, price: (listing.price ?? 0) - 100_000 }),
  );
});
