import type { MemoryItem, MemoryStoreData } from "../../types/memory";
import { uid } from "../id";
import {
  heuristicCandidatesFromTranscript,
  layerAwarePasses,
  normalizeLayerAndType,
} from "./layerRules";
import { ollamaComplete, parseJsonLoose } from "./ollamaJson";
import { mergeMemory } from "./store";
import { scoreSpecificity } from "./specificity";
import { detectSensitivity } from "./sensitive";

export interface RememberResult {
  store: MemoryStoreData;
  labels: string[];
  pendingSensitive?: {
    text: string;
    tags: string[];
    /** Pre-built items to commit after user confirms */
    items: Omit<MemoryItem, "id" | "createdAt" | "updatedAt">[];
  };
  error?: string;
}

function toItem(
  cand: {
    layer?: string;
    type?: string;
    subject?: string;
    predicate?: string;
    object?: string;
    confidence?: number;
  },
  sessionId: string,
  source: MemoryItem["source"],
): MemoryItem | null {
  const subject = String(cand.subject ?? "user").trim();
  const predicate = String(cand.predicate ?? "notes").trim();
  const object = String(cand.object ?? "").trim();
  if (!object) return null;

  const { layer, type } = normalizeLayerAndType({
    ...cand,
    subject,
    predicate,
    object,
  });
  const specificity = scoreSpecificity({ subject, predicate, object });
  const item: MemoryItem = {
    id: uid("mem"),
    layer,
    type,
    subject,
    predicate,
    object,
    confidence: Math.max(0.5, Math.min(1, Number(cand.confidence ?? 0.9))),
    specificity: Math.max(specificity, 0.6),
    source,
    status: "active",
    sessionId,
    evidence: "user_explicit",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  // explicit remember: slightly softer gate
  if (!layerAwarePasses(item) && item.specificity < 0.45 && object.length < 6) {
    return null;
  }
  return item;
}

function commitItems(
  store: MemoryStoreData,
  items: MemoryItem[],
): { store: MemoryStoreData; labels: string[] } {
  let s = store;
  const labels: string[] = [];
  for (const item of items) {
    const merged = mergeMemory(s, item);
    s = merged.data;
    if (merged.changed && merged.label) labels.push(merged.label);
  }
  return { store: s, labels };
}

/**
 * Explicit "remember this" path — higher priority than background extract.
 */
export async function rememberExplicitText(options: {
  store: MemoryStoreData;
  sessionId: string;
  text: string;
  model: string;
  /** If true, skip confirm even when sensitive (user already confirmed). */
  confirmedSensitive?: boolean;
  signal?: AbortSignal;
}): Promise<RememberResult> {
  const text = options.text.trim();
  if (!text) return { store: options.store, labels: [], error: "empty" };

  const sens = detectSensitivity(text);

  // Build candidates via heuristics first (fast, offline)
  const fakeTranscript = `[0] User: ${text}`;
  const heur = heuristicCandidatesFromTranscript(fakeTranscript);

  let rawItems: MemoryItem[] = [];

  // Always try LLM structure when online path available
  try {
    const system = [
      "Convert the user's explicit note into 1-3 structured memory JSON items.",
      "Output ONE JSON object only: { \"memories\": [ ... ] }",
      "Use layers L3 (facts), L4 (how AI should answer), L5 (events/projects).",
      "object must be specific. Chinese if user uses Chinese.",
    ].join("\n");
    const raw = await ollamaComplete({
      model: options.model,
      system,
      prompt: `User said (remember explicitly):\n${text}\n\nJSON:`,
      numPredict: 500,
      signal: options.signal,
    });
    const parsed = parseJsonLoose<{
      memories?: Array<{
        layer?: string;
        type?: string;
        subject?: string;
        predicate?: string;
        object?: string;
        confidence?: number;
      }>;
    }>(raw);
    for (const c of parsed?.memories ?? []) {
      const item = toItem(c, options.sessionId, "user");
      if (item) rawItems.push(item);
    }
  } catch {
    /* heuristics only */
  }

  for (const h of heur) {
    const item = toItem(h, options.sessionId, "user");
    if (item) rawItems.push(item);
  }

  // Fallback: store whole note as L3 fact if nothing structured
  if (rawItems.length === 0) {
    const item = toItem(
      {
        layer: "L3",
        type: "fact",
        subject: "user",
        predicate: "explicit_note",
        object: text.slice(0, 240),
        confidence: 0.85,
      },
      options.sessionId,
      "user",
    );
    if (item) rawItems.push(item);
  }

  // de-dupe by subject+predicate+object
  const seen = new Set<string>();
  rawItems = rawItems.filter((m) => {
    const k = `${m.subject}|${m.predicate}|${m.object}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  if (sens.sensitive && !options.confirmedSensitive) {
    return {
      store: options.store,
      labels: [],
      pendingSensitive: {
        text,
        tags: sens.tags,
        items: rawItems.map(({ id: _id, createdAt: _c, updatedAt: _u, ...rest }) => rest),
      },
    };
  }

  const committed = commitItems(options.store, rawItems);
  return committed;
}

export function commitPendingSensitive(
  store: MemoryStoreData,
  items: Omit<MemoryItem, "id" | "createdAt" | "updatedAt">[],
): { store: MemoryStoreData; labels: string[] } {
  const full: MemoryItem[] = items.map((it) => ({
    ...it,
    id: uid("mem"),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    source: "user",
    status: "active",
  }));
  return commitItems(store, full);
}
