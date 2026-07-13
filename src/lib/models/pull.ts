import { invokeTauri, isTauri } from "../engine/platform";

export interface PullProgress {
  status: string;
  /** 0–100 when total known */
  percent: number | null;
  completed: number | null;
  total: number | null;
  raw?: string;
}

export interface PullResult {
  ok: boolean;
  error?: string;
}

type PullEvent = {
  requestId: string;
  line?: string | null;
  error?: string | null;
  status?: number | null;
  done: boolean;
};

/**
 * Pull a model via Rust raw TCP (desktop) or Ollama HTTP (browser fallback).
 * Calls onProgress for each status update.
 */
export async function pullModel(
  model: string,
  options?: {
    signal?: AbortSignal;
    onProgress?: (p: PullProgress) => void;
  },
): Promise<PullResult> {
  const name = model.trim();
  if (!name) return { ok: false, error: "empty_model" };

  if (isTauri()) {
    return pullModelRust(name, options);
  }
  return pullModelHttp(name, options);
}

async function pullModelRust(
  model: string,
  options?: {
    signal?: AbortSignal;
    onProgress?: (p: PullProgress) => void;
  },
): Promise<PullResult> {
  const requestId = `pull_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const lineQueue: string[] = [];
  let streamError: string | null = null;
  let streamDone = false;

  let unlisten: (() => void) | null = null;
  try {
    const { listen } = await import("@tauri-apps/api/event");
    unlisten = await listen<PullEvent>("ollama-pull-line", (ev) => {
      const p = ev.payload;
      if (!p || p.requestId !== requestId) return;
      if (p.error) streamError = p.error;
      if (p.line) lineQueue.push(p.line);
      if (p.done) streamDone = true;
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const onAbort = () => {
    void invokeTauri("ollama_pull_cancel", { requestId }).catch(() => {});
  };
  options?.signal?.addEventListener("abort", onAbort);

  const invokeP = invokeTauri("ollama_pull_stream", {
    requestId,
    model,
  }).catch((e) => {
    streamError = e instanceof Error ? e.message : String(e);
    streamDone = true;
  });

  let lastSuccess = false;
  try {
    while (true) {
      if (options?.signal?.aborted) {
        onAbort();
        return { ok: false, error: "aborted" };
      }
      while (lineQueue.length) {
        const line = lineQueue.shift()!;
        const prog = parsePullLine(line);
        if (prog) {
          options?.onProgress?.(prog);
          if (/success/i.test(prog.status)) lastSuccess = true;
        }
      }
      if (streamDone && lineQueue.length === 0) break;
      await new Promise((r) => setTimeout(r, 40));
    }
    await invokeP;

    if (options?.signal?.aborted || streamError === "aborted") {
      return { ok: false, error: "aborted" };
    }
    if (streamError) {
      return { ok: false, error: streamError };
    }
    return { ok: lastSuccess || !streamError };
  } finally {
    options?.signal?.removeEventListener("abort", onAbort);
    unlisten?.();
    void invokeTauri("ollama_pull_cancel", { requestId }).catch(() => {});
  }
}

async function pullModelHttp(
  model: string,
  options?: {
    signal?: AbortSignal;
    onProgress?: (p: PullProgress) => void;
  },
): Promise<PullResult> {
  try {
    const res = await fetch("http://127.0.0.1:11434/api/pull", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, stream: true }),
      signal: options?.signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${t.slice(0, 200)}` };
    }
    if (!res.body) return { ok: false, error: "empty_body" };
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let lastSuccess = false;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const prog = parsePullLine(line.trim());
        if (prog) {
          options?.onProgress?.(prog);
          if (/success/i.test(prog.status)) lastSuccess = true;
        }
      }
    }
    return { ok: lastSuccess };
  } catch (e) {
    if (options?.signal?.aborted) return { ok: false, error: "aborted" };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function parsePullLine(line: string): PullProgress | null {
  if (!line) return null;
  try {
    const j = JSON.parse(line) as {
      status?: string;
      error?: string;
      completed?: number;
      total?: number;
    };
    if (j.error) {
      return {
        status: j.error,
        percent: null,
        completed: null,
        total: null,
        raw: line,
      };
    }
    const completed = typeof j.completed === "number" ? j.completed : null;
    const total = typeof j.total === "number" && j.total > 0 ? j.total : null;
    let percent: number | null = null;
    if (completed != null && total != null && total > 0) {
      percent = Math.min(100, Math.round((completed / total) * 100));
    }
    return {
      status: j.status ?? "…",
      percent,
      completed,
      total,
      raw: line,
    };
  } catch {
    return null;
  }
}

export async function fetchSystemRamGb(): Promise<number | null> {
  if (!isTauri()) return null;
  try {
    const n = await invokeTauri<number | null>("system_ram_gb");
    return typeof n === "number" && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
