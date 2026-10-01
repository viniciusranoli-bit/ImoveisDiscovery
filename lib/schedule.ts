export const searchIntervalMs = 60 * 60 * 1000;
export const analysisIntervals = [60, 180, 360, 720, 1440] as const;
export type AnalysisIntervalMinutes = (typeof analysisIntervals)[number];
export type AnalysisBatchCount = 5 | 10 | 15 | "all";

export function isHourlySearchDue(
  savedAt: string,
  lastSearchedAt: string | null,
  now = Date.now(),
) {
  const baseline = Date.parse(lastSearchedAt ?? savedAt);
  return Number.isFinite(baseline) && now - baseline >= searchIntervalMs;
}

export function isAnalysisDue(
  savedAt: string,
  lastAnalyzedAt: string | null,
  latestSearchRunId: string | null,
  intervalMinutes: number,
  now = Date.now(),
) {
  if (!latestSearchRunId) return false;
  const baseline = Date.parse(lastAnalyzedAt ?? savedAt);
  return Number.isFinite(baseline) && now - baseline >= intervalMinutes * 60 * 1000;
}

export function isAnalysisInterval(value: number): value is AnalysisIntervalMinutes {
  return analysisIntervals.includes(value as AnalysisIntervalMinutes);
}

export function isAnalysisBatchCount(value: unknown): value is AnalysisBatchCount {
  return value === 5 || value === 10 || value === 15 || value === "all";
}
