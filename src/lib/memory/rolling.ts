import type { Message } from "../../types";
import type { ContextSize } from "../../types";
import { normalizeContextSize } from "../chatPrompt";
import { estimateMessageTokens } from "./tokens";
import type { MemoryStoreData } from "../../types/memory";
import { getCursor } from "./store";

/**
 * How many tokens of recent dialogue we keep as hot L1.
 * Rest must be cold (summaries only).
 */
export function hotTokenBudget(numCtx: number): number {
  const ctx = Math.max(2048, numCtx);
  // ~32–38% of context for live turns; leave room for system/memory/gen
  if (ctx >= 16384) return 5200;
  if (ctx >= 8192) return 2800;
  return 1400;
}

export function maxHotTurns(numCtx: number): number {
  const ctx = Math.max(2048, numCtx);
  if (ctx >= 16384) return 20;
  if (ctx >= 8192) return 14;
  return 8;
}

export function minHotMessages(total: number): number {
  // Keep at least last 2 turns (user+assistant pairs) when possible → 4 msgs
  return Math.min(total, 4);
}

/**
 * Index of first message that stays in the hot window (inclusive).
 * Messages [0, hotStart) are cold and should only appear via summaries.
 */
export function computeHotStartIndex(
  messages: Message[],
  numCtx: number,
): number {
  if (messages.length === 0) return 0;
  const budget = hotTokenBudget(numCtx);
  const maxTurns = maxHotTurns(numCtx);
  // approximate: 1 turn ≈ 2 messages
  const maxMsgs = Math.min(messages.length, maxTurns * 2);

  let used = 0;
  let start = messages.length;
  for (let i = messages.length - 1; i >= 0; i--) {
    const kept = messages.length - i;
    if (kept > maxMsgs) break;
    const cost = estimateMessageTokens(messages[i].role, messages[i].content);
    if (used + cost > budget && kept > minHotMessages(messages.length)) {
      break;
    }
    used += cost;
    start = i;
  }
  return start;
}

export function hotMessagesByBudget(
  messages: Message[],
  numCtx: number,
): Message[] {
  const start = computeHotStartIndex(messages, numCtx);
  return messages.slice(start);
}

/** Cold region has at least 2 messages not yet summarized. */
export function shouldRunRollingCompress(
  store: MemoryStoreData,
  sessionId: string,
  messages: Message[],
  numCtx: number,
): boolean {
  if (messages.length < 4) return false;
  const hotStart = computeHotStartIndex(messages, numCtx);
  const cursor = getCursor(store, sessionId);
  const pending = hotStart - cursor.nextSummaryFrom;
  return pending >= 2;
}

export function rollingParamsFromContext(contextSize?: ContextSize): {
  numCtx: number;
  hotBudget: number;
  maxTurns: number;
} {
  const numCtx = normalizeContextSize(contextSize);
  return {
    numCtx,
    hotBudget: hotTokenBudget(numCtx),
    maxTurns: maxHotTurns(numCtx),
  };
}
