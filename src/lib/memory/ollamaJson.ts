import { OLLAMA_BASE } from "../../data/defaults";
import { OLLAMA_KEEP_ALIVE } from "../engine/activity";
import { ollamaFetch } from "../engine/ollamaFetch";

/** Non-streaming chat; returns assistant text (thinking stripped lightly). */
export async function ollamaComplete(options: {
  model: string;
  system?: string;
  prompt: string;
  numPredict?: number;
  /** Must match chat num_ctx or Ollama reallocates KV cache (feels like reload). */
  numCtx?: number;
  signal?: AbortSignal;
}): Promise<string> {
  const messages: { role: string; content: string }[] = [];
  if (options.system) messages.push({ role: "system", content: options.system });
  messages.push({ role: "user", content: options.prompt });

  const res = await ollamaFetch(`${OLLAMA_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: options.model,
      messages,
      stream: false,
      think: false,
      keep_alive: OLLAMA_KEEP_ALIVE,
      options: {
        // Same default as main chat (8K) — mismatched num_ctx thrashs VRAM
        num_ctx: options.numCtx ?? 8192,
        num_predict: options.numPredict ?? 800,
        temperature: 0.2,
      },
    }),
    signal: options.signal,
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Ollama ${res.status}: ${t.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    message?: { content?: string; thinking?: string };
  };
  let text = data.message?.content ?? "";
  text = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/Thinking\.\.\.[\s\S]*?done thinking\./gi, "")
    .trim();
  return text;
}

/** Extract first JSON object/array from model output. */
export function parseJsonLoose<T>(text: string): T | null {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    /* fall through */
  }

  const objStart = cleaned.indexOf("{");
  const arrStart = cleaned.indexOf("[");
  let start = -1;
  if (objStart >= 0 && (arrStart < 0 || objStart < arrStart)) start = objStart;
  else if (arrStart >= 0) start = arrStart;
  if (start < 0) return null;

  const open = cleaned[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === open) depth++;
    if (cleaned[i] === close) depth--;
    if (depth === 0) {
      try {
        return JSON.parse(cleaned.slice(start, i + 1)) as T;
      } catch {
        return null;
      }
    }
  }
  return null;
}
