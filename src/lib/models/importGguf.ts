import { invokeTauri, isTauri } from "../engine/platform";

export interface ImportGgufResult {
  ok: boolean;
  name: string;
  path: string;
  /** Auto-detected vision projector path (same folder), if any. */
  mmprojPath?: string | null;
  /** True when main GGUF + mmproj were staged for Ollama multimodal create. */
  visionAttached?: boolean;
  error?: string | null;
  log?: string | null;
}

/** Open native file dialog and return absolute path to a .gguf file. */
export async function pickGgufFile(): Promise<string | null> {
  if (!isTauri()) {
    return null;
  }
  try {
    const path = await invokeTauri<string | null>("pick_gguf_file");
    return path && path.trim() ? path.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Register a local GGUF with Ollama (`ollama create` via Modelfile).
 * Does not bake a SYSTEM prompt — persona is owned by Liora character cards.
 * Engine should be installed; API online is preferred but create uses CLI.
 */
export async function importLocalGguf(options: {
  path: string;
  name: string;
}): Promise<ImportGgufResult> {
  if (!isTauri()) {
    return {
      ok: false,
      name: options.name,
      path: options.path,
      error: "desktop_only",
    };
  }
  try {
    return await invokeTauri<ImportGgufResult>("ollama_import_gguf", {
      path: options.path,
      name: options.name,
      system: null,
    });
  } catch (e) {
    return {
      ok: false,
      name: options.name,
      path: options.path,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Suggest a model name from a GGUF file path. */
export function suggestNameFromPath(path: string): string {
  const base = path
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/\.gguf$/i, "")
    ?? "local-model";
  return base
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "local-model";
}

export function mapImportError(
  code: string | null | undefined,
  dict: {
    modelImportErrNotFound: string;
    modelImportErrNotGguf: string;
    modelImportErrName: string;
    modelImportErrOllama: string;
    modelImportErrDesktop: string;
    modelImportErrMmproj: string;
    modelImportFailed: string;
  },
): string {
  switch (code) {
    case "file_not_found":
      return dict.modelImportErrNotFound;
    case "not_gguf":
      return dict.modelImportErrNotGguf;
    case "picked_mmproj":
      return dict.modelImportErrMmproj;
    case "empty_name":
    case "invalid_name":
    case "name_too_long":
      return dict.modelImportErrName;
    case "ollama_not_found":
      return dict.modelImportErrOllama;
    case "desktop_only":
      return dict.modelImportErrDesktop;
    default:
      return code?.trim() ? code : dict.modelImportFailed;
  }
}
