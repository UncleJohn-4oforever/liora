/**
 * Unified KV: desktop → JSON files in user data dir; browser → IndexedDB.
 */
import { isTauri } from "../engine/platform";
import {
  desktopGetJson,
  desktopSetJson,
  isDesktopStorage,
  type StoreName,
} from "./desktopKv";
import { idbGetJson, idbSetJson } from "./idbKv";

export type { StoreName };

export async function kvGetJson<T>(name: StoreName): Promise<T | null> {
  if (isDesktopStorage()) {
    try {
      return await desktopGetJson<T>(name);
    } catch (e) {
      console.warn("desktop kv get failed, fallback idb", name, e);
    }
  }
  return idbGetJson<T>(name);
}

export async function kvSetJson(
  name: StoreName,
  value: unknown,
): Promise<void> {
  if (isDesktopStorage()) {
    try {
      await desktopSetJson(name, value);
      // Best-effort IDB mirror for recovery tools
      try {
        await idbSetJson(name, value);
      } catch {
        /* ignore */
      }
      return;
    } catch (e) {
      // Keep a recovery copy, but do not pretend the user-selected desktop
      // store was updated. Otherwise the next launch can silently load stale
      // desktop data even though this call appeared to succeed.
      try {
        await idbSetJson(name, value);
      } catch {
        /* the original desktop error is the actionable one */
      }
      throw new Error(
        `desktop storage write failed (${name}): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  await idbSetJson(name, value);
}

export function storageBackendLabel(): "desktop-fs" | "indexeddb" {
  return isTauri() ? "desktop-fs" : "indexeddb";
}
