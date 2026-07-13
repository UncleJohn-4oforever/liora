import type { AppSettings, Session } from "../../types";
import type { MemoryStoreData } from "../../types/memory";
import {
  loadSessions as loadSessionsLs,
  loadSettings as loadSettingsLs,
  saveSessions as saveSessionsLs,
  saveSettings as saveSettingsLs,
} from "../storage";
import { loadMemoryStore as loadMemoryLs } from "../memory/store";
import { countMemories, replaceMemoryStore } from "./memoryRepo";
import { countSessions, replaceAllSessions } from "./sessionsRepo";
import { saveSettingsToDb } from "./settingsRepo";
import { migrateIdbToDesktopIfNeeded } from "./desktopKv";
import { idbSetJson } from "./idbKv";
import { kvGetJson } from "./kv";

const MIGRATED_FLAG = "liora.idb.migrated.v1";

/**
 * One-shot import from legacy localStorage into current backend (IDB or desktop FS).
 * Desktop also pulls IDB → data dir when files are empty.
 */
export async function migrateFromLocalStorageIfNeeded(
  defaults: AppSettings,
): Promise<void> {
  // Desktop: promote old WebView IDB into chosen data directory once
  try {
    await migrateIdbToDesktopIfNeeded({
      loadIdbSessions: async () => null,
      loadIdbMemory: async () => null,
      loadIdbSettings: async () => null,
    });
  } catch {
    /* ignore */
  }

  if (localStorage.getItem(MIGRATED_FLAG) === "1") {
    const sc = await countSessions();
    if (sc > 0) return;
  }

  const sessionCount = await countSessions();
  const memoryCount = await countMemories();
  const settingsMissing = !(await kvGetJson("settings"));

  const lsSessions = loadSessionsLs();
  const lsMemory = loadMemoryLs();
  const lsSettings = loadSettingsLs(defaults);

  if (sessionCount === 0 && lsSessions.length > 0) {
    await replaceAllSessions(lsSessions);
  }

  if (
    memoryCount === 0 &&
    (lsMemory.memories.length > 0 ||
      lsMemory.episodes.length > 0 ||
      lsMemory.chunks.length > 0)
  ) {
    await replaceMemoryStore(lsMemory);
  }

  if (settingsMissing) {
    await saveSettingsToDb(lsSettings);
  }

  localStorage.setItem(MIGRATED_FLAG, "1");
  try {
    await idbSetJson("meta", { migratedAt: Date.now() });
  } catch {
    /* ignore on pure desktop */
  }
}

export function mirrorSessionsToLocalStorage(sessions: Session[]): void {
  try {
    saveSessionsLs(sessions);
  } catch {
    /* ignore */
  }
}

export function mirrorSettingsToLocalStorage(settings: AppSettings): void {
  try {
    saveSettingsLs(settings);
  } catch {
    /* ignore */
  }
}

export function mirrorMemoryToLocalStorage(data: MemoryStoreData): void {
  try {
    localStorage.setItem("liora.memory.v1", JSON.stringify(data));
  } catch {
    /* ignore */
  }
}
