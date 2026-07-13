/**
 * Browser persistence: IndexedDB key-value (stable).
 * sql.js was attempted but Vite CJS/WASM interop was unreliable — kept docs for later Tauri native SQLite.
 */
export { migrateFromLocalStorageIfNeeded, mirrorSessionsToLocalStorage, mirrorSettingsToLocalStorage, mirrorMemoryToLocalStorage } from "./migrate";
export { loadAllSessions, replaceAllSessions } from "./sessionsRepo";
export { loadMemoryStoreFromDb, replaceMemoryStore } from "./memoryRepo";
export { loadSettingsFromDb, saveSettingsToDb } from "./settingsRepo";

/** no-op flush for API compatibility with previous sqlite layer */
export async function flushPersist(): Promise<void> {
  /* IndexedDB writes are already awaited in repos */
}

export function schedulePersist(_delayMs?: number): void {
  /* no-op */
}
