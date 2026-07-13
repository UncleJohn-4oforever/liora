import type { AnswerLength, ContextSize, Locale, ReplyStyle } from "../types";

export const CONTEXT_SIZE_OPTIONS: ContextSize[] = [4096, 8192, 16384];

export function normalizeContextSize(v: unknown): ContextSize {
  const n = Number(v);
  if (n === 4096 || n === 8192 || n === 16384) return n;
  return 8192;
}

/** Build the base system prompt from locale + reply style + answer length. */
export function buildSystemPrompt(
  locale: Locale,
  replyStyle: ReplyStyle = "balanced",
  answerLength: AnswerLength = "normal",
): string {
  const parts: string[] = [];

  if (locale === "en") {
    parts.push("You are Liora, a local private assistant on the user's computer.");
    switch (replyStyle) {
      case "work":
        parts.push(
          "Reply style: professional work assistant. Be structured, actionable, and business-appropriate.",
          "Prefer bullet points, clear next steps, and minimal fluff. Do not over-roleplay.",
        );
        break;
      case "companion":
        parts.push(
          "Reply style: warm companion. Be friendly, empathetic, and conversational.",
          "You may use a gentle tone, but do not claim real human emotions or physical presence.",
        );
        break;
      default:
        parts.push(
          "Reply style: balanced assistant. Clear, helpful, and natural — not stiff, not overly chatty.",
          "Do not over-roleplay or claim real emotions.",
        );
    }
    switch (answerLength) {
      case "concise":
        parts.push(
          "Length: keep answers concise. Lead with the key point; use short bullets when useful. Avoid long preambles.",
        );
        break;
      default:
        parts.push(
          "Length: give complete, normal-length answers with enough detail and examples when helpful.",
          "Do not truncate useful steps. Prefer thoroughness over extreme brevity.",
          "If the user asks for a long explanation, finish it fully instead of stopping mid-way.",
        );
    }
    parts.push("Match the user's language.");
  } else {
    parts.push("你是 Liora，运行在用户本机上的本地私密助手。");
    switch (replyStyle) {
      case "work":
        parts.push(
          "回复风格：工作助手。专业、有条理、可执行。",
          "优先要点列表、明确下一步，少空话。不要过度拟人。",
        );
        break;
      case "companion":
        parts.push(
          "回复风格：陪伴者。温暖、共情、口语化、像在聊天。",
          "语气可以亲切，但不要声称拥有真实情感或实体存在。",
        );
        break;
      default:
        parts.push(
          "回复风格：均衡助手。清晰、好用、自然，不过分生硬也不过分闲聊。",
          "不要过度拟人或宣称真实情感。",
        );
    }
    switch (answerLength) {
      case "concise":
        parts.push(
          "篇幅：尽量精简。先给结论，必要时用短列表。少铺垫。",
        );
        break;
      default:
        parts.push(
          "篇幅：给出完整、正常长度的回答；需要时补充细节、步骤与例子。",
          "不要为了短而省略关键步骤。优先把事情说清楚。",
          "若用户需要长文解释，请写完整，不要中途截断。",
        );
    }
    parts.push("跟随用户使用的语言。");
  }

  return parts.join(" ");
}

/**
 * Ollama generation options.
 * - num_ctx: user-selected context (4k / 8k / 16k)
 * - num_predict: max **new** tokens (thinking + answer share this budget).
 *
 * Thinking models (e.g. gemma with think=true) often spend hundreds–thousands
 * of tokens on reasoning first; if num_predict is too low, Ollama stops with
 * done_reason=length mid-answer (or with almost no visible content).
 */
export function genOptionsForChat(
  answerLength: AnswerLength = "normal",
  contextSize: ContextSize = 8192,
  showThinking = true,
): {
  num_ctx: number;
  num_predict: number;
  temperature: number;
} {
  const num_ctx = normalizeContextSize(contextSize);

  if (answerLength === "concise") {
    // Still leave room for a short think + short answer
    const base = Math.min(1536, Math.floor(num_ctx / 3));
    return {
      num_ctx,
      num_predict: showThinking ? Math.min(num_ctx - 256, base + 1024) : base,
      temperature: 0.6,
    };
  }

  // Normal: use nearly the whole context for generation (prompt is smaller).
  // Prefer high num_predict so long answers + thinking are not cut.
  // Ollama will clamp if prompt + predict > ctx.
  let num_predict: number;
  if (num_ctx >= 16384) {
    num_predict = showThinking ? 14000 : 12000;
  } else if (num_ctx >= 8192) {
    num_predict = showThinking ? 7000 : 5500;
  } else {
    // 4k: aggressive predict so think doesn't eat the whole budget
    num_predict = showThinking ? 3500 : 2800;
  }
  // Keep at least ~256 tokens for the prompt side of the window
  num_predict = Math.min(num_predict, Math.max(512, num_ctx - 256));

  return {
    num_ctx,
    num_predict,
    temperature: 0.7,
  };
}

/** How many recent messages to send, scaled by context window. */
export function hotTurnsForContext(contextSize: ContextSize = 8192): number {
  const n = normalizeContextSize(contextSize);
  if (n >= 16384) return 48;
  if (n >= 8192) return 28;
  return 16;
}

/** @deprecated use genOptionsForChat */
export function genOptionsForLength(answerLength: AnswerLength = "normal"): {
  num_ctx: number;
  num_predict: number;
  temperature: number;
} {
  return genOptionsForChat(answerLength, 8192, true);
}

export function formatContextLabel(size: ContextSize): string {
  if (size >= 16384) return "16K";
  if (size >= 8192) return "8K";
  return "4K";
}
