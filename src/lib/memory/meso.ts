import type { EpisodeSummary, MemoryStoreData } from "../../types/memory";
import { uid } from "../id";
import { ollamaComplete, parseJsonLoose } from "./ollamaJson";

/** Merge when a session has more micro episodes than this. */
export const MESO_MICRO_THRESHOLD = 8;
/** How many oldest micros to fold into one meso per pass. */
export const MESO_BATCH = 6;

/**
 * If too many micro episodes exist for a session, fold the oldest batch into one meso.
 * Keeps open_loops / entities so long chats do not drown key facts in summary noise.
 */
export async function maybeMesoMerge(options: {
  store: MemoryStoreData;
  sessionId: string;
  model: string;
  signal?: AbortSignal;
}): Promise<{
  store: MemoryStoreData;
  merged: boolean;
  label?: string;
}> {
  const { sessionId, model, signal } = options;
  let store = options.store;

  const micros = store.episodes
    .filter((e) => e.sessionId === sessionId && e.level === "micro")
    .sort((a, b) => a.fromMsg - b.fromMsg || a.createdAt - b.createdAt);

  if (micros.length < MESO_MICRO_THRESHOLD) {
    return { store, merged: false };
  }

  const batch = micros.slice(0, MESO_BATCH);
  const ids = new Set(batch.map((e) => e.id));
  const fromMsg = Math.min(...batch.map((e) => e.fromMsg));
  const toMsg = Math.max(...batch.map((e) => e.toMsg));

  let meso = await tryLlmMeso(batch, sessionId, fromMsg, toMsg, model, signal);
  if (!meso) {
    meso = heuristicMeso(batch, sessionId, fromMsg, toMsg);
  }

  store = {
    ...store,
    episodes: [
      ...store.episodes.filter((e) => !ids.has(e.id)),
      meso,
    ].slice(-200),
  };

  return {
    store,
    merged: true,
    label: meso.topic,
  };
}

function heuristicMeso(
  batch: EpisodeSummary[],
  sessionId: string,
  fromMsg: number,
  toMsg: number,
): EpisodeSummary {
  const what: string[] = [];
  const decisions: string[] = [];
  const loops: string[] = [];
  const entities: string[] = [];
  const seen = new Set<string>();

  const add = (arr: string[], items: string[], cap: number) => {
    for (const x of items) {
      const t = x.trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      arr.push(t);
      if (arr.length >= cap) break;
    }
  };

  for (const e of batch) {
    add(what, e.whatHappened, 8);
    add(decisions, e.decisions, 4);
    add(loops, e.openLoops, 6);
    add(entities, e.entities, 16);
  }

  const topic =
    batch.map((e) => e.topic).filter(Boolean).slice(0, 3).join(" / ") ||
    "earlier phase";

  return {
    id: uid("ep"),
    sessionId,
    level: "meso",
    fromMsg,
    toMsg,
    topic: topic.slice(0, 120),
    whatHappened: what.slice(0, 8),
    decisions: decisions.slice(0, 4),
    openLoops: loops.slice(0, 6),
    entities: entities.slice(0, 16),
    rawText: [topic, ...what.slice(0, 4), ...loops.slice(0, 3)]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 500),
    createdAt: Date.now(),
  };
}

async function tryLlmMeso(
  batch: EpisodeSummary[],
  sessionId: string,
  fromMsg: number,
  toMsg: number,
  model: string,
  signal?: AbortSignal,
): Promise<EpisodeSummary | null> {
  const bullets = batch
    .map(
      (e, i) =>
        `${i + 1}. [${e.fromMsg}-${e.toMsg}] ${e.topic}: ${(e.whatHappened ?? []).join("; ")}; loops=${(e.openLoops ?? []).join(",")}; entities=${(e.entities ?? []).join(",")}`,
    )
    .join("\n");

  const system = [
    "Merge several micro chat summaries into ONE shorter meso summary.",
    "Output ONE JSON object only. Keep proper names and open loops. No markdown.",
    'Schema: { "topic": string, "what_happened": string[], "decisions": string[], "open_loops": string[], "entities": string[] }',
  ].join("\n");

  try {
    const raw = await ollamaComplete({
      model,
      system,
      prompt: `Merge these micro summaries:\n${bullets}\n\nJSON:`,
      numPredict: 500,
      signal,
    });
    const parsed = parseJsonLoose<{
      topic?: string;
      what_happened?: string[];
      decisions?: string[];
      open_loops?: string[];
      entities?: string[];
    }>(raw);
    if (!parsed) return null;
    return {
      id: uid("ep"),
      sessionId,
      level: "meso",
      fromMsg,
      toMsg,
      topic: (parsed.topic ?? "phase").slice(0, 120),
      whatHappened: (parsed.what_happened ?? []).slice(0, 8).map(String),
      decisions: (parsed.decisions ?? []).slice(0, 4).map(String),
      openLoops: (parsed.open_loops ?? []).slice(0, 6).map(String),
      entities: (parsed.entities ?? []).slice(0, 16).map(String),
      rawText: [
        parsed.topic,
        ...(parsed.what_happened ?? []).slice(0, 4),
        ...(parsed.open_loops ?? []).slice(0, 3),
      ]
        .filter(Boolean)
        .join(" · ")
        .slice(0, 500),
      createdAt: Date.now(),
    };
  } catch {
    return null;
  }
}

export function countMicroEpisodes(
  store: MemoryStoreData,
  sessionId: string,
): number {
  return store.episodes.filter(
    (e) => e.sessionId === sessionId && e.level === "micro",
  ).length;
}
