import type { MemoryItem } from "../../types/memory";

const VAGUE = [
  /^有只/,
  /^一只/,
  /^喜欢/,
  /^不喜欢/,
  /^有一个/,
  /^some /i,
  /^a dog$/i,
  /^user likes/i,
  /^用户有/,
  /^聊了/,
  /^说过/,
];

/**
 * Score how specific a memory candidate is (0–1).
 * Reject vague items like "user has a dog".
 */
export function scoreSpecificity(input: {
  subject: string;
  predicate: string;
  object: string;
}): number {
  const object = (input.object ?? "").trim();
  const subject = (input.subject ?? "").trim();
  if (!object || !subject || !input.predicate?.trim()) return 0;

  let score = 0.35;

  // named entity / colon id
  if (/:/.test(subject) || /「|」|"|“|”/.test(object)) score += 0.2;
  // numbers / age / dates
  if (/\d/.test(object)) score += 0.15;
  // length with concrete detail
  if (object.length >= 8) score += 0.1;
  if (object.length >= 16) score += 0.1;
  // proper-ish tokens
  if (/[A-Za-z]{3,}|[\u4e00-\u9fff]{2,}/.test(object)) score += 0.1;

  for (const re of VAGUE) {
    if (re.test(object) && object.length < 12) score -= 0.35;
  }

  // bare "有只狗" style
  if (/^(有只|一只).{0,4}狗$/.test(object)) score = 0.2;
  if (/^用户有只/.test(object)) score = 0.15;

  return Math.max(0, Math.min(1, score));
}

export const SPECIFICITY_THRESHOLD = 0.55;

export function passesSpecificity(item: Pick<MemoryItem, "subject" | "predicate" | "object" | "specificity">): boolean {
  const s =
    typeof item.specificity === "number" && item.specificity > 0
      ? item.specificity
      : scoreSpecificity(item);
  return s >= SPECIFICITY_THRESHOLD;
}
