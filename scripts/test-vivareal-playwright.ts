import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { collectPortals } from "../lib/collectors";
import type { SearchFilters } from "../lib/listings";

const DEFAULT_URL =
  "https://www.vivareal.com.br/venda/rj/rio-de-janeiro/zona-sul/botafogo/?onde=%2CRio+de+Janeiro%2CRio+de+Janeiro%2CZona+Sul%2CBotafogo%2C%2C%2Cneighborhood%2CBR%3ERio+de+Janeiro%3ENULL%3ERio+de+Janeiro%3EZona+Sul%3EBotafogo%2C-22.951098%2C-43.180746%2C";

const outputDirectory = path.join(process.cwd(), "artifacts", "playwright", "vivareal");
const targetUrl = process.argv[2] ?? DEFAULT_URL;
const filters: SearchFilters = {
  purpose: "sale",
  bedroomsMin: 2,
  parkingMin: 1,
  propertyTypes: ["apartment", "penthouse"],
};

async function main() {
  await mkdir(outputDirectory, { recursive: true });
  try {
    const result = await collectPortals({
      urls: [targetUrl],
      neighborhood: "Botafogo",
      filters,
    });
    await writeFile(
      path.join(outputDirectory, "result.json"),
      JSON.stringify(result, null, 2),
      "utf8",
    );
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.sources[0]?.status === "ok" ? 0 : 2;
  } catch (error) {
    const failure = {
      testedAt: new Date().toISOString(),
      requestedUrl: targetUrl,
      error: error instanceof Error ? error.message : String(error),
    };
    await writeFile(
      path.join(outputDirectory, "error.json"),
      JSON.stringify(failure, null, 2),
      "utf8",
    );
    console.error(JSON.stringify(failure, null, 2));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
