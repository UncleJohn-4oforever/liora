import type { MemoryStoreData } from "../../types/memory";
import { kvGetJson, kvSetJson } from "./kv";

const KEY = "memory" as const;

const empty = (): MemoryStoreData => ({
  version: 1,
  memories: [],
  episodes: [],
  chunks: [],
  cursors: [],
  recentUpdates: [],
});

export async function loadMemoryStoreFromDb(): Promise<MemoryStoreData> {
  const data = await kvGetJson<MemoryStoreData>(KEY);
  if (!data || data.version !== 1) return empty();
  return {
    ...empty(),
    ...data,
    memories: data.memories ?? [],
    episodes: data.episodes ?? [],
    chunks: data.chunks ?? [],
    cursors: data.cursors ?? [],
    recentUpdates: data.recentUpdates ?? [],
  };
}

export async function replaceMemoryStore(data: MemoryStoreData): Promise<void> {
  await kvSetJson(KEY, data);
}

export async function countMemories(): Promise<number> {
  const data = await loadMemoryStoreFromDb();
  return data.memories.length;
}
