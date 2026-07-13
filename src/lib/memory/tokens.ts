/**
 * Lightweight token estimate for budget assembly.
 * Good enough for packing prompts; Ollama's prompt_eval_count remains ground truth after reply.
 */

const CJK =
  /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/;

/** Rough tokens for a string (CJK denser than ASCII). */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    if (CJK.test(ch)) cjk += 1;
    else other += 1;
  }
  // ~1.5 chars/token CJK, ~4 chars/token latin — ceil with small floor
  return Math.max(1, Math.ceil(cjk / 1.5 + other / 4));
}

/** Message role overhead in chat templates. */
export function estimateMessageTokens(
  role: string,
  content: string,
): number {
  return estimateTokens(content) + (role === "system" ? 6 : 4);
}

export function estimateMessagesTokens(
  messages: { role: string; content: string }[],
): number {
  let n = 0;
  for (const m of messages) {
    n += estimateMessageTokens(m.role, m.content);
  }
  return n;
}
