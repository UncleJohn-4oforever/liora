/**
 * What the top engine pill should show beyond raw online/offline.
 * Covers: engine boot, model pull, model VRAM load / switch.
 */

export type EngineActivityKind =
  | "idle"
  | "engine_start"
  | "pull"
  | "load"
  | "vision"
  | "generate";

export interface EngineActivity {
  kind: EngineActivityKind;
  /** Short label next to engine status */
  label: string;
  /** 0–100 when known; null = indeterminate */
  percent: number | null;
  /** Optional model name / detail */
  detail?: string;
}

export const IDLE_ACTIVITY: EngineActivity = {
  kind: "idle",
  label: "",
  percent: null,
};

/**
 * How long Ollama keeps weights in VRAM after a request.
 * `-1` = stay loaded until Ollama process exits (matches LM Studio / bare Ollama UX).
 * Liora-owned `ollama serve` is stopped when the app quits.
 */
export const OLLAMA_KEEP_ALIVE: string | number = -1;

export function pullActivity(
  model: string,
  percent: number | null,
  status: string,
  locale: "zh" | "en",
): EngineActivity {
  const short = model.replace(/:latest$/, "");
  return {
    kind: "pull",
    label:
      locale === "en"
        ? `Downloading ${short}`
        : `下载 ${short}`,
    percent,
    detail: status,
  };
}

/** Only for real weight load / switch — not every chat turn. */
export function loadActivity(
  model: string,
  locale: "zh" | "en",
): EngineActivity {
  const short = (model || "").replace(/:latest$/, "") || "…";
  return {
    kind: "load",
    label:
      locale === "en"
        ? `Loading ${short} into memory`
        : `加载模型 ${short}`,
    percent: null,
    detail: short,
  };
}

/** Normal reply generation (model already resident). */
export function generateActivity(
  model: string,
  locale: "zh" | "en",
): EngineActivity {
  const short = (model || "").replace(/:latest$/, "") || "…";
  return {
    kind: "generate",
    label:
      locale === "en"
        ? `Generating · ${short}`
        : `生成中 · ${short}`,
    percent: null,
    detail: short,
  };
}

/** One-shot vision describe (image → text); does not keep pixels in chat history. */
export function visionActivity(
  model: string,
  locale: "zh" | "en",
): EngineActivity {
  const short = (model || "").replace(/:latest$/, "") || "…";
  return {
    kind: "vision",
    label:
      locale === "en" ? `Reading image · ${short}` : `看图中 · ${short}`,
    percent: null,
    detail: short,
  };
}

export function engineStartActivity(locale: "zh" | "en"): EngineActivity {
  return {
    kind: "engine_start",
    label: locale === "en" ? "Starting engine" : "启动引擎",
    percent: null,
  };
}
