import type { CharacterCard, Message } from "../../types";
import type {
  EpisodeSummary,
  MemoryItem,
  MemoryStoreData,
} from "../../types/memory";
import { DEFAULT_CHARACTER } from "../../data/defaults";
import { uid } from "../id";
import {
  heuristicCandidatesFromTranscript,
  layerAwarePasses,
  normalizeLayerAndType,
} from "./layerRules";
import { ollamaComplete, parseJsonLoose } from "./ollamaJson";
import { maybeMesoMerge } from "./meso";
import { extractProfileFromTranscript } from "./profileHeuristics";
import {
  computeHotStartIndex,
  shouldRunRollingCompress,
} from "./rolling";
import {
  stampChunk,
  stampEpisode,
  stampMemoryAtom,
  writeTargetForCharacter,
} from "./scope";
import {
  addChunk,
  addEpisode,
  getCursor,
  mergeMemory,
  upsertCursor,
} from "./store";
import { scoreSpecificity } from "./specificity";
import { termFreq } from "./terms";

/** Default trigger: micro-summary after this many new messages since cursor. */
export const SUMMARY_EVERY_N_MESSAGES = 6;
/** Always keep this many recent messages as hot L1 (not summarized away from prompt). */
export const HOT_TURNS = 12;

export type LayerCounts = { L3: number; L4: number; L5: number };

function bumpLayer(
  counts: LayerCounts,
  layer: MemoryItem["layer"] | undefined,
): void {
  if (layer === "L3" || layer === "L4" || layer === "L5") {
    counts[layer] += 1;
  }
}

interface PipelineResult {
  store: MemoryStoreData;
  updatedLabels: string[];
  didSummary: boolean;
  layerCounts: LayerCounts;
}

interface ExtractPayload {
  episode?: {
    topic?: string;
    what_happened?: string[];
    decisions?: string[];
    open_loops?: string[];
    entities?: string[];
  };
  memories?: Array<{
    layer?: string;
    type?: string;
    subject?: string;
    predicate?: string;
    object?: string;
    confidence?: number;
  }>;
}

function formatTranscript(
  messages: Message[],
  from: number,
  to: number,
): string {
  const slice = messages.slice(from, to);
  return slice
    .map((m, i) => {
      const idx = from + i;
      const role = m.role === "user" ? "User" : "Assistant";
      const body = m.content.slice(0, 800);
      return `[${idx}] ${role}: ${body}`;
    })
    .join("\n");
}

export function shouldRunSummary(
  store: MemoryStoreData,
  sessionId: string,
  messageCount: number,
  everyN: number = SUMMARY_EVERY_N_MESSAGES,
): boolean {
  const cursor = getCursor(store, sessionId);
  const pending = messageCount - cursor.nextSummaryFrom;
  const n = Math.max(2, Math.min(30, everyN || SUMMARY_EVERY_N_MESSAGES));
  return pending >= n;
}

/** Rolling: compress cold region that fell out of the hot token window. */
export function shouldRunSummaryRolling(
  store: MemoryStoreData,
  sessionId: string,
  messages: Message[],
  numCtx: number,
  everyN: number = SUMMARY_EVERY_N_MESSAGES,
): boolean {
  if (shouldRunRollingCompress(store, sessionId, messages, numCtx)) {
    return true;
  }
  return shouldRunSummary(store, sessionId, messages.length, everyN);
}

/** Heuristic episode when the model fails — still advances the cold cursor. */
function heuristicEpisode(
  sessionId: string,
  characterId: string,
  messages: Message[],
  from: number,
  to: number,
): EpisodeSummary {
  const slice = messages.slice(from, to);
  const userBits = slice
    .filter((m) => m.role === "user")
    .map((m) => m.content.replace(/\s+/g, " ").trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 6);
  const topic =
    userBits[0]?.slice(0, 40) ||
    (slice[0]?.content.slice(0, 40) ?? "earlier chat");
  const transcript = formatTranscript(messages, from, to);
  const profile = extractProfileFromTranscript(transcript);
  const entities = profile
    .filter((p) => p.layer === "L3")
    .map((p) => p.object)
    .slice(0, 12);
  const openLoops = profile
    .filter((p) => p.layer === "L5")
    .map((p) => p.object)
    .slice(0, 4);
  return stampEpisode(
    {
      id: uid("ep"),
      sessionId,
      level: "micro",
      fromMsg: from,
      toMsg: to - 1,
      topic,
      whatHappened: userBits.length
        ? userBits
        : ["Earlier turns compressed for context budget."],
      decisions: [],
      openLoops,
      entities,
      rawText: [...userBits, ...entities, ...openLoops].join(" · ").slice(0, 500),
      createdAt: Date.now(),
    },
    characterId,
  );
}

function tryIngest(
  store: MemoryStoreData,
  cand: {
    layer?: string;
    type?: string;
    subject?: string;
    predicate?: string;
    object?: string;
    confidence?: number;
  },
  sessionId: string,
  evidence: string,
  writeTarget: { scope: "master" | "character"; characterId?: string },
): { store: MemoryStoreData; label?: string; layer?: MemoryItem["layer"] } {
  const subject = String(cand.subject ?? "").trim();
  const predicate = String(cand.predicate ?? "").trim();
  const object = String(cand.object ?? "").trim();
  if (!subject || !predicate || !object) return { store };

  const { layer, type } = normalizeLayerAndType(cand);
  const specificity = scoreSpecificity({ subject, predicate, object });

  const item = stampMemoryAtom(
    {
      id: uid("mem"),
      layer,
      type,
      subject,
      predicate,
      object,
      confidence: Math.max(0, Math.min(1, Number(cand.confidence ?? 0.7))),
      specificity,
      source: "extract",
      status: "active",
      sessionId,
      evidence,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    writeTarget,
  );

  if (!layerAwarePasses(item)) return { store };
  // Identity L3: slightly lower bar so name/pet stick
  const isIdentityL3 =
    layer === "L3" &&
    /^(name|is|has_pet|occupation|lives_in|age|called)$/i.test(predicate);
  const minConf = isIdentityL3 ? 0.4 : 0.45;
  if (item.confidence < minConf) return { store };
  if (!isIdentityL3 && item.specificity < 0.5 && item.source === "extract") {
    // still allow high-confidence short names
    if (!(layer === "L3" && item.object.length >= 2 && item.confidence >= 0.85)) {
      /* keep going if passes layerAware */
    }
  }

  const merged = mergeMemory(store, item);
  return {
    store: merged.data,
    label: merged.changed ? merged.label : undefined,
    layer: merged.changed ? layer : undefined,
  };
}

export async function runMemoryPipeline(options: {
  store: MemoryStoreData;
  sessionId: string;
  messages: Message[];
  model: string;
  memoryEnabled: boolean;
  /** Session character — scopes writes (Meta → master, persona → character). */
  character?: CharacterCard | null;
  force?: boolean;
  /** Override auto-trigger interval (message count). */
  everyN?: number;
  /** Context window — drives rolling cold/hot boundary. */
  numCtx?: number;
  signal?: AbortSignal;
}): Promise<PipelineResult> {
  const { sessionId, messages, model, memoryEnabled, force, signal } = options;
  const character = options.character ?? DEFAULT_CHARACTER;
  const writeTarget = writeTargetForCharacter(character);
  const ownerCharacterId = character.id || DEFAULT_CHARACTER.id;
  const everyN = options.everyN ?? SUMMARY_EVERY_N_MESSAGES;
  const numCtx = options.numCtx ?? 8192;
  let store = options.store;
  const updatedLabels: string[] = [];
  const layerCounts: LayerCounts = { L3: 0, L4: 0, L5: 0 };
  const empty = (): PipelineResult => ({
    store,
    updatedLabels,
    didSummary: false,
    layerCounts,
  });

  if (!memoryEnabled || messages.length < 2) {
    return empty();
  }

  if (
    !force &&
    !shouldRunSummaryRolling(store, sessionId, messages, numCtx, everyN)
  ) {
    return empty();
  }

  const cursor = getCursor(store, sessionId);
  const hotStart = computeHotStartIndex(messages, numCtx);

  // Rolling compress: summarize everything before the hot window.
  // Force: re-summarize a recent tail for manual "整理".
  const from = force
    ? Math.max(0, messages.length - Math.min(messages.length, 24))
    : cursor.nextSummaryFrom;
  const to = force
    ? messages.length
    : Math.max(from + 2, hotStart);

  if (to - from < 2) {
    return empty();
  }
  // Cap one job to avoid huge transcripts
  const windowTo = Math.min(to, from + 24);
  if (windowTo - from < 2) {
    return empty();
  }

  const transcript = formatTranscript(messages, from, windowTo);
  const evidence = `msgs ${from}-${windowTo - 1}`;

  const chunkText = transcript.slice(0, 4000);
  store = addChunk(
    store,
    stampChunk(
      {
        id: uid("chk"),
        sessionId,
        text: chunkText,
        terms: termFreq(chunkText),
        messageFrom: from,
        messageTo: windowTo - 1,
        createdAt: Date.now(),
      },
      ownerCharacterId,
    ),
  );

  const system = [
    "You compress older chat turns into a SHORT structured summary for long-context chat.",
    "Output ONE JSON object only. No markdown, no thinking text.",
    "Be factual and specific. Prefer Chinese if the user speaks Chinese.",
    "",
    "CRITICAL — never drop these if present in the transcript:",
    "1) User name / nicknames",
    "2) Pet/people names and relationships",
    "3) open_loops: unfinished tasks, things user is watching, promises",
    "4) entities: proper names list",
    "",
    "Also extract lasting memories when present:",
    "- L3: user name → subject user predicate name; pets → subject pet:NAME predicate is",
    "- L4: HOW the AI should answer",
    "- L5: ongoing events / open loops",
    "",
    "Schema:",
    '{ "episode": { "topic": string, "what_happened": string[], "decisions": string[], "open_loops": string[], "entities": string[] },',
    '  "memories": [ { "layer":"L3|L4|L5", "type":"fact|preference|procedure|event|boundary", "subject":string, "predicate":string, "object":string, "confidence":0-1 } ] }',
  ].join("\n");

  const prompt = [
    `Compress transcript (messages ${from}-${windowTo - 1}).`,
    "MUST fill open_loops and entities when the text supports them.",
    "MUST emit L3 memories for names/pets if mentioned.",
    transcript,
    "",
    "Return JSON now.",
  ].join("\n");

  let payload: ExtractPayload | null = null;
  let usedHeuristic = false;
  try {
    const raw = await ollamaComplete({
      model,
      system,
      prompt,
      numPredict: 700,
      // Keep same ctx as chat so Ollama does not rebuild the KV cache
      numCtx,
      signal,
    });
    payload = parseJsonLoose<ExtractPayload>(raw);
  } catch {
    payload = null;
  }

  if (!payload || !payload.episode) {
    usedHeuristic = true;
    payload = { memories: [], episode: {} };
  }

  const ep = payload.episode ?? {};
  let episode: EpisodeSummary;
  if (
    usedHeuristic ||
    (!(ep.topic || (ep.what_happened && ep.what_happened.length)) &&
      !(payload.memories && payload.memories.length))
  ) {
    episode = heuristicEpisode(
      sessionId,
      ownerCharacterId,
      messages,
      from,
      windowTo,
    );
    updatedLabels.push(episode.topic);
  } else {
    episode = stampEpisode(
      {
        id: uid("ep"),
        sessionId,
        level: "micro",
        fromMsg: from,
        toMsg: windowTo - 1,
        topic: (ep.topic ?? "conversation").slice(0, 120),
        whatHappened: (ep.what_happened ?? []).slice(0, 6).map(String),
        decisions: (ep.decisions ?? []).slice(0, 4).map(String),
        openLoops: (ep.open_loops ?? []).slice(0, 4).map(String),
        entities: (ep.entities ?? []).slice(0, 12).map(String),
        rawText: [
          ep.topic,
          ...(ep.what_happened ?? []),
          ...(ep.open_loops ?? []),
        ]
          .filter(Boolean)
          .join(" · ")
          .slice(0, 500),
        createdAt: Date.now(),
      },
      ownerCharacterId,
    );
  }
  store = addEpisode(store, episode);

  // Promote open loops that look like ongoing events into L5 seeds
  for (const loop of episode.openLoops) {
    if (loop.length < 8) continue;
    const r = tryIngest(
      store,
      {
        layer: "L5",
        type: "event",
        subject: "user",
        predicate: "open_loop",
        object: loop,
        confidence: 0.65,
      },
      sessionId,
      evidence,
      writeTarget,
    );
    store = r.store;
    if (r.label) {
      updatedLabels.push(r.label);
      bumpLayer(layerCounts, r.layer);
    }
  }

  for (const cand of payload.memories ?? []) {
    const r = tryIngest(store, cand, sessionId, evidence, writeTarget);
    store = r.store;
    if (r.label) {
      updatedLabels.push(r.label);
      bumpLayer(layerCounts, r.layer);
    }
  }

  // High-precision profile heuristics (names / pets) — R2 reliability
  for (const h of extractProfileFromTranscript(transcript)) {
    const r = tryIngest(
      store,
      h,
      sessionId,
      evidence + "|profile",
      writeTarget,
    );
    store = r.store;
    if (r.label) {
      updatedLabels.push(r.label);
      bumpLayer(layerCounts, r.layer);
    }
  }

  // Also promote episode entities that look like pet/person names into soft L3 seeds
  for (const ent of episode.entities) {
    const name = String(ent).trim();
    if (name.length < 2 || name.length > 16) continue;
    if (!/^[\u4e00-\u9fffA-Za-z]+$/.test(name)) continue;
    const r = tryIngest(
      store,
      {
        layer: "L3",
        type: "fact",
        subject: `entity:${name}`,
        predicate: "mentioned",
        object: name,
        confidence: 0.55,
      },
      sessionId,
      evidence + "|entity",
      writeTarget,
    );
    store = r.store;
    if (r.label) {
      updatedLabels.push(r.label);
      bumpLayer(layerCounts, r.layer);
    }
  }

  // Rule-based backfill for L4/L5 if model dumped everything as L3 or omitted them
  const active = store.memories.filter((m) => m.status === "active");
  const hasL4 = active.some((m) => m.layer === "L4");
  const hasL5 = active.some((m) => m.layer === "L5");
  if (!hasL4 || !hasL5) {
    for (const h of heuristicCandidatesFromTranscript(transcript)) {
      if (h.layer === "L4" && hasL4) continue;
      if (h.layer === "L5" && hasL5) continue;
      if (h.layer === "L4" && active.some((m) => m.layer === "L4" && m.object === h.object)) {
        continue;
      }
      const r = tryIngest(
        store,
        h,
        sessionId,
        evidence + "|heuristic",
        writeTarget,
      );
      store = r.store;
      if (r.label) {
        updatedLabels.push(r.label);
        bumpLayer(layerCounts, r.layer);
      }
    }
  }

  // Advance cursor past compressed cold region (even on heuristic fallback)
  store = upsertCursor(store, {
    sessionId,
    nextSummaryFrom: windowTo,
    updatedAt: Date.now(),
  });

  // R2: meso-merge when too many micro episodes (prevent summary bloat)
  try {
    const meso = await maybeMesoMerge({
      store,
      sessionId,
      model,
      characterId: ownerCharacterId,
      numCtx,
      signal,
    });
    store = meso.store;
    if (meso.merged && meso.label) {
      updatedLabels.push(`meso:${meso.label}`);
    }
  } catch {
    /* non-fatal */
  }

  return { store, updatedLabels, didSummary: true, layerCounts };
}
