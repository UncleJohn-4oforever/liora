/**
 * Pick a model that can accept Ollama `images[]` (vision / multimodal).
 *
 * Prefer Ollama-reported `capabilities: ["vision"]` over name heuristics.
 * Never fall back to a known text-only chat model (causes HTTP 400 multimodal).
 */

/** Name hints when capability list is missing (older Ollama / partial probe). */
const VISION_NAME_RE =
  /llava|bakllava|minicpm.?v|moondream|qwen.*vl|vl.?qwen|qwen2\.5-?vl|qwen3-?vl|llama3\.2-vision|llama.?vision|pixtral|internvl|phi-?3\.?5.?vision|phi4.?vision|gemma3|gemma-?3|gemma4|gemma-?4|multimodal|clip/i;

/** True if model name *looks* like a vision build (weak signal only). */
export function looksLikeVisionModel(name: string): boolean {
  return VISION_NAME_RE.test((name || "").trim());
}

function resolveInList(preferred: string, available: string[]): string | null {
  const pref = preferred.trim();
  if (!pref || available.length === 0) return null;
  const exact = available.find((m) => m === pref);
  if (exact) return exact;
  const tagged = available.find(
    (m) => m === `${pref}:latest` || m.startsWith(`${pref}:`),
  );
  if (tagged) return tagged;
  const base = pref.replace(/:.*$/, "");
  return (
    available.find((m) => m === base || m.startsWith(`${base}:`)) ?? null
  );
}

/**
 * Resolve which Ollama tag to use for image describe.
 * @returns installed vision model name, or null if none safe to use
 */
export function pickVisionModel(options: {
  available: string[];
  /**
   * Models Ollama lists with capability `vision`.
   * When provided (even empty array), trust this over name heuristics for fallbacks.
   * `undefined` = capability data unavailable → name heuristic only.
   */
  visionCapable?: string[] | null;
  /** Optional user preference (settings later) */
  preferred?: string | null;
  /** Current chat model — only used if it is vision-capable */
  chatModel?: string | null;
}): string | null {
  const available = options.available.filter(Boolean);
  if (available.length === 0) return null;

  const capsKnown = options.visionCapable != null;
  const visionList = (options.visionCapable ?? []).filter((n) =>
    available.includes(n),
  );

  // 1) Explicit preference if installed and vision-safe
  const pref = (options.preferred ?? "").trim();
  if (pref) {
    const hit = resolveInList(pref, available);
    if (hit) {
      if (!capsKnown) return hit;
      if (visionList.includes(hit)) return hit;
      // Preferred text-only model would 400 — ignore preference
    }
  }

  // 2) Official vision capability list (authoritative)
  if (visionList.length > 0) {
    const chat = (options.chatModel ?? "").trim();
    if (chat) {
      const chatAsVision = resolveInList(chat, visionList);
      if (chatAsVision) return chatAsVision;
    }
    return visionList[0]!;
  }

  // 3) Capability list known empty → do not guess text-only models
  if (capsKnown && visionList.length === 0) {
    return null;
  }

  // 4) No capability data: name heuristic only (never "first installed")
  const nameHits = available.filter(looksLikeVisionModel);
  if (nameHits.length > 0) {
    const chat = (options.chatModel ?? "").trim();
    if (chat) {
      const chatHit = resolveInList(chat, nameHits);
      if (chatHit) return chatHit;
    }
    return nameHits[0]!;
  }

  return null;
}

/** Short help after multimodal 400 / no vision model. */
export function visionInstallHint(locale: "zh" | "en"): string {
  return locale === "en"
    ? "Install a vision model in Ollama, e.g. `ollama pull llava` or `ollama pull qwen2.5vl`. LM Studio multimodal GGUFs are not shared with Ollama unless you import a build Ollama marks with vision capability."
    : "请在 Ollama 中安装看图模型，例如：`ollama pull llava` 或 `ollama pull qwen2.5vl`。LM Studio 里能看图的权重，不会自动变成 Ollama 的 vision 模型；需 Ollama `/api/tags` 中 capabilities 含 vision。";
}
