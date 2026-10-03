import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MultiPortalRun, SearchRun, SerperCollection } from "./listings";
import {
  persistMultiPortalRun,
  readAccumulatedPortalRun,
  readDiscovery,
  readLatestPortalRun,
  saveDiscovery,
} from "./db/repository";

const root = process.cwd();
const memoryPath = path.join(root, "MEMORY.md");
const searchesDir = path.join(root, "json", "searches");

export async function readAgentContext() {
  const [agent, memory] = await Promise.all([
    readFile(path.join(root, "AGENTS.md"), "utf8"),
    readFile(memoryPath, "utf8"),
  ]);
  return { agent, memory };
}

export async function getSeenLinks() {
  const memory = await readFile(memoryPath, "utf8");
  const memoryLinks = [...memory.matchAll(/\|\s*https?:\/\/[^|\s]+/g)].map((match) =>
    match[0].replace(/^\|\s*/, "").trim(),
  );
  try {
    const files = (await readdir(searchesDir)).filter((file) => file.endsWith(".json"));
    const runs = await Promise.all(
      files.map(async (file) => JSON.parse(await readFile(path.join(searchesDir, file), "utf8")) as SearchRun),
    );
    return [...new Set([...memoryLinks, ...runs.flatMap((run) => run.listings.map((listing) => listing.link))])];
  } catch {
    // A primeira pesquisa ainda não criou a pasta nem arquivos de histórico.
    return memoryLinks;
  }
}

export async function saveSearch(run: SearchRun) {
  await mkdir(searchesDir, { recursive: true });
  await writeFile(path.join(searchesDir, `${run.id}.json`), JSON.stringify(run, null, 2), "utf8");
  const memory = await readFile(memoryPath, "utf8");
  const seenMarker = "| — | — | — | — | — | — |";
  const rows = [...run.listings, ...run.rejectedPenthouses]
    .map(
      (listing) =>
        `| ${run.searchedAt.slice(0, 10)} | ${cell(listing.platform)} | ${cell(
          listing.link,
        )} | Reportado | ${run.searchedAt.slice(0, 10)} | Primeira consulta registrada |\n`,
    )
    .join("");
  if (rows && memory.includes(seenMarker)) {
    await writeFile(memoryPath, memory.replace(seenMarker, `${seenMarker}\n${rows}`), "utf8");
  }
}

export async function saveSerperCollection(collection: SerperCollection, userId?: string) {
  await saveDiscovery(collection, userId);
}

export async function readSerperCollection(id: string) {
  return readDiscovery(id);
}

export async function saveMultiPortalRun(run: MultiPortalRun) {
  return persistMultiPortalRun(run);
}

export async function readLatestMultiPortalRun(userId?: string) {
  return readLatestPortalRun(userId);
}

export async function readMultiPortalRunView(params: {
  savedSearchId?: string;
  scope?: "manual" | "latest";
  userId?: string;
}) {
  if (params.savedSearchId) {
    return readAccumulatedPortalRun({
      savedSearchId: params.savedSearchId,
      userId: params.userId,
    });
  }
  if (params.scope === "manual") {
    return readAccumulatedPortalRun({ manualOnly: true, userId: params.userId });
  }
  return readLatestPortalRun(params.userId);
}

const cell = (value: string) => value.replaceAll("|", "\\|").replaceAll("\n", " ").trim();

export async function appendFeedback(input: {
  link: string;
  action: string;
  note?: string;
  learning: string;
}) {
  const memory = await readFile(memoryPath, "utf8");
  const line = `| ${new Date().toISOString().slice(0, 10)} | ${cell(input.link)} | ${cell(
    [input.action, input.note].filter(Boolean).join(": "),
  )} | ${cell(input.learning)} | Aplicar como contexto em futuras buscas | Explícita |\n`;
  const marker = "| — | — | — | — | — | — |";
  const updated = memory.includes(marker)
    ? memory.replace(marker, `${marker}\n${line}`)
    : memory.replace(
        "### Como interpretar o feedback",
        `${line}\n### Como interpretar o feedback`,
      );
  const preferenceMarker = "| — | — | — | — | — |";
  const learnedLine = input.note?.trim()
    ? `| ${new Date().toISOString().slice(0, 10)} | Feedback do usuário | ${cell(
        input.note,
      )} | Considerar apenas como preferência explícita em pesquisas futuras | Explícita |\n`
    : "";
  const finalMemory =
    learnedLine && updated.includes(preferenceMarker)
      ? updated.replace(preferenceMarker, `${preferenceMarker}\n${learnedLine}`)
      : updated;
  await writeFile(memoryPath, finalMemory, "utf8");
}
