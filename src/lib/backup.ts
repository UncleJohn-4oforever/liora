import { ensureBuiltin } from "./characters/repo";
import type { AppSettings, CharacterCard, Session } from "../types";
import type { MemoryStoreData } from "../types/memory";

export const BACKUP_FORMAT = "liora-backup" as const;
/** v1: settings + sessions + memory; optional characters (0.6+) */
export const BACKUP_VERSION = 1 as const;

export interface LioraBackup {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: number;
  app: string;
  settings: AppSettings;
  sessions: Session[];
  memory: MemoryStoreData;
  /** Role library; optional for backups exported before 0.6 */
  characters?: CharacterCard[];
}

export type ImportMode = "replace" | "merge";

export function buildBackup(input: {
  settings: AppSettings;
  sessions: Session[];
  memory: MemoryStoreData;
  characters?: CharacterCard[];
}): LioraBackup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    app: "Liora",
    settings: input.settings,
    sessions: input.sessions,
    memory: input.memory,
    characters: ensureBuiltin(input.characters ?? []),
  };
}

export function downloadBackup(backup: LioraBackup, filename?: string): void {
  const name =
    filename ??
    `liora-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseBackupJson(text: string): LioraBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    throw new Error("Invalid JSON");
  }
  if (!raw || typeof raw !== "object") throw new Error("Backup is not an object");
  const b = raw as Partial<LioraBackup>;
  if (b.format !== BACKUP_FORMAT) {
    throw new Error(`Unknown format: ${String(b.format)}`);
  }
  if (b.version !== 1) {
    throw new Error(`Unsupported backup version: ${String(b.version)}`);
  }
  if (!b.settings || !Array.isArray(b.sessions) || !b.memory) {
    throw new Error("Backup missing settings/sessions/memory");
  }
  if (b.memory.version !== 1) {
    throw new Error("Memory payload version mismatch");
  }
  if (b.characters != null && !Array.isArray(b.characters)) {
    throw new Error("Backup characters must be an array when present");
  }
  return b as LioraBackup;
}

function mergeSessions(local: Session[], incoming: Session[]): Session[] {
  const map = new Map<string, Session>();
  for (const s of local) map.set(s.id, s);
  for (const s of incoming) {
    const prev = map.get(s.id);
    if (!prev || s.updatedAt >= prev.updatedAt) {
      map.set(s.id, s);
    }
  }
  return [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

function mergeMemory(
  local: MemoryStoreData,
  incoming: MemoryStoreData,
): MemoryStoreData {
  const memMap = new Map(local.memories.map((m) => [m.id, m]));
  for (const m of incoming.memories ?? []) {
    const prev = memMap.get(m.id);
    if (!prev || m.updatedAt >= prev.updatedAt) memMap.set(m.id, m);
  }
  const epMap = new Map(local.episodes.map((e) => [e.id, e]));
  for (const e of incoming.episodes ?? []) epMap.set(e.id, e);
  const chMap = new Map(local.chunks.map((c) => [c.id, c]));
  for (const c of incoming.chunks ?? []) chMap.set(c.id, c);
  const curMap = new Map(local.cursors.map((c) => [c.sessionId, c]));
  for (const c of incoming.cursors ?? []) {
    const prev = curMap.get(c.sessionId);
    if (!prev || c.updatedAt >= prev.updatedAt) curMap.set(c.sessionId, c);
  }
  return {
    version: 1,
    memories: [...memMap.values()],
    episodes: [...epMap.values()].slice(-500),
    chunks: [...chMap.values()].slice(-800),
    cursors: [...curMap.values()],
    recentUpdates: [
      ...(incoming.recentUpdates ?? []),
      ...local.recentUpdates,
    ].slice(0, 20),
  };
}

function mergeCharacters(
  local: CharacterCard[],
  incoming: CharacterCard[] | undefined,
): CharacterCard[] {
  if (!incoming?.length) return ensureBuiltin(local);
  const map = new Map<string, CharacterCard>();
  for (const c of ensureBuiltin(local)) map.set(c.id, c);
  for (const c of incoming) {
    if (!c?.id) continue;
    const prev = map.get(c.id);
    const nextUpdated = c.updatedAt ?? 0;
    const prevUpdated = prev?.updatedAt ?? 0;
    if (!prev || nextUpdated >= prevUpdated) {
      map.set(c.id, c);
    }
  }
  return ensureBuiltin([...map.values()]);
}

export function applyBackup(
  current: {
    settings: AppSettings;
    sessions: Session[];
    memory: MemoryStoreData;
    characters?: CharacterCard[];
  },
  backup: LioraBackup,
  mode: ImportMode,
): {
  settings: AppSettings;
  sessions: Session[];
  memory: MemoryStoreData;
  characters: CharacterCard[];
} {
  const localChars = ensureBuiltin(current.characters ?? []);
  if (mode === "replace") {
    return {
      settings: { ...current.settings, ...backup.settings },
      sessions: backup.sessions,
      memory: {
        version: 1,
        memories: backup.memory.memories ?? [],
        episodes: backup.memory.episodes ?? [],
        chunks: backup.memory.chunks ?? [],
        cursors: backup.memory.cursors ?? [],
        recentUpdates: backup.memory.recentUpdates ?? [],
      },
      // Old backups without characters: keep local library
      characters: backup.characters?.length
        ? ensureBuiltin(backup.characters)
        : localChars,
    };
  }
  return {
    settings: { ...current.settings, ...backup.settings },
    sessions: mergeSessions(current.sessions, backup.sessions),
    memory: mergeMemory(current.memory, backup.memory),
    characters: mergeCharacters(localChars, backup.characters),
  };
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsText(file, "utf-8");
  });
}
