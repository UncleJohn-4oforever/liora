/** Lightweight term features for cold chunk retrieval (not neural embeddings). */

export function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const parts = lower.match(/[\u4e00-\u9fff]{1,}|[a-z0-9_]{2,}/g) ?? [];
  // also bigrams for CJK singles
  const out: string[] = [];
  for (const p of parts) {
    if (/^[\u4e00-\u9fff]+$/.test(p) && p.length >= 2) {
      for (let i = 0; i < p.length - 1; i++) out.push(p.slice(i, i + 2));
    }
    out.push(p);
  }
  return out;
}

export function termFreq(text: string): Record<string, number> {
  const tf: Record<string, number> = {};
  for (const t of tokenize(text)) {
    tf[t] = (tf[t] ?? 0) + 1;
  }
  return tf;
}

export function cosineSparse(
  a: Record<string, number>,
  b: Record<string, number>,
): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [k, v] of Object.entries(a)) {
    na += v * v;
    if (b[k]) dot += v * b[k];
  }
  for (const v of Object.values(b)) nb += v * v;
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function retrieveChunks(
  chunks: { id: string; text: string; terms: Record<string, number>; sessionId: string }[],
  query: string,
  topK = 4,
): { id: string; text: string; score: number }[] {
  const q = termFreq(query);
  return chunks
    .map((c) => ({
      id: c.id,
      text: c.text,
      score: cosineSparse(q, c.terms),
    }))
    .filter((x) => x.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
