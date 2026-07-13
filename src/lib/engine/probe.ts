import { OLLAMA_BASE } from "../../data/defaults";
import type { OllamaDetectResult } from "./types";
import { ollamaFetch } from "./ollamaFetch";
import { invokeTauri, isTauri } from "./platform";

export async function probeOllamaApi(
  timeoutMs = 2500,
): Promise<{ online: boolean; models: string[]; version: string | null }> {
  // Desktop: Rust-side HTTP is ground truth (WebView fetch / plugin-http can fail on localhost).
  if (isTauri()) {
    try {
      const r = await invokeTauri<{
        online: boolean;
        models: string[];
        version?: string | null;
        detail?: string;
      }>("probe_ollama_api");
      return {
        online: Boolean(r.online),
        models: Array.isArray(r.models) ? r.models : [],
        version: r.version ?? null,
      };
    } catch {
      /* fall through to HTTP fetch */
    }
  }

  try {
    const res = await ollamaFetch(`${OLLAMA_BASE}/api/tags`, {
      method: "GET",
      // plugin-http prefers connectTimeout; AbortSignal still works for window.fetch
      connectTimeout: timeoutMs,
      signal: AbortSignal.timeout(timeoutMs),
    } as RequestInit);
    if (!res.ok) {
      return { online: false, models: [], version: null };
    }
    const data = (await res.json()) as {
      models?: { name: string }[];
    };
    const models = (data.models ?? []).map((m) => m.name);
    let version: string | null = null;
    try {
      const vres = await ollamaFetch(`${OLLAMA_BASE}/api/version`, {
        connectTimeout: 1500,
        signal: AbortSignal.timeout(1500),
      } as RequestInit);
      if (vres.ok) {
        const v = (await vres.json()) as { version?: string };
        version = v.version ?? null;
      }
    } catch {
      /* optional */
    }
    return { online: true, models, version };
  } catch {
    return { online: false, models: [], version: null };
  }
}

export async function detectOllamaInstall(
  forceRefresh = false,
): Promise<OllamaDetectResult> {
  if (isTauri()) {
    try {
      return await invokeTauri<OllamaDetectResult>("detect_ollama", {
        forceRefresh,
      });
    } catch {
      /* fall through browser heuristics */
    }
  }
  // Browser cannot scan disk reliably.
  return { installed: false, path: null, version: null };
}

export async function startOllamaServe(): Promise<{
  ok: boolean;
  error?: string;
  method?: string;
  alreadyRunning?: boolean;
}> {
  if (!isTauri()) {
    return {
      ok: false,
      error: "browser_cannot_start",
    };
  }
  try {
    const r = await invokeTauri<{
      ok: boolean;
      alreadyRunning?: boolean;
      already_running?: boolean;
      method: string;
      error?: string | null;
    }>("start_ollama_serve");
    const already = Boolean(r.alreadyRunning ?? r.already_running);
    if (!r.ok) {
      return {
        ok: false,
        error: r.error ?? "start_failed",
        method: r.method,
        alreadyRunning: already,
      };
    }
    return {
      ok: true,
      method: r.method,
      alreadyRunning: already,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Wait until API is up or timeout. */
export async function waitUntilOnline(
  timeoutMs = 20000,
  intervalMs = 500,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const p = await probeOllamaApi(1500);
    if (p.online) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

export const OLLAMA_DOWNLOAD_URL = "https://ollama.com/download";
