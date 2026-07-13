import type { MemoryLayer, MemoryType } from "../../types/memory";

export type ProfileCand = {
  layer: MemoryLayer;
  type: MemoryType;
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
};

/**
 * High-precision regex extractors for stable identity facts.
 * Complements the LLM extract so "我叫X / 养猫叫Y" survives long chats.
 */
export function extractProfileFromTranscript(transcript: string): ProfileCand[] {
  const out: ProfileCand[] = [];
  const seen = new Set<string>();

  const push = (c: ProfileCand) => {
    const k = `${c.subject}::${c.predicate}::${c.object}`.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(c);
  };

  // Only scan User lines when possible
  const userLines = transcript
    .split("\n")
    .filter((l) => /\]\s*User:/i.test(l) || /^User:/i.test(l))
    .map((l) => l.replace(/^.*?(User:)\s*/i, ""))
    .join("\n");
  const text = userLines || transcript;

  // 我叫X / 我的名字是X / 名字叫X
  const nameRe =
    /(?:我叫|我的名字是|名字是|名字叫|称呼我|叫我)\s*[「"“]?([A-Za-z\u4e00-\u9fff]{1,16})[」"”]?/g;
  for (const m of text.matchAll(nameRe)) {
    const name = m[1]?.trim();
    if (!name || name.length < 1) continue;
    push({
      layer: "L3",
      type: "fact",
      subject: "user",
      predicate: "name",
      object: name,
      confidence: 0.92,
    });
  }

  // 我是一名/我做X工作
  const jobRe =
    /(?:我是一名?|我的职业是|我做|从事|在)\s*([^\s，。！？,]{2,20})(?:工作|上班|行业)?/g;
  for (const m of text.matchAll(jobRe)) {
    const job = m[1]?.trim();
    if (!job || /猫|狗|宠物|人/.test(job)) continue;
    push({
      layer: "L3",
      type: "fact",
      subject: "user",
      predicate: "occupation",
      object: job.slice(0, 40),
      confidence: 0.75,
    });
  }

  // 养了只叫Y的猫/狗（要求显式「叫」以免吞掉「的」）
  const petNamed =
    /(?:养(?:了|着)?|有)(?:一只|条|个)?(?:叫|名叫)\s*[「"“]?([A-Za-z\u4e00-\u9fff]{1,12}?)[」"”]?\s*的?\s*(猫|狗|柯基|泰迪|柴犬|英短|美短|布偶|金毛|哈士奇)/g;
  for (const m of text.matchAll(petNamed)) {
    const petName = m[1]?.replace(/的$/g, "").trim();
    const breed = m[2];
    if (!petName || !breed) continue;
    const slug = petName.replace(/\s/g, "_").toLowerCase();
    push({
      layer: "L3",
      type: "fact",
      subject: `pet:${slug}`,
      predicate: "is",
      object: `${breed}「${petName}」`,
      confidence: 0.9,
    });
    push({
      layer: "L3",
      type: "fact",
      subject: "user",
      predicate: "has_pet",
      object: `${breed}「${petName}」`,
      confidence: 0.88,
    });
  }

  // 猫叫Y / 柯基叫豆豆
  const petCalled =
    /(猫|狗|柯基|泰迪|柴犬|英短|美短|布偶|金毛|哈士奇)\s*(?:叫|名叫)\s*[「"“]?([A-Za-z\u4e00-\u9fff]{1,12})[」"”]?/g;
  for (const m of text.matchAll(petCalled)) {
    const breed = m[1];
    const petName = m[2]?.trim();
    if (!petName) continue;
    const slug = petName.replace(/\s/g, "_").toLowerCase();
    push({
      layer: "L3",
      type: "fact",
      subject: `pet:${slug}`,
      predicate: "is",
      object: `${breed}「${petName}」`,
      confidence: 0.9,
    });
    push({
      layer: "L3",
      type: "fact",
      subject: "user",
      predicate: "has_pet",
      object: `${breed}「${petName}」`,
      confidence: 0.88,
    });
  }

  // 我养了猫/狗（无名）
  if (/(?:养(?:了|着)?|有)(?:一只|条|个)?(?:猫|猫咪)/.test(text) && !out.some((c) => c.subject.startsWith("pet:"))) {
    push({
      layer: "L3",
      type: "fact",
      subject: "user",
      predicate: "has_pet",
      object: "养猫",
      confidence: 0.7,
    });
  }
  if (/(?:养(?:了|着)?|有)(?:一只|条|个)?(?:狗|狗狗|犬)/.test(text) && !out.some((c) => /狗|犬/.test(c.object))) {
    push({
      layer: "L3",
      type: "fact",
      subject: "user",
      predicate: "has_pet",
      object: "养狗",
      confidence: 0.7,
    });
  }

  // 住在X / 在X市
  const cityRe = /(?:住在|我在|来自)\s*([^\s，。！？,]{2,12}(?:市|省|区|县)?)/g;
  for (const m of text.matchAll(cityRe)) {
    const place = m[1]?.trim();
    if (!place) continue;
    push({
      layer: "L3",
      type: "fact",
      subject: "user",
      predicate: "lives_in",
      object: place,
      confidence: 0.72,
    });
  }

  // Open-loop-ish: 还在观察/还没解决/待办
  const loopRe =
    /([^\n。！？]{4,40}(?:还在观察|还没解决|待办|需要跟进|尚未完成|正在看|观察中))/g;
  for (const m of text.matchAll(loopRe)) {
    const loop = m[1]?.trim();
    if (!loop || loop.length < 6) continue;
    push({
      layer: "L5",
      type: "event",
      subject: "user",
      predicate: "open_loop",
      object: loop.slice(0, 80),
      confidence: 0.7,
    });
  }

  return out;
}

/** Prefer keeping identity predicates in L3 injection order. */
export const L3_IDENTITY_PREDICATES = new Set([
  "name",
  "is",
  "has_pet",
  "occupation",
  "lives_in",
  "age",
  "called",
]);
