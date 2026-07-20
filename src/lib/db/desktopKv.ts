/**
 * Desktop persistence: JSON files under a user-chosen data directory.
 * Config lives in %APPDATA%\Liora\storage-config.json (fixed).
 */
import { invokeTauri, isTauri } from "../engine/platform";
import { idbGetJson } from "./idbKv";

export type StoreName = "sessions" | "memory" | "settings" | "characters";

export interface StorageFileInfo {
  name: string;
  exists: boolean;
  sizeBytes: number;
}

export interface StorageInfo {
  configPath: string;
  dataDir: string;
  defaultDataDir: string;
  isDefault: boolean;
  dataDirExists: boolean;
  files: StorageFileInfo[];
}

export interface SetDataDirResult {
  ok: boolean;
  dataDir: string;
  migrated: boolean;
  error?: string | null;
}

export function isDesktopStorage(): boolean {
  return isTauri();
}

export async function getStorageInfo(): Promise<StorageInfo | null> {
  if (!isTauri()) return null;
  try {
    return await invokeTauri<StorageInfo>("storage_get_info");
  } catch {
    return null;
  }
}

export async function pickDataDir(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    const p = await invokeTauri<string | null>("storage_pick_data_dir");
    return p?.trim() ? p.trim() : null;
  } catch {
    return null;
  }
}

export async function setDataDir(
  path: string,
  migrate: boolean,
): Promise<SetDataDirResult> {
  if (!isTauri()) {
    return { ok: false, dataDir: path, migrated: false, error: "desktop_only" };
  }
  return invokeTauri<SetDataDirResult>("storage_set_data_dir", {
    path,
    migrate,
  });
}

export async function resetDataDirDefault(
  migrate: boolean,
): Promise<SetDataDirResult> {
  if (!isTauri()) {
    return { ok: false, dataDir: "", migrated: false, error: "desktop_only" };
  }
  return invokeTauri<SetDataDirResult>("storage_reset_default", { migrate });
}

export async function openDataDir(): Promise<void> {
  if (!isTauri()) return;
  await invokeTauri("storage_open_data_dir");
}

export async function openConfigDir(): Promise<void> {
  if (!isTauri()) return;
  await invokeTauri("storage_open_config_dir");
}

export async function desktopGetJson<T>(name: StoreName): Promise<T | null> {
  const raw = await invokeTauri<string | null>("storage_read_json", { name });
  if (raw == null || raw === "") return null;
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new Error(
      `invalid desktop JSON (${name}): ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function desktopSetJson(
  name: StoreName,
  value: unknown,
): Promise<void> {
  const content = JSON.stringify(value, null, 2);
  await invokeTauri("storage_write_json", { name, content });
}

/**
 * One-shot: if desktop files empty but browser IDB has data, copy into data dir.
 */
export async function migrateIdbToDesktopIfNeeded(options: {
  loadIdbSessions: () => Promise<unknown>;
  loadIdbMemory: () => Promise<unknown>;
  loadIdbSettings: () => Promise<unknown>;
}): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const info = await getStorageInfo();
    if (!info) return false;

    const hasSessions = info.files.some(
      (f) => f.name === "sessions.json" && f.exists && f.sizeBytes > 2,
    );
    const hasMemory = info.files.some(
      (f) => f.name === "memory.json" && f.exists && f.sizeBytes > 2,
    );
    if (hasSessions || hasMemory) return false;

    // Try IDB
    const sessions = await idbGetJson<unknown>("sessions");
    const memory = await idbGetJson<unknown>("memory");
    const settings = await idbGetJson<unknown>("settings");

    let wrote = false;
    if (Array.isArray(sessions) && sessions.length > 0) {
      await desktopSetJson("sessions", sessions);
      wrote = true;
    }
    if (memory && typeof memory === "object") {
      await desktopSetJson("memory", memory);
      wrote = true;
    }
    if (settings && typeof settings === "object") {
      await desktopSetJson("settings", settings);
      wrote = true;
    }
    // silence unused param if tree-shaken
    void options;
    return wrote;
  } catch {
    return false;
  }
}
