import { OLLAMA_BASE } from "../../data/defaults";
import type { OllamaDetectResult } from "./types";
import { ollamaFetch } from "./ollamaFetch";
import { invokeTauri, isTauri } from "./platform";

export type OllamaProbeResult = {
  online: boolean;
  models: string[];
  /** Models with Ollama capability `vision` */
  visionModels: string[];
  version: string | null;
};

function parseTagsModels(data: {
  models?: {
    name?: string;
    capabilities?: string[];
  }[];
}): { models: string[]; visionModels: string[] } {
  const models: string[] = [];
  const visionModels: string[] = [];
  for (const m of data.models ?? []) {
    const name = (m.name ?? "").trim();
    if (!name) continue;
    models.push(name);
    const caps = m.capabilities ?? [];
    if (caps.some((c) => String(c).toLowerCase() === "vision")) {
      visionModels.push(name);
    }
  }
  return { models, visionModels };
}

export async function probeOllamaApi(
  timeoutMs = 2500,
): Promise<OllamaProbeResult> {
  // Desktop: Rust-side HTTP is ground truth (WebView fetch / plugin-http can fail on localhost).
  if (isTauri()) {
    try {
      const r = await invokeTauri<{
        online: boolean;
        models: string[];
        visionModels?: string[];
        vision_models?: string[];
        version?: string | null;
        detail?: string;
      }>("probe_ollama_api");
      const visionModels = Array.isArray(r.visionModels)
        ? r.visionModels
        : Array.isArray(r.vision_models)
          ? r.vision_models
          : [];
      return {
        online: Boolean(r.online),
        models: Array.isArray(r.models) ? r.models : [],
        visionModels,
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
      return { online: false, models: [], visionModels: [], version: null };
    }
    const data = (await res.json()) as {
      models?: { name?: string; capabilities?: string[] }[];
    };
    const { models, visionModels } = parseTagsModels(data);
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
    return { online: true, models, visionModels, version };
  } catch {
    return { online: false, models: [], visionModels: [], version: null };
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
