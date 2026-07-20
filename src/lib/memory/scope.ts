import { DEFAULT_CHARACTER } from "../../data/defaults";
import type { CharacterCard } from "../../types";
import type {
  EpisodeSummary,
  MemoryItem,
  MemoryScope,
  MemoryStoreData,
  TextChunk,
} from "../../types/memory";
import { L3_IDENTITY_PREDICATES } from "./profileHeuristics";

export function isMetaCharacter(
  card: CharacterCard | null | undefined,
): boolean {
  if (!card) return false;
  if (card.kind === "meta") return true;
  // Builtin Liora id stays Meta even if older saves omitted kind
  return card.id === DEFAULT_CHARACTER.id && card.kind !== "persona";
}

export function characterKindOf(
  card: CharacterCard | null | undefined,
): "meta" | "persona" {
  return isMetaCharacter(card) ? "meta" : "persona";
}

/**
 * Where new atoms go when extracted / remembered in a session.
 * Meta chat → master (user dossier). Persona chat → that character only.
 */
export function writeTargetForCharacter(card: CharacterCard | null | undefined): {
  scope: "master" | "character";
  characterId?: string;
} {
  if (isMetaCharacter(card)) {
    return { scope: "master" };
  }
  const id = card?.id?.trim() || DEFAULT_CHARACTER.id;
  return { scope: "character", characterId: id };
}

/** Stable merge key so master and per-character facts do not clobber each other. */
export function memoryDedupeKey(m: Pick<
  MemoryItem,
  "scope" | "characterId" | "subject" | "predicate"
>): string {
  const scope = m.scope ?? "character";
  const owner = scope === "master" ? "master" :
    scope === "orphan" ? "orphan" : (m.characterId ?? "orphan").trim();
  return `${scope}::${owner}::${m.subject}::${m.predicate}`.toLowerCase();
}

export function stampMemoryAtom(
  item: Omit<MemoryItem, "scope" | "characterId"> &
    Partial<Pick<MemoryItem, "scope" | "characterId">>,
  target: { scope: MemoryScope; characterId?: string },
): MemoryItem {
  if (target.scope === "master") {
    return {
      ...item,
      scope: "master",
      characterId: undefined,
    } as MemoryItem;
  }
  if (target.scope === "orphan") {
    return {
      ...item,
      scope: "orphan",
      characterId: undefined,
    } as MemoryItem;
  }
  return {
    ...item,
    scope: "character",
    characterId: target.characterId ?? DEFAULT_CHARACTER.id,
  } as MemoryItem;
}

export function stampEpisode(
  ep: EpisodeSummary,
  characterId: string,
): EpisodeSummary {
  return {
    ...ep,
    characterId: ep.characterId ?? characterId,
    scope: ep.scope ?? "character",
  };
}

export function stampChunk(ch: TextChunk, characterId: string): TextChunk {
  return {
    ...ch,
    characterId: ch.characterId ?? characterId,
    scope: ch.scope ?? "character",
  };
}

/**
 * Memories visible to the current chat role.
 * - Meta: master + orphan directly; persona memories are searched by relevance.
 * - Persona: shared master profile + that character's private memories.
 */
export function memoriesForInjection(
  items: MemoryItem[],
  options: { isMeta: boolean; characterId: string },
): MemoryItem[] {
  const active = items.filter((m) => m.status === "active");
  if (options.isMeta) {
    return active.filter((m) => {
      const scope = m.scope ?? (m.characterId ? "character" : "orphan");
      if (scope === "master" || scope === "orphan") return true;
      return false;
    });
  }
  return active.filter(
    (m) => {
      const scope = m.scope ?? (m.characterId ? "character" : "orphan");
      if (scope === "master") return true;
      return scope === "character" && (m.characterId ?? "") === options.characterId;
    },
  );
}

/** Character memories Meta may discover through its catalog/search index. */
export function characterMemoriesForMetaIndex(items: MemoryItem[]): MemoryItem[] {
  return items.filter((m) => m.status === "active" && m.scope === "character");
}

export function episodesForInjection(
  episodes: EpisodeSummary[],
  options: { characterId: string; sessionId: string },
): EpisodeSummary[] {
  return episodes.filter((e) => {
    if (e.sessionId === options.sessionId) return true;
    const cid = e.characterId;
    if (!cid) return false; // legacy cross-session without owner: skip for other sessions
    return cid === options.characterId;
  });
}

export function chunksForCharacter(
  chunks: TextChunk[],
  characterId: string,
): TextChunk[] {
  return chunks.filter((c) => {
    if (!c.characterId) return false;
    return c.characterId === characterId;
  });
}

/**
 * Migrate pre-R3 stores once.
 * L3 identity predicates → master; everything else → default character.
 */
export function migrateMemoryStoreScopes(
  data: MemoryStoreData,
  defaultCharacterId: string = DEFAULT_CHARACTER.id,
): MemoryStoreData {
  if (data.scopeMigrated && (data.scopeVersion ?? 1) >= 2) {
    return normalizeStoreShapes(data, defaultCharacterId);
  }

  const memories = (data.memories ?? []).map((m) => {
    if (m.scope === "master" || m.scope === "character" || m.scope === "orphan") {
      return m.scope === "master"
        ? { ...m, characterId: undefined }
        : m.scope === "orphan"
          ? { ...m, characterId: undefined }
        : {
            ...m,
            scope: m.characterId?.trim() ? "character" as const : "orphan" as const,
            characterId: m.characterId?.trim() || undefined,
          };
    }
    const pred = (m.predicate ?? "").toLowerCase();
    const identity =
      m.layer === "L3" &&
      (L3_IDENTITY_PREDICATES.has(pred) ||
        IDENTITY_EXTRA.has(pred) ||
        pred === "name" ||
        pred === "has_pet");
    if (identity) {
      return { ...m, scope: "master" as const, characterId: undefined };
    }
    return {
      ...m,
      scope: m.characterId?.trim() ? "character" as const : "orphan" as const,
      characterId: m.characterId?.trim() || undefined,
    };
  });

  const episodes = (data.episodes ?? []).map((e) => ({
    ...e,
    scope: (e.scope ?? "character") as MemoryScope,
    characterId: e.characterId?.trim() || defaultCharacterId,
  }));

  const chunks = (data.chunks ?? []).map((c) => ({
    ...c,
    scope: (c.scope ?? "character") as MemoryScope,
    characterId: c.characterId?.trim() || defaultCharacterId,
  }));

  return {
    ...data,
    version: 1,
    memories,
    episodes,
    chunks,
    scopeMigrated: true,
    scopeVersion: 2,
  };
}

const IDENTITY_EXTRA = new Set([
  "is",
  "occupation",
  "lives_in",
  "age",
  "called",
  "nickname",
]);

function normalizeStoreShapes(
  data: MemoryStoreData,
  defaultCharacterId: string,
): MemoryStoreData {
  return {
    ...data,
    version: 1,
    memories: (data.memories ?? []).map((m) => {
      const scope = m.scope ?? (m.characterId?.trim() ? "character" : "orphan");
      if (scope === "master") {
        return { ...m, scope: "master", characterId: undefined };
      }
      if (scope === "orphan") {
        return { ...m, scope: "orphan", characterId: undefined };
      }
      return {
        ...m,
        scope: "character",
        characterId: m.characterId?.trim() || defaultCharacterId,
      };
    }),
    episodes: (data.episodes ?? []).map((e) => ({
      ...e,
      scope: e.scope ?? "character",
      characterId: e.characterId?.trim() || defaultCharacterId,
    })),
    chunks: (data.chunks ?? []).map((c) => ({
      ...c,
      scope: c.scope ?? "character",
      characterId: c.characterId?.trim() || defaultCharacterId,
    })),
    scopeMigrated: true,
    scopeVersion: 2,
  };
}

/** Meta audits every scope; personas manage shared master + their own memories. */
export function memoriesForPanel(
  items: MemoryItem[],
  options: { isMeta: boolean; characterId: string },
): MemoryItem[] {
  if (options.isMeta) return items.filter((m) => m.status === "active");
  return memoriesForInjection(items, options);
}
