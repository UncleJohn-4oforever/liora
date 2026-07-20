import type {
  AnswerLength,
  CharacterCard,
  ContextSize,
  Locale,
  Message,
} from "../../types";
import type { MemoryStoreData } from "../../types/memory";
import {
  buildSystemPrompt,
  characterToPromptInput,
  normalizeContextSize,
} from "../chatPrompt";
import {
  buildMemorySystemBlock,
  composeSystemPrompt,
} from "./assemble";
import { computeHotStartIndex, hotMessagesByBudget } from "./rolling";
import { estimateMessagesTokens, estimateTokens } from "./tokens";

export interface SlotUsage {
  name: string;
  tokens: number;
  capped: boolean;
}

export interface AssembledBudget {
  /** Context window (num_ctx) */
  limit: number;
  /** Tokens reserved for generation */
  reservedGen: number;
  /** Estimated prompt tokens after packing */
  estimatedPrompt: number;
  /** How full the context is (prompt / limit) */
  fillRatio: number;
  slots: SlotUsage[];
  hotStartIndex: number;
  hotCount: number;
  coldCount: number;
  /** True if we truncated memory/summary blocks to fit */
  trimmed: boolean;
}

export interface AssembleResult {
  systemPrompt: string;
  hotMessages: Message[];
  budget: AssembledBudget;
}

function trimToBudget(text: string, maxTokens: number): {
  text: string;
  capped: boolean;
} {
  if (maxTokens <= 0) return { text: "", capped: true };
  if (estimateTokens(text) <= maxTokens) {
    return { text, capped: false };
  }
  // Binary-search character length roughly
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const slice = text.slice(0, mid);
    if (estimateTokens(slice) <= maxTokens) lo = mid;
    else hi = mid - 1;
  }
  const cut = Math.max(0, lo - 1);
  return {
    text: text.slice(0, cut) + (cut < text.length ? "…" : ""),
    capped: true,
  };
}

/**
 * Pack system + memory + hot dialogue under a hard token budget.
 * Cold dialogue is never included as raw messages (only via memory/summaries).
 */
export function assembleChatContext(options: {
  messages: Message[];
  sessionId: string;
  store: MemoryStoreData;
  locale: Locale;
  answerLength: AnswerLength;
  memoryEnabled: boolean;
  showThinking: boolean;
  contextSize?: ContextSize;
  /** Session-bound character (persona + R3 memory scope). */
  character?: CharacterCard | null;
  /** Meta receives a compact catalog, never every persona prompt. */
  characterCatalog?: CharacterCard[];
}): AssembleResult {
  const numCtx = normalizeContextSize(options.contextSize);
  const reservedGen = options.showThinking
    ? Math.min(2048, Math.floor(numCtx * 0.28))
    : Math.min(1536, Math.floor(numCtx * 0.22));
  const safety = 48;
  const available = Math.max(512, numCtx - reservedGen - safety);

  const baseSystem = buildSystemPrompt(
    options.locale,
    options.answerLength,
    characterToPromptInput(options.character ?? undefined, options.locale),
  );
  const s0Budget = Math.floor(available * 0.12);
  const s0Trim = trimToBudget(baseSystem, s0Budget);

  let memBlock = "";
  let s1capped = false;
  if (options.memoryEnabled) {
    const latest =
      [...options.messages].reverse().find((m) => m.role === "user")
        ?.content ?? "";
    const raw = buildMemorySystemBlock(
      options.store,
      options.sessionId,
      latest,
      options.locale,
      options.character,
      options.characterCatalog,
    );
    // Memory + summaries: up to ~40% of available (profile + L2 chain)
    const s1Budget = Math.floor(available * 0.4);
    const t = trimToBudget(raw, s1Budget);
    memBlock = t.text;
    s1capped = t.capped;
  }

  let systemPrompt = composeSystemPrompt(s0Trim.text, memBlock);
  // Final hard cap on whole system block (~55% available)
  const sysCap = trimToBudget(systemPrompt, Math.floor(available * 0.55));
  systemPrompt = sysCap.text;

  const hotStart = computeHotStartIndex(options.messages, numCtx);
  let hot = options.messages.slice(hotStart);

  // Fit hot messages into remaining budget after system
  const sysTokens = estimateTokens(systemPrompt) + 8;
  let rem = available - sysTokens;
  // Walk from newest, drop oldest hot messages if needed
  while (hot.length > minKeep(hot.length) && estimateMessagesTokens(hot) + 8 > rem) {
    hot = hot.slice(1);
  }
  // If still over, truncate oldest message content in hot window
  if (hot.length && estimateMessagesTokens(hot) + 8 > rem) {
    const first = hot[0];
    const others = estimateMessagesTokens(hot.slice(1)) + 8;
    const allow = Math.max(32, rem - others - 4);
    const body = trimToBudget(first.content, allow);
    hot = [{ ...first, content: body.text }, ...hot.slice(1)];
  }

  const hotTokens = estimateMessagesTokens(hot);
  const estimatedPrompt = sysTokens + hotTokens + 4;
  const trimmed =
    s0Trim.capped || s1capped || sysCap.capped || hotStart > 0;

  const budget: AssembledBudget = {
    limit: numCtx,
    reservedGen,
    estimatedPrompt,
    fillRatio: estimatedPrompt / numCtx,
    slots: [
      {
        name: "system",
        tokens: estimateTokens(s0Trim.text),
        capped: s0Trim.capped,
      },
      {
        name: "memory",
        tokens: estimateTokens(memBlock),
        capped: s1capped,
      },
      {
        name: "hot",
        tokens: hotTokens,
        capped: hot.length < options.messages.length - hotStart
          ? true
          : false,
      },
    ],
    hotStartIndex: hotStart,
    hotCount: hot.length,
    coldCount: hotStart,
    trimmed,
  };

  return { systemPrompt, hotMessages: hot, budget };
}

function minKeep(n: number): number {
  return Math.min(n, 2);
}

/** Prefer budget assemble; keeps old helper name usable. */
export function selectHotMessages(
  messages: Message[],
  contextSize?: ContextSize,
): Message[] {
  return hotMessagesByBudget(messages, normalizeContextSize(contextSize));
}

export function formatBudgetHint(
  budget: AssembledBudget,
  locale: Locale,
): string {
  const pct = Math.round(budget.fillRatio * 100);
  if (locale === "en") {
    return `Packed ~${budget.estimatedPrompt}/${budget.limit} tok (${pct}%) · hot ${budget.hotCount} · cold ${budget.coldCount}${budget.trimmed ? " · trimmed" : ""}`;
  }
  return `组装约 ${budget.estimatedPrompt}/${budget.limit} token（${pct}%）· 热区 ${budget.hotCount} 条 · 冷区 ${budget.coldCount} 条${budget.trimmed ? " · 已压缩裁剪" : ""}`;
}
