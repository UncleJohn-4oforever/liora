import { OLLAMA_BASE } from "../data/defaults";
import { ollamaFetch } from "./engine/ollamaFetch";
import { invokeTauri, isTauri } from "./engine/platform";
import type { Message } from "../types";

export type OllamaStatus = "unknown" | "online" | "offline";

export interface OllamaChatOptions {
  model: string;
  messages: { role: string; content: string }[];
  signal?: AbortSignal;
  /**
   * When true (default), ask Ollama for separated thinking and surface it as thinkingDelta.
   * Content is always the answer body (thinking tags stripped when embedded).
   */
  showThinking?: boolean;
  /** Generation knobs passed to Ollama `options`. */
  genOptions?: {
    num_ctx?: number;
    num_predict?: number;
    temperature?: number;
  };
}

/** Token usage from Ollama final stream chunk. */
export interface TokenUsage {
  /** Tokens in the prompt (history + system + user). */
  promptTokens: number;
  /** Tokens generated this turn (includes thinking when enabled). */
  completionTokens: number;
  /** prompt + completion — approximate context fill for this request. */
  totalTokens: number;
}

export interface StreamChunk {
  /** Visible assistant text delta (answer body). */
  contentDelta: string;
  /** Thinking / reasoning delta. */
  thinkingDelta: string;
  done: boolean;
  error?: string;
  /**
   * Ollama final done_reason when stream ends, e.g. "stop" | "length".
   * "length" means num_predict / context budget was hit (truncated).
   */
  doneReason?: string;
  /** Present on final chunk when Ollama reports eval stats. */
  usage?: TokenUsage;
}

type NdjsonPiece = {
  message?: {
    role?: string;
    content?: string;
    thinking?: string;
  };
  done?: boolean;
  done_reason?: string;
  error?: string;
  prompt_eval_count?: number;
  eval_count?: number;
};

export async function checkOllama(): Promise<{
  status: OllamaStatus;
  models: string[];
}> {
  try {
    const res = await ollamaFetch(`${OLLAMA_BASE}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return { status: "offline", models: [] };
    const data = (await res.json()) as {
      models?: { name: string }[];
    };
    const models = (data.models ?? []).map((m) => m.name);
    return { status: "online", models };
  } catch {
    return { status: "offline", models: [] };
  }
}

export function toOllamaMessages(
  history: Message[],
  systemPrompt?: string,
): { role: string; content: string }[] {
  const out: { role: string; content: string }[] = [];
  if (systemPrompt?.trim()) {
    out.push({ role: "system", content: systemPrompt.trim() });
  }
  for (const m of history) {
    if (m.role === "system") continue;
    if (!m.content.trim() && m.role === "assistant") continue;
    out.push({ role: m.role, content: m.content });
  }
  return out;
}

function makeChatBody(
  model: string,
  messages: { role: string; content: string }[],
  genOptions: OllamaChatOptions["genOptions"],
  includeThink: boolean,
  showThinking: boolean,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
    options: {
      num_ctx: genOptions?.num_ctx ?? 8192,
      num_predict: genOptions?.num_predict ?? 6144,
      temperature: genOptions?.temperature ?? 0.7,
    },
  };
  if (includeThink && showThinking) {
    body.think = true;
  }
  return body;
}

/**
 * Stream chat completion from local Ollama (/api/chat NDJSON).
 * Desktop uses Rust raw TCP (no system proxy). Browser uses fetch.
 */
export async function* streamOllamaChat(
  options: OllamaChatOptions,
): AsyncGenerator<StreamChunk> {
  const {
    model,
    messages,
    signal,
    showThinking = true,
    genOptions,
  } = options;

  if (isTauri()) {
    yield* streamOllamaChatRust({
      model,
      messages,
      signal,
      showThinking,
      genOptions,
    });
    return;
  }

  yield* streamOllamaChatHttp({
    model,
    messages,
    signal,
    showThinking,
    genOptions,
  });
}

/** Desktop path: Rust TCP stream + events — immune to Clash 502/403. */
async function* streamOllamaChatRust(
  options: OllamaChatOptions,
): AsyncGenerator<StreamChunk> {
  const {
    model,
    messages,
    signal,
    showThinking = true,
    genOptions,
  } = options;

  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const lineQueue: string[] = [];
  let streamError: string | null = null;
  let streamDone = false;
  let statusCode: number | null = null;

  type Ev = {
    requestId: string;
    line?: string | null;
    error?: string | null;
    status?: number | null;
    done: boolean;
  };

  let unlisten: (() => void) | null = null;
  try {
    const { listen } = await import("@tauri-apps/api/event");
    unlisten = await listen<Ev>("ollama-chat-line", (event) => {
      const p = event.payload;
      if (!p || p.requestId !== requestId) return;
      if (typeof p.status === "number") statusCode = p.status;
      if (p.error) streamError = p.error;
      if (p.line) lineQueue.push(p.line);
      if (p.done) streamDone = true;
    });
  } catch (e) {
    yield {
      contentDelta: "",
      thinkingDelta: "",
      done: true,
      error: `event_listen_failed: ${e instanceof Error ? e.message : String(e)}`,
    };
    return;
  }

  const onAbort = () => {
    void invokeTauri("ollama_chat_cancel", { requestId }).catch(() => {});
  };
  signal?.addEventListener("abort", onAbort);

  const bodies = [
    makeChatBody(model, messages, genOptions, true, showThinking),
    // fallback without think if first fails with think-related errors
  ];
  if (showThinking) {
    bodies.push(makeChatBody(model, messages, genOptions, false, showThinking));
  }

  let invokeError: string | null = null;
  let usedBody = bodies[0];

  const runInvoke = async (body: Record<string, unknown>) => {
    lineQueue.length = 0;
    streamError = null;
    streamDone = false;
    statusCode = null;
    usedBody = body;
    try {
      await invokeTauri("ollama_chat_stream", {
        requestId,
        body: JSON.stringify(body),
      });
    } catch (e) {
      invokeError = e instanceof Error ? e.message : String(e);
      streamDone = true;
    }
  };

  // Start first attempt (with think if enabled)
  const invokePromise = runInvoke(bodies[0]);

  const state = createParseState(showThinking);
  let finishedCleanly = false;

  try {
    // Wait for either lines or completion
    let attempts = 0;
    while (true) {
      if (signal?.aborted) {
        onAbort();
        yield { contentDelta: "", thinkingDelta: "", done: true, error: "aborted" };
        return;
      }

      while (lineQueue.length > 0) {
        const line = lineQueue.shift()!;
        const pieces = applyNdjsonLine(line, state);
        for (const p of pieces) {
          yield p;
          if (p.done && p.error) return;
          if (p.done) {
            finishedCleanly = true;
            // Drain any remaining queued lines first is unnecessary for Ollama
            // (done is last), but keep doneReason on the chunk.
            return;
          }
        }
      }

      if (streamDone && lineQueue.length === 0) {
        break;
      }
      await sleep(20);
      attempts++;
      if (attempts > 3_000_000) {
        // safety ~16h max wait; shouldn't hit
        break;
      }
    }

    await invokePromise;

    // If failed with think, retry once without think
    const errText = streamError || invokeError || "";
    const shouldRetryNoThink =
      showThinking &&
      usedBody === bodies[0] &&
      bodies.length > 1 &&
      !finishedCleanly &&
      !state.gotAny &&
      (/think/i.test(errText) ||
        /HTTP 400/.test(errText) ||
        /HTTP 422/.test(errText));

    if (shouldRetryNoThink && !signal?.aborted) {
      const retryPromise = runInvoke(bodies[1]);
      const state2 = createParseState(showThinking);
      while (true) {
        if (signal?.aborted) {
          onAbort();
          yield { contentDelta: "", thinkingDelta: "", done: true, error: "aborted" };
          return;
        }
        while (lineQueue.length > 0) {
          const line = lineQueue.shift()!;
          const pieces = applyNdjsonLine(line, state2);
          for (const p of pieces) {
            yield p;
            if (p.done && p.error) return;
            if (p.done) return;
          }
        }
        if (streamDone && lineQueue.length === 0) break;
        await sleep(20);
      }
      await retryPromise;
    }

    if (streamError && streamError !== "aborted") {
      yield {
        contentDelta: "",
        thinkingDelta: "",
        done: true,
        error: streamError,
      };
      return;
    }
    if (invokeError) {
      yield {
        contentDelta: "",
        thinkingDelta: "",
        done: true,
        error: invokeError,
      };
      return;
    }
    if (statusCode && statusCode !== 200 && !state.gotAny) {
      yield {
        contentDelta: "",
        thinkingDelta: "",
        done: true,
        error: formatHttpError(statusCode, streamError ?? ""),
      };
      return;
    }
    yield {
      contentDelta: "",
      thinkingDelta: "",
      done: true,
      doneReason: state.doneReason ?? undefined,
      usage: state.usage ?? undefined,
    };
  } finally {
    signal?.removeEventListener("abort", onAbort);
    unlisten?.();
    // Only force-cancel if user aborted; otherwise Rust is already finishing
    // and cancel can race with the last NDJSON lines on slow machines.
    if (signal?.aborted) {
      void invokeTauri("ollama_chat_cancel", { requestId }).catch(() => {});
    }
  }
}

/** Browser / fallback HTTP stream via ollamaFetch. */
async function* streamOllamaChatHttp(
  options: OllamaChatOptions,
): AsyncGenerator<StreamChunk> {
  const {
    model,
    messages,
    signal,
    showThinking = true,
    genOptions,
  } = options;

  const tryOnce = async (includeThink: boolean) => {
    return ollamaFetch(`${OLLAMA_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        makeChatBody(model, messages, genOptions, includeThink, showThinking),
      ),
      signal,
      connectTimeout: 60_000,
    } as RequestInit & { connectTimeout?: number });
  };

  let res: Response;
  try {
    res = await tryOnce(true);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (signal?.aborted) return;
    yield {
      contentDelta: "",
      thinkingDelta: "",
      done: true,
      error: msg.includes("abort")
        ? "aborted"
        : `Cannot reach local engine (${OLLAMA_BASE}). Use Start engine in Liora.`,
    };
    return;
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    if (
      showThinking &&
      (res.status === 400 || res.status === 422 || res.status === 502)
    ) {
      try {
        res = await tryOnce(false);
      } catch (e) {
        yield {
          contentDelta: "",
          thinkingDelta: "",
          done: true,
          error: e instanceof Error ? e.message : String(e),
        };
        return;
      }
      if (!res.ok) {
        const again = await res.text().catch(() => "");
        yield {
          contentDelta: "",
          thinkingDelta: "",
          done: true,
          error: formatHttpError(res.status, again),
        };
        return;
      }
    } else {
      yield {
        contentDelta: "",
        thinkingDelta: "",
        done: true,
        error: formatHttpError(res.status, errText),
      };
      return;
    }
  }

  if (!res.body) {
    yield {
      contentDelta: "",
      thinkingDelta: "",
      done: true,
      error: "Ollama returned empty body",
    };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const state = createParseState(showThinking);

  try {
    while (true) {
      if (signal?.aborted) break;
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const pieces = applyNdjsonLine(trimmed, state);
        for (const p of pieces) {
          yield p;
          if (p.done) return;
        }
      }
    }
    if (buffer.trim()) {
      const pieces = applyNdjsonLine(buffer.trim(), state);
      for (const p of pieces) {
        yield p;
        if (p.done) return;
      }
    }
    yield { contentDelta: "", thinkingDelta: "", done: true };
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}

type ParseState = {
  showThinking: boolean;
  rawContent: string;
  lastVisible: string;
  lastEmbeddedThinking: string;
  gotAny: boolean;
  doneReason: string | null;
  usage: TokenUsage | null;
};

function createParseState(showThinking: boolean): ParseState {
  return {
    showThinking,
    rawContent: "",
    lastVisible: "",
    lastEmbeddedThinking: "",
    gotAny: false,
    doneReason: null,
    usage: null,
  };
}

function readUsage(parsed: NdjsonPiece): TokenUsage | null {
  const prompt =
    typeof parsed.prompt_eval_count === "number" && parsed.prompt_eval_count >= 0
      ? parsed.prompt_eval_count
      : null;
  const completion =
    typeof parsed.eval_count === "number" && parsed.eval_count >= 0
      ? parsed.eval_count
      : null;
  if (prompt == null && completion == null) return null;
  const p = prompt ?? 0;
  const c = completion ?? 0;
  return {
    promptTokens: p,
    completionTokens: c,
    totalTokens: p + c,
  };
}

function applyNdjsonLine(line: string, state: ParseState): StreamChunk[] {
  const out: StreamChunk[] = [];
  let parsed: NdjsonPiece;
  try {
    parsed = JSON.parse(line) as NdjsonPiece;
  } catch {
    return out;
  }

  if (parsed.error) {
    out.push({
      contentDelta: "",
      thinkingDelta: "",
      done: true,
      error: parsed.error,
    });
    return out;
  }

  const thinkingPiece = parsed.message?.thinking ?? "";
  const contentPiece = parsed.message?.content ?? "";

  if (thinkingPiece && state.showThinking) {
    state.gotAny = true;
    out.push({
      contentDelta: "",
      thinkingDelta: thinkingPiece,
      done: false,
    });
  }

  if (contentPiece) {
    state.gotAny = true;
    state.rawContent += contentPiece;
    const { thinking: embedded, answer } = splitThinkingContent(state.rawContent);
    if (state.showThinking && embedded.length > state.lastEmbeddedThinking.length) {
      const tDelta = embedded.slice(state.lastEmbeddedThinking.length);
      state.lastEmbeddedThinking = embedded;
      if (tDelta) {
        out.push({
          contentDelta: "",
          thinkingDelta: tDelta,
          done: false,
        });
      }
    }
    const delta = answer.slice(state.lastVisible.length);
    state.lastVisible = answer;
    if (delta) {
      out.push({
        contentDelta: delta,
        thinkingDelta: "",
        done: false,
      });
    }
  }

  if (parsed.done) {
    if (parsed.done_reason) {
      state.doneReason = parsed.done_reason;
    }
    const usage = readUsage(parsed);
    if (usage) state.usage = usage;
    out.push({
      contentDelta: "",
      thinkingDelta: "",
      done: true,
      doneReason: state.doneReason ?? parsed.done_reason ?? undefined,
      usage: state.usage ?? undefined,
    });
  } else {
    // Some builds only put counts on the last chunk; keep last non-zero if any
    const usage = readUsage(parsed);
    if (usage && (usage.promptTokens > 0 || usage.completionTokens > 0)) {
      state.usage = usage;
    }
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Split answer body vs thinking from models that embed traces in content.
 */
export function splitThinkingContent(text: string): {
  thinking: string;
  answer: string;
} {
  const thinkingParts: string[] = [];
  let s = text;

  const collect = (re: RegExp) => {
    s = s.replace(re, (_m, inner: string) => {
      if (inner?.trim()) thinkingParts.push(inner.trim());
      return "";
    });
  };

  collect(/<think>([\s\S]*?)<\/think>/gi);
  collect(/<thinking>([\s\S]*?)<\/thinking>/gi);

  s = s.replace(
    /Thinking\.\.\.([\s\S]*?)(?:\.\.\.done thinking\.|done thinking\.)/gi,
    (_m, inner: string) => {
      if (inner?.trim()) thinkingParts.push(inner.trim());
      return "";
    },
  );
  s = s.replace(
    /Thinking Process:([\s\S]*?)(?:\.\.\.done thinking\.|done thinking\.)/gi,
    (_m, inner: string) => {
      if (inner?.trim()) thinkingParts.push(inner.trim());
      return "";
    },
  );

  const openTag = s.search(/<think>|<thinking>/i);
  if (openTag >= 0) {
    const rest = s.slice(openTag);
    const m = rest.match(/^<(?:think|thinking)>([\s\S]*)$/i);
    if (m) {
      thinkingParts.push(m[1]);
      s = s.slice(0, openTag);
    }
  } else {
    const thinkStart = s.search(/Thinking\.\.\.|Thinking Process:/i);
    if (thinkStart >= 0) {
      const after = s.slice(thinkStart);
      if (!/done thinking\./i.test(after)) {
        thinkingParts.push(
          after.replace(/^Thinking(?:\.\.\.| Process:)\s*/i, ""),
        );
        s = s.slice(0, thinkStart);
      }
    }
  }

  return {
    thinking: thinkingParts.join("\n\n").trim(),
    answer: s.replace(/^\s+/, ""),
  };
}

/** @deprecated use splitThinkingContent */
export function stripThinkingBlocks(text: string): string {
  return splitThinkingContent(text).answer;
}

function formatHttpError(status: number, body: string): string {
  const snippet = (body || "").trim().slice(0, 240);
  if (status === 502 || status === 503 || status === 403) {
    return (
      `Ollama HTTP ${status}${snippet ? `: ${snippet}` : ""}。` +
      `本地引擎请求已改为直连；若仍失败请确认 Ollama 运行中，或暂时关闭系统代理后重试。`
    );
  }
  return `Ollama HTTP ${status}${snippet ? `: ${snippet}` : ""}`;
}

function normalizeModelKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/:latest$/i, "")
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Map a preferred model id to an installed Ollama name.
 * Falls back to fuzzy match, then first installed model (never invent names).
 */
export function resolveModelName(
  preferred: string,
  available: string[],
): string {
  const pref = (preferred ?? "").trim();
  if (available.length === 0) return pref;

  if (pref) {
    const exact = available.find((m) => m === pref);
    if (exact) return exact;
    const tagged = available.find(
      (m) => m === `${pref}:latest` || m.startsWith(`${pref}:`),
    );
    if (tagged) return tagged;
    // strip :tag from preferred
    const base = pref.replace(/:.*$/, "");
    const byBase = available.find(
      (m) => m === base || m.startsWith(`${base}:`) || m.replace(/:.*$/, "") === base,
    );
    if (byBase) return byBase;

    const key = normalizeModelKey(pref);
    if (key.length >= 4) {
      const fuzzy = available.find((m) => {
        const mk = normalizeModelKey(m);
        return mk === key || mk.includes(key) || key.includes(mk);
      });
      if (fuzzy) return fuzzy;
    }
  }

  // Stale session / default pointing at deleted GGUF name → use first installed
  return available[0]!;
}

/** True if preferred resolves to something Ollama actually lists. */
export function isModelAvailable(
  preferred: string,
  available: string[],
): boolean {
  if (available.length === 0) return false;
  const resolved = resolveModelName(preferred, available);
  return available.some(
    (m) => m === resolved || m.startsWith(`${resolved}:`) || resolved.startsWith(m),
  );
}
