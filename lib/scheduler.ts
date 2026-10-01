import { getPool } from "./db/client";
import {
  markScheduledAnalysis,
  markScheduledSearch,
  readRecentSchedulerRuns,
  readSavedSearches,
  recordSchedulerRun,
  type SavedSearch,
} from "./db/repository";
import { analyzePropertyBatchFromRun } from "./property-analysis-service";
import { isAnalysisDue, isHourlySearchDue } from "./schedule";
import { runSavedSearchCollection } from "./saved-search-run";

const lockId = 7_306_202_610;
const schedulerVersion = Symbol("property-scheduler");
const globalForScheduler = globalThis as unknown as {
  propertyScheduler?: ReturnType<typeof setInterval>;
  propertySchedulerVersion?: symbol;
};

async function runSearch(saved: SavedSearch) {
  const startedAt = new Date().toISOString();
  try {
    const run = await runSavedSearchCollection(saved);
    const message = `${run.listings.length} imóveis liberados de ${run.totalCollected ?? run.listings.length} coletados.`;
    await markScheduledSearch(saved.id, { searchedAt: startedAt, searchRunId: run.id });
    await recordSchedulerRun({
      savedSearchId: saved.id,
      jobKind: "search",
      status: "completed",
      message,
      startedAt,
      finishedAt: new Date().toISOString(),
    });
    return run.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na busca automática.";
    await markScheduledSearch(saved.id, { searchedAt: startedAt, error: message });
    await recordSchedulerRun({
      savedSearchId: saved.id,
      jobKind: "search",
      status: "failed",
      message,
      startedAt,
      finishedAt: new Date().toISOString(),
    });
    return saved.latestSearchRunId;
  }
}

async function runAnalysis(saved: SavedSearch, runId: string) {
  const startedAt = new Date().toISOString();
  try {
    const result = await analyzePropertyBatchFromRun(runId, saved.analysisBatchCount);
    const message = `${result.analyzedListingIds.length} análises concluídas; ${result.failures.length} falhas.`;
    await markScheduledAnalysis(saved.id, {
      analyzedAt: startedAt,
      ...(result.failures.length ? { error: result.failures[0]?.error } : {}),
    });
    await recordSchedulerRun({
      savedSearchId: saved.id,
      jobKind: "analysis",
      status: result.failures.length && !result.analyzedListingIds.length ? "failed" : "completed",
      message,
      startedAt,
      finishedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na análise automática.";
    await markScheduledAnalysis(saved.id, { analyzedAt: startedAt, error: message });
    await recordSchedulerRun({
      savedSearchId: saved.id,
      jobKind: "analysis",
      status: "failed",
      message,
      startedAt,
      finishedAt: new Date().toISOString(),
    });
  }
}

export async function runDueSavedSearches(now = Date.now()) {
  const client = await getPool().connect();
  try {
    const lock = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [lockId],
    );
    if (!lock.rows[0]?.locked) return { skipped: true, searches: 0, analyses: 0 };

    const savedSearches = await readSavedSearches(100);
    let searches = 0;
    let analyses = 0;
    for (const saved of savedSearches) {
      let runId = saved.latestSearchRunId;
      if (isHourlySearchDue(saved.savedAt, saved.lastSearchedAt, now)) {
        runId = await runSearch(saved);
        searches += 1;
      }
      if (
        saved.analysisEnabled &&
        saved.filters.purpose !== "rent" &&
        runId &&
        isAnalysisDue(
          saved.savedAt,
          saved.lastAnalyzedAt,
          runId,
          saved.analysisIntervalMinutes,
          now,
        )
      ) {
        await runAnalysis(saved, runId);
        analyses += 1;
      }
    }
    return { skipped: false, searches, analyses };
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [lockId]).catch(() => undefined);
    client.release();
  }
}

export function startScheduler() {
  if (globalForScheduler.propertySchedulerVersion === schedulerVersion) return;
  if (globalForScheduler.propertyScheduler) clearInterval(globalForScheduler.propertyScheduler);
  globalForScheduler.propertySchedulerVersion = schedulerVersion;
  globalForScheduler.propertyScheduler = setInterval(() => {
    void runDueSavedSearches().catch((error) => {
      console.error(
        error instanceof Error ? `Agendador: ${error.message}` : "Agendador: falha desconhecida.",
      );
    });
  }, 60_000);
  globalForScheduler.propertyScheduler.unref?.();
}

export async function readSchedulerStatus() {
  const [searches, runs] = await Promise.all([
    readSavedSearches(100),
    readRecentSchedulerRuns(100),
  ]);
  return { searches, runs, searchIntervalMinutes: 60 };
}
