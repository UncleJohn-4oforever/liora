import { DEFAULT_CHARACTER } from "../../data/defaults";
import type { MemoryStoreData } from "../../types/memory";
import { migrateMemoryStoreScopes } from "../memory/scope";
import { kvGetJson, kvSetJson } from "./kv";

const KEY = "memory" as const;

const empty = (): MemoryStoreData => ({
  version: 1,
  memories: [],
  episodes: [],
  chunks: [],
  cursors: [],
  recentUpdates: [],
  scopeMigrated: true,
  scopeVersion: 2,
});

export async function loadMemoryStoreFromDb(): Promise<MemoryStoreData> {
  const data = await kvGetJson<MemoryStoreData>(KEY);
  if (!data || data.version !== 1) return empty();
  const base = {
    ...empty(),
    ...data,
    memories: data.memories ?? [],
    episodes: data.episodes ?? [],
    chunks: data.chunks ?? [],
    cursors: data.cursors ?? [],
    recentUpdates: data.recentUpdates ?? [],
  };
  const migrated = migrateMemoryStoreScopes(base, DEFAULT_CHARACTER.id);
  if (!data.scopeMigrated || (data.scopeVersion ?? 1) < 2) {
    // Persist migration so flags stick
    try {
      await kvSetJson(KEY, migrated);
    } catch {
      /* ignore */
    }
  }
  return migrated;
}

export async function replaceMemoryStore(data: MemoryStoreData): Promise<void> {
  await kvSetJson(KEY, data);
}

export async function countMemories(): Promise<number> {
  const data = await loadMemoryStoreFromDb();
  return data.memories.length;
}
