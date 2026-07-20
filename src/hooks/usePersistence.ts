import { useCallback, useEffect, useState } from "react";
import type { AppSettings, CharacterCard, Session } from "../types";
import type { MemoryStoreData } from "../types/memory";
import {
  flushPersist,
  mirrorMemoryToLocalStorage,
  mirrorSessionsToLocalStorage,
  mirrorSettingsToLocalStorage,
  replaceAllSessions,
  replaceMemoryStore,
  saveSettingsToDb,
} from "../lib/db";
import { saveCharacters } from "../lib/characters/repo";

interface PersistenceState {
  ready: boolean;
  sessions: Session[];
  settings: AppSettings;
  characters: CharacterCard[];
  memoryStore: MemoryStoreData;
}

/**
 * Owns background persistence and exposes a visible failure state.
 * LocalStorage mirrors remain recovery copies; desktop writes must succeed
 * before a save is considered durable.
 */
export function usePersistence(state: PersistenceState) {
  const [persistenceError, setPersistenceError] = useState<string | null>(null);

  const reportPersistenceError = useCallback((error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("Liora persistence failed:", error);
    setPersistenceError(detail);
  }, []);

  useEffect(() => {
    if (!state.ready) return;
    mirrorSessionsToLocalStorage(state.sessions);
    const timer = window.setTimeout(() => {
      void replaceAllSessions(state.sessions).catch(reportPersistenceError);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [state.ready, state.sessions, reportPersistenceError]);

  useEffect(() => {
    if (!state.ready) return;
    mirrorSettingsToLocalStorage(state.settings);
    void saveSettingsToDb(state.settings).catch(reportPersistenceError);
  }, [state.ready, state.settings, reportPersistenceError]);

  useEffect(() => {
    if (!state.ready) return;
    const timer = window.setTimeout(() => {
      void saveCharacters(state.characters).catch(reportPersistenceError);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [state.ready, state.characters, reportPersistenceError]);

  useEffect(() => {
    if (!state.ready) return;
    mirrorMemoryToLocalStorage(state.memoryStore);
    const timer = window.setTimeout(() => {
      void replaceMemoryStore(state.memoryStore).catch(reportPersistenceError);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [state.ready, state.memoryStore, reportPersistenceError]);

  useEffect(() => {
    const flush = () => void flushPersist();
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
    };
  }, []);

  return { persistenceError };
}
