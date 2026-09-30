import type { SearchFilters } from "../listings";

export type PortalAdapter = {
  name: string;
  hosts: string[];
  linkSelectors: string[];
  buildSearchUrl: (input: string, filters: SearchFilters) => string;
};

function replacePurpose(
  input: string,
  filters: SearchFilters,
  rentPattern: RegExp,
  salePattern: RegExp,
  rentValue: string,
  saleValue: string,
) {
  if (filters.purpose === "sale") {
    return salePattern.test(input) ? input : input.replace(rentPattern, saleValue);
  }
  return rentPattern.test(input) ? input : input.replace(salePattern, rentValue);
}

const adapters: PortalAdapter[] = [
  {
    name: "Viva Real",
    hosts: ["vivareal.com.br"],
    linkSelectors: ['a[href*="/imovel/"]'],
    buildSearchUrl: (input, filters) =>
      replacePurpose(input, filters, /\/aluguel\//, /\/venda\//, "/aluguel/", "/venda/"),
  },
  {
    name: "ZAP Imóveis",
    hosts: ["zapimoveis.com.br"],
    linkSelectors: ['a[href*="/imovel/"]'],
    buildSearchUrl: (input, filters) =>
      replacePurpose(input, filters, /\/aluguel\//, /\/venda\//, "/aluguel/", "/venda/"),
  },
  {
    name: "OLX",
    hosts: ["olx.com.br"],
    linkSelectors: ['a[href*="/item/"]', 'a[href*="/imoveis/"]'],
    buildSearchUrl: (input, filters) =>
      replacePurpose(input, filters, /\/aluguel\//, /\/venda\//, "/aluguel/", "/venda/"),
  },
  {
    name: "QuintoAndar",
    hosts: ["quintoandar.com.br"],
    linkSelectors: ['a[href*="/imovel/"]'],
    buildSearchUrl: (input, filters) =>
      replacePurpose(input, filters, /\/alugar\//, /\/comprar\//, "/alugar/", "/comprar/"),
  },
  {
    name: "Imovelweb",
    hosts: ["imovelweb.com.br"],
    linkSelectors: ['a[href*="/propriedades/"]', 'a[href*="/imovel/"]'],
    buildSearchUrl: (input, filters) => {
      let url = replacePurpose(
        input,
        filters,
        /-aluguel-/,
        /-venda-/,
        "-aluguel-",
        "-venda-",
      );
      if (filters.propertyTypes.length === 1) {
        const segment = filters.propertyTypes[0] === "penthouse" ? "coberturas" : "apartamentos";
        url = url.replace(/\/(?:imoveis|apartamentos|coberturas)-/, `/${segment}-`);
      }
      return url;
    },
  },
];

const genericAdapter: PortalAdapter = {
  name: "Extrator genérico",
  hosts: [],
  linkSelectors: [
    'a[href*="/imovel/"]',
    'a[href*="/imoveis/"]',
    'a[href*="/propriedade"]',
    'a[href*="/apartamento"]',
    'a[href*="/cobertura"]',
    'a[href*="/item/"]',
  ],
  buildSearchUrl: (input) => input,
};

export function hostFromUrl(input: string) {
  try {
    return new URL(input).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function adapterFor(input: string) {
  const host = hostFromUrl(input);
  return (
    adapters.find((adapter) =>
      adapter.hosts.some((candidate) => host === candidate || host.endsWith(`.${candidate}`)),
    ) ?? { ...genericAdapter, name: host || genericAdapter.name }
  );
}
