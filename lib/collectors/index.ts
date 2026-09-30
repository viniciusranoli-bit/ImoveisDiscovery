import { chromium, type Browser, type Page } from "playwright";
import {
  deduplicateCollectedListings,
  matchesSearchFilters,
  type CollectedListing,
  type SearchFilters,
  type SourceCollectionStatus,
} from "../listings";
import { adapterFor, hostFromUrl } from "./adapters";
import { parseListingCandidate, type LinkCandidate } from "./parser";

type CollectPortalsInput = {
  urls: string[];
  neighborhood: string;
  filters: SearchFilters;
};

const blockPattern =
  /sorry, you have been blocked|você foi bloqueado|access denied|captcha|cloudflare ray id|verifique que você é humano/i;

async function launchBrowser() {
  const headless = process.env.PLAYWRIGHT_HEADLESS === "true";
  const requestedChannel = process.env.PLAYWRIGHT_CHANNEL;
  const channels = requestedChannel ? [requestedChannel] : ["chrome", "msedge"];
  const errors: string[] = [];

  for (const channel of channels) {
    try {
      return {
        browser: await chromium.launch({ channel, headless }),
        channel,
        headless,
      };
    } catch (error) {
      errors.push(`${channel}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  try {
    return {
      browser: await chromium.launch({ headless }),
      channel: "playwright-chromium",
      headless,
    };
  } catch (error) {
    errors.push(`playwright-chromium: ${error instanceof Error ? error.message : String(error)}`);
    throw new Error(`Nenhum navegador Playwright disponível: ${errors.join(" | ")}`);
  }
}

function jsonLdCandidates(blocks: string[]): LinkCandidate[] {
  const candidates: LinkCandidate[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const item = value as Record<string, unknown>;
    const url =
      typeof item.url === "string"
        ? item.url
        : item.item && typeof item.item === "object" && typeof (item.item as Record<string, unknown>).url === "string"
          ? String((item.item as Record<string, unknown>).url)
          : undefined;
    if (url) {
      candidates.push({
        href: url,
        text: JSON.stringify(item),
      });
    }
    Object.values(item).forEach(visit);
  };

  for (const block of blocks) {
    try {
      visit(JSON.parse(block));
    } catch {
      // JSON-LD inválido é ignorado, mas os links visíveis ainda serão analisados.
    }
  }
  return candidates;
}

async function visibleCandidates(page: Page, selectors: string[]) {
  const selector = selectors.join(",");
  return page.locator(selector).evaluateAll((anchors) =>
    anchors
      .map((anchor) => {
        const element = anchor as HTMLAnchorElement;
        return {
          href: element.href,
          text: (element.innerText || "").trim(),
          ariaLabel: element.getAttribute("aria-label") || undefined,
        };
      })
      .filter((item) => item.href.startsWith("http")),
  );
}

async function collectSource(
  browser: Browser,
  inputUrl: string,
  neighborhood: string,
  filters: SearchFilters,
) {
  const startedAt = Date.now();
  const adapter = adapterFor(inputUrl);
  const searchUrl = adapter.buildSearchUrl(inputUrl, filters);
  const source = adapter.name;
  const page = await browser.newPage({
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    viewport: { width: 1440, height: 1000 },
  });

  try {
    const response = await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForTimeout(Number(process.env.PLAYWRIGHT_SETTLE_MS ?? 4_000));

    const bodyText = (await page.locator("body").innerText().catch(() => "")).slice(0, 20_000);
    const httpStatus = response?.status();
    if (blockPattern.test(bodyText) || httpStatus === 403 || httpStatus === 429) {
      return {
        listings: [] as CollectedListing[],
        status: {
          source,
          searchUrl,
          status: "blocked" as const,
          ...(httpStatus !== undefined ? { httpStatus } : {}),
          found: 0,
          message: "A fonte bloqueou a automação ou solicitou verificação humana.",
          durationMs: Date.now() - startedAt,
        },
      };
    }

    const [visible, jsonLd] = await Promise.all([
      visibleCandidates(page, adapter.linkSelectors),
      page.locator('script[type="application/ld+json"]').allTextContents(),
    ]);
    const uniqueCandidates = [
      ...new Map(
        [...visible, ...jsonLdCandidates(jsonLd)].map((candidate) => [candidate.href, candidate]),
      ).values(),
    ].slice(0, 100);
    const collectedAt = new Date().toISOString();
    const listings = uniqueCandidates
      .map((candidate) =>
        parseListingCandidate({
          candidate,
          source,
          searchUrl,
          neighborhood,
          filters,
          collectedAt,
        }),
      )
      .filter((listing): listing is CollectedListing => listing !== null);
    const filtered = listings.filter((listing) => matchesSearchFilters(listing, filters));

    return {
      listings: filtered,
      status: {
        source,
        searchUrl,
        status: (filtered.length ? "ok" : "empty") as "ok" | "empty",
        ...(httpStatus !== undefined ? { httpStatus } : {}),
        found: filtered.length,
        message:
          listings.length && !filtered.length
            ? "Anúncios encontrados, mas nenhum atendeu a todos os filtros."
            : undefined,
        durationMs: Date.now() - startedAt,
      },
    };
  } catch (error) {
    return {
      listings: [] as CollectedListing[],
      status: {
        source,
        searchUrl,
        status: "error" as const,
        found: 0,
        message: error instanceof Error ? error.message.slice(0, 300) : "Falha desconhecida.",
        durationMs: Date.now() - startedAt,
      },
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}

export async function collectPortals(input: CollectPortalsInput) {
  const uniqueUrls = [
    ...new Map(
      input.urls
        .filter((url) => hostFromUrl(url))
        .map((url) => [hostFromUrl(url), url]),
    ).values(),
  ];
  const { browser, channel, headless } = await launchBrowser();
  const results: Awaited<ReturnType<typeof collectSource>>[] = [];
  let nextIndex = 0;
  const concurrency = Math.max(
    1,
    Math.min(3, Number(process.env.PLAYWRIGHT_CONCURRENCY ?? 2)),
  );

  try {
    const workers = Array.from({ length: Math.min(concurrency, uniqueUrls.length) }, async () => {
      while (nextIndex < uniqueUrls.length) {
        const index = nextIndex++;
        results[index] = await collectSource(
          browser,
          uniqueUrls[index],
          input.neighborhood,
          input.filters,
        );
      }
    });
    await Promise.all(workers);
  } finally {
    await browser.close().catch(() => undefined);
  }

  const sources: SourceCollectionStatus[] = results.map((result) => result.status);
  return {
    browser: { channel, headless },
    listings: deduplicateCollectedListings(results.flatMap((result) => result.listings)),
    sources,
  };
}

export async function fetchListingDescription(url: string) {
  const { browser, channel, headless } = await launchBrowser();
  const page = await browser.newPage({
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    viewport: { width: 1440, height: 1000 },
  });
  try {
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForTimeout(Number(process.env.PLAYWRIGHT_SETTLE_MS ?? 4_000));
    const bodyText = (await page.locator("body").innerText().catch(() => "")).slice(0, 30_000);
    const httpStatus = response?.status();
    if (blockPattern.test(bodyText) || httpStatus === 403 || httpStatus === 429) {
      throw new Error("O portal bloqueou a leitura da descrição ou solicitou verificação humana.");
    }
    const [mainText, metaDescription, jsonLd] = await Promise.all([
      page.locator("main").innerText().catch(() => ""),
      page.locator('meta[name="description"]').getAttribute("content").catch(() => null),
      page.locator('script[type="application/ld+json"]').allTextContents(),
    ]);
    const description = [metaDescription, mainText || bodyText, ...jsonLd]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 30_000);
    if (description.length < 40) {
      throw new Error("A página não forneceu descrição suficiente para análise.");
    }
    return {
      description,
      title: await page.title(),
      httpStatus,
      browser: { channel, headless },
    };
  } finally {
    await page.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}
