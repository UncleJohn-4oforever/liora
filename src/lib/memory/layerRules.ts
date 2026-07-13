import type { MemoryItem, MemoryLayer, MemoryType } from "../../types/memory";

/** Map free-form extract fields onto design layers. */
export function normalizeLayerAndType(input: {
  layer?: string;
  type?: string;
  subject?: string;
  predicate?: string;
  object?: string;
}): { layer: MemoryLayer; type: MemoryType } {
  const object = (input.object ?? "").trim();
  const predicate = (input.predicate ?? "").toLowerCase();
  const typeRaw = (input.type ?? "").toLowerCase();
  const layerRaw = (input.layer ?? "").toUpperCase();

  let type: MemoryType = "fact";
  if (
    ["fact", "preference", "procedure", "event", "boundary"].includes(typeRaw)
  ) {
    type = typeRaw as MemoryType;
  }

  // Force layer from type first
  if (type === "procedure" || type === "preference") {
    return { layer: "L4", type };
  }
  if (type === "event") {
    return { layer: "L5", type };
  }
  if (type === "boundary") {
    // boundaries often belong with interaction policy
    return { layer: "L4", type };
  }

  // Predicate / wording heuristics
  if (
    /prefers?|style|format|tone|answer|回答|风格|要点|列表|简洁|道歉|不要|格式|语气/.test(
      `${predicate} ${object}`,
    )
  ) {
    return {
      layer: "L4",
      type: type === "fact" ? "procedure" : type,
    };
  }

  if (
    /event|project|ongoing|health|allergy|观察|项目|事件|换粮|过敏|抓挠|住院|入职|截止日期/.test(
      `${predicate} ${object}`,
    )
  ) {
    return { layer: "L5", type: type === "fact" ? "event" : type };
  }

  if (layerRaw === "L4" || layerRaw === "L5" || layerRaw === "L3") {
    return { layer: layerRaw, type };
  }

  return { layer: "L3", type };
}

/**
 * Deterministic fallbacks when the LLM only emits L3 facts.
 * Scans user lines for style rules and notable ongoing events.
 */
export function heuristicCandidatesFromTranscript(
  transcript: string,
): Array<{
  layer: MemoryLayer;
  type: MemoryType;
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
}> {
  const out: Array<{
    layer: MemoryLayer;
    type: MemoryType;
    subject: string;
    predicate: string;
    object: string;
    confidence: number;
  }> = [];

  const userLines = transcript
    .split("\n")
    .filter((l) => /\] User:/i.test(l))
    .map((l) => l.replace(/^.*\] User:\s*/i, "").trim())
    .filter(Boolean);

  for (const line of userLines) {
    // L4: answer style
    if (
      /(要点|列表|bullet)/i.test(line) &&
      /(回答|回复|技术|问题)/.test(line)
    ) {
      out.push({
        layer: "L4",
        type: "procedure",
        subject: "user",
        predicate: "prefers_answer_format",
        object: line.slice(0, 160),
        confidence: 0.75,
      });
    } else if (/(不要|别).{0,6}道歉/.test(line)) {
      out.push({
        layer: "L4",
        type: "procedure",
        subject: "user",
        predicate: "dislikes",
        object: "回答开头不要道歉；直接给结论或要点",
        confidence: 0.8,
      });
    } else if (/(简洁|简短|短一点|少废话)/.test(line) && line.length >= 6) {
      out.push({
        layer: "L4",
        type: "preference",
        subject: "user",
        predicate: "prefers_brevity",
        object: line.slice(0, 160),
        confidence: 0.7,
      });
    }

    // L5: ongoing health / pet care / project-ish
    if (/(换粮|抓挠|过敏|皮肤|观察|就医|住院)/.test(line)) {
      const pet =
        line.match(/([「"“][^」"”]+[」"”]|豆豆|球球|柯基|边牧)/)?.[0] ??
        "pet";
      out.push({
        layer: "L5",
        type: "event",
        subject: /豆豆/.test(line)
          ? "pet:dou_dou"
          : pet.startsWith("pet")
            ? "pet"
            : `pet:${pet.replace(/[「」""“”]/g, "")}`,
        predicate: "ongoing_concern",
        object: line.slice(0, 180),
        confidence: 0.72,
      });
    }

    if (/(项目|deadline|截止日期|上线|交付)/i.test(line) && line.length >= 8) {
      out.push({
        layer: "L5",
        type: "event",
        subject: "user",
        predicate: "project_or_deadline",
        object: line.slice(0, 180),
        confidence: 0.68,
      });
    }
  }

  // de-dupe by layer+predicate+object prefix
  const seen = new Set<string>();
  return out.filter((c) => {
    const k = `${c.layer}|${c.predicate}|${c.object.slice(0, 40)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Soften specificity gate for actionable L4 procedures. */
export function layerAwarePasses(item: Pick<
  MemoryItem,
  "layer" | "type" | "subject" | "predicate" | "object" | "specificity"
>): boolean {
  if (item.layer === "L4") {
    const o = item.object.trim();
    // executable style rule: length + constraint words
    if (
      o.length >= 8 &&
      /(要点|列表|简洁|简短|不要|别|格式|条|句|道歉|直接|结论)/.test(o)
    ) {
      return item.specificity >= 0.4 || o.length >= 12;
    }
  }
  if (item.layer === "L5") {
    const o = item.object.trim();
    if (o.length >= 10 && /(观察|换粮|抓挠|项目|进行中|未决|待)/.test(o)) {
      return item.specificity >= 0.45 || o.length >= 14;
    }
  }
  return item.specificity >= 0.55;
}
