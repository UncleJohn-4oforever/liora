import type {
  EpisodeSummary,
  MemoryItem,
  MemoryStoreData,
  SessionMemoryCursor,
  TextChunk,
} from "../../types/memory";

const KEY = "liora.memory.v1";

const empty = (): MemoryStoreData => ({
  version: 1,
  memories: [],
  episodes: [],
  chunks: [],
  cursors: [],
  recentUpdates: [],
});

export function loadMemoryStore(): MemoryStoreData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as MemoryStoreData;
    if (parsed?.version !== 1) return empty();
    return {
      ...empty(),
      ...parsed,
      memories: parsed.memories ?? [],
      episodes: parsed.episodes ?? [],
      chunks: parsed.chunks ?? [],
      cursors: parsed.cursors ?? [],
      recentUpdates: parsed.recentUpdates ?? [],
    };
  } catch {
    return empty();
  }
}

export function saveMemoryStore(data: MemoryStoreData): void {
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function getCursor(
  data: MemoryStoreData,
  sessionId: string,
): SessionMemoryCursor {
  return (
    data.cursors.find((c) => c.sessionId === sessionId) ?? {
      sessionId,
      nextSummaryFrom: 0,
      updatedAt: Date.now(),
    }
  );
}

export function upsertCursor(
  data: MemoryStoreData,
  cursor: SessionMemoryCursor,
): MemoryStoreData {
  const others = data.cursors.filter((c) => c.sessionId !== cursor.sessionId);
  return {
    ...data,
    cursors: [...others, { ...cursor, updatedAt: Date.now() }],
  };
}

export function activeMemories(data: MemoryStoreData): MemoryItem[] {
  return data.memories.filter((m) => m.status === "active");
}

export function softDeleteMemory(
  data: MemoryStoreData,
  id: string,
): MemoryStoreData {
  return {
    ...data,
    memories: data.memories.map((m) =>
      m.id === id
        ? { ...m, status: "deleted", updatedAt: Date.now() }
        : m,
    ),
  };
}

export function updateMemoryObject(
  data: MemoryStoreData,
  id: string,
  object: string,
): MemoryStoreData {
  return {
    ...data,
    memories: data.memories.map((m) =>
      m.id === id
        ? { ...m, object: object.trim(), source: "user", updatedAt: Date.now() }
        : m,
    ),
  };
}

export function clearAllMemories(data: MemoryStoreData): MemoryStoreData {
  return {
    ...data,
    memories: data.memories.map((m) => ({
      ...m,
      status: "deleted",
      updatedAt: Date.now(),
    })),
    episodes: [],
    chunks: [],
    recentUpdates: [
      { id: `clr_${Date.now()}`, label: "cleared", at: Date.now() },
      ...data.recentUpdates,
    ].slice(0, 20),
  };
}

/** Identity-like L3 predicates: newer concrete values should replace older ones. */
const IDENTITY_PREDICATES = new Set([
  "name",
  "is",
  "has_pet",
  "occupation",
  "lives_in",
  "age",
  "called",
  "nickname",
]);

function shouldSupersede(existing: MemoryItem, incoming: MemoryItem): boolean {
  // User-authored always wins over extract
  if (incoming.source === "user" && existing.source !== "user") return true;
  if (existing.source === "user" && incoming.source !== "user") return false;

  const sameObject =
    existing.object.trim() === incoming.object.trim() &&
    JSON.stringify(existing.qualifiers ?? {}) ===
      JSON.stringify(incoming.qualifiers ?? {});
  if (sameObject) return false;

  const pred = incoming.predicate.toLowerCase();
  if (incoming.layer === "L3" && IDENTITY_PREDICATES.has(pred)) {
    // Prefer more specific / more confident identity facts
    if (incoming.specificity >= existing.specificity - 0.05) return true;
    if (incoming.confidence > existing.confidence + 0.1) return true;
    // Same subject+predicate identity: always take newer wording
    return true;
  }

  // Default: supersede if confidence/specificity not clearly worse
  if (incoming.confidence + incoming.specificity * 0.2 >=
    existing.confidence + existing.specificity * 0.2 - 0.05) {
    return true;
  }
  return false;
}

export function mergeMemory(
  data: MemoryStoreData,
  item: MemoryItem,
): { data: MemoryStoreData; changed: boolean; label: string } {
  const key = `${item.subject}::${item.predicate}`.toLowerCase();
  const existing = data.memories.find(
    (m) =>
      m.status === "active" &&
      `${m.subject}::${m.predicate}`.toLowerCase() === key,
  );

  if (existing) {
    if (
      existing.object === item.object &&
      JSON.stringify(existing.qualifiers ?? {}) ===
        JSON.stringify(item.qualifiers ?? {})
    ) {
      // Touch updatedAt so pinned L3 stays "fresh"
      return {
        data: {
          ...data,
          memories: data.memories.map((m) =>
            m.id === existing.id
              ? { ...m, updatedAt: Date.now(), confidence: Math.max(m.confidence, item.confidence) }
              : m,
          ),
        },
        changed: false,
        label: "",
      };
    }

    if (!shouldSupersede(existing, item)) {
      return { data, changed: false, label: "" };
    }

    const superseded: MemoryItem = {
      ...existing,
      status: "superseded",
      updatedAt: Date.now(),
    };
    const next: MemoryItem = {
      ...item,
      id: item.id,
      updatedAt: Date.now(),
      createdAt: existing.createdAt,
      // Keep stronger confidence if close
      confidence: Math.max(item.confidence, existing.confidence * 0.85),
    };
    return {
      data: {
        ...data,
        memories: [
          ...data.memories.map((m) => (m.id === existing.id ? superseded : m)),
          next,
        ],
        recentUpdates: [
          {
            id: next.id,
            label: `${next.subject}: ${next.object}`.slice(0, 80),
            at: Date.now(),
          },
          ...data.recentUpdates,
        ].slice(0, 20),
      },
      changed: true,
      label: next.object,
    };
  }

  return {
    data: {
      ...data,
      memories: [...data.memories, item],
      recentUpdates: [
        {
          id: item.id,
          label: `${item.subject}: ${item.object}`.slice(0, 80),
          at: Date.now(),
        },
        ...data.recentUpdates,
      ].slice(0, 20),
    },
    changed: true,
    label: item.object,
  };
}

export function addEpisode(
  data: MemoryStoreData,
  ep: EpisodeSummary,
): MemoryStoreData {
  return { ...data, episodes: [...data.episodes, ep].slice(-200) };
}

export function addChunk(data: MemoryStoreData, chunk: TextChunk): MemoryStoreData {
  return { ...data, chunks: [...data.chunks, chunk].slice(-500) };
}
