import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  getPropertyAnalysisContext,
  persistMultiPortalRun,
  recomputeAiCooldownHistory,
  saveDbPropertyAnalysis,
  saveDiscovery,
} from "../lib/db/repository";
import { closePool } from "../lib/db/client";
import type { MultiPortalRun, SerperCollection } from "../lib/listings";
import type { SavedPropertyAnalysis } from "../lib/property-analysis";

async function readJsonFiles<T>(directory: string) {
  try {
    const files = (await readdir(directory)).filter(
      (file) => file.endsWith(".json") && file !== "latest.json",
    );
    return Promise.all(
      files.map(async (file) => JSON.parse(await readFile(path.join(directory, file), "utf8")) as T),
    );
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function main() {
  const jsonRoot = path.join(process.cwd(), "json");
  const discoveries = await readJsonFiles<SerperCollection>(path.join(jsonRoot, "serper"));
  for (const discovery of discoveries) await saveDiscovery(discovery);

  const portalRuns = await readJsonFiles<MultiPortalRun>(path.join(jsonRoot, "portal-runs"));
  const latestByCollection = new Map<string, MultiPortalRun>();
  for (const run of portalRuns) {
    const current = latestByCollection.get(run.collectionId);
    if (!current || current.collectedAt < run.collectedAt) latestByCollection.set(run.collectionId, run);
  }
  const runIdMap = new Map<string, string>();
  let importedRuns = 0;
  for (const run of latestByCollection.values()) {
    try {
      await persistMultiPortalRun({ ...run, id: run.collectionId });
      runIdMap.set(run.id, run.collectionId);
      importedRuns += 1;
    } catch (error) {
      console.warn(
        `Coleta ${run.id} ignorada: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const analyses = await readJsonFiles<SavedPropertyAnalysis>(
    path.join(jsonRoot, "property-analyses"),
  );
  let importedAnalyses = 0;
  for (const analysis of analyses) {
    const runId = runIdMap.get(analysis.runId) ?? analysis.runId;
    const context = await getPropertyAnalysisContext(runId, analysis.listingId);
    if (!context) continue;
    await saveDbPropertyAnalysis(context.property_id, { ...analysis, runId });
    importedAnalyses += 1;
  }
  await recomputeAiCooldownHistory();

  console.log(
    JSON.stringify(
      {
        discoveries: discoveries.length,
        portalRuns: importedRuns,
        analyses: importedAnalyses,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(closePool);
