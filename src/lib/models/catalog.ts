/** Curated models ordinary users can pull inside Liora (public Ollama library). */

export type ModelTier = "light" | "balanced" | "strong";

export interface RecommendedModel {
  /** Ollama pull name, e.g. qwen2.5:7b */
  id: string;
  tier: ModelTier;
  /** Approximate download size label */
  sizeLabel: string;
  /** Approx size in GB for sorting / UI */
  sizeGb: number;
  /** Min recommended system RAM (GB) */
  minRamGb: number;
  zh: { name: string; blurb: string };
  en: { name: string; blurb: string };
}

/**
 * Three practical picks for Chinese + general use.
 * Prefer widely available library tags so pull succeeds on stock Ollama.
 */
export const RECOMMENDED_MODELS: RecommendedModel[] = [
  {
    id: "qwen2.5:1.5b",
    tier: "light",
    sizeLabel: "~1 GB",
    sizeGb: 1,
    minRamGb: 8,
    zh: {
      name: "轻量 · Qwen2.5 1.5B",
      blurb: "体积小、启动快，适合入门与低配机器，中文尚可。",
    },
    en: {
      name: "Light · Qwen2.5 1.5B",
      blurb: "Small & fast. Good starter for modest PCs.",
    },
  },
  {
    id: "qwen2.5:7b",
    tier: "balanced",
    sizeLabel: "~4.7 GB",
    sizeGb: 4.7,
    minRamGb: 16,
    zh: {
      name: "均衡 · Qwen2.5 7B",
      blurb: "质量与速度较平衡，中文对话推荐首选（默认推荐）。",
    },
    en: {
      name: "Balanced · Qwen2.5 7B",
      blurb: "Best quality/speed trade-off. Default recommendation.",
    },
  },
  {
    id: "qwen2.5:14b",
    tier: "strong",
    sizeLabel: "~9 GB",
    sizeGb: 9,
    minRamGb: 24,
    zh: {
      name: "强力 · Qwen2.5 14B",
      blurb: "回答更稳、更细，需要更多内存/显存；慢一点但更强。",
    },
    en: {
      name: "Strong · Qwen2.5 14B",
      blurb: "Higher quality; needs more RAM/VRAM and is slower.",
    },
  },
];

export type RecLevel = "light" | "balanced" | "strong";

/** Map total system RAM (GiB) to a recommended tier. */
export function recommendTier(ramGb: number | null | undefined): RecLevel {
  if (ramGb == null || !Number.isFinite(ramGb)) return "balanced";
  if (ramGb < 12) return "light";
  if (ramGb < 20) return "balanced";
  return "strong";
}

export function isModelInstalled(
  modelId: string,
  installed: string[],
): boolean {
  const base = modelId.replace(/:latest$/, "");
  return installed.some(
    (m) =>
      m === modelId ||
      m === base ||
      m === `${base}:latest` ||
      m.startsWith(`${base}:`) ||
      m.replace(/:latest$/, "") === base,
  );
}
