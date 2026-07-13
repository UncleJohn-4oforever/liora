import { invokeTauri, isTauri } from "./platform";

/**
 * HTTP to Ollama.
 *
 * Desktop: always use Rust raw TCP (`ollama_http`) so system proxies
 * (Clash / V2Ray) cannot intercept 127.0.0.1 and return 502/403.
 * Streaming chat uses a separate event-based command in ollama.ts.
 */
export async function ollamaFetch(
  input: string,
  init?: RequestInit & { connectTimeout?: number },
): Promise<Response> {
  if (isTauri()) {
    try {
      return await rustOllamaFetch(input, init);
    } catch (e) {
      console.warn("rust ollama_http failed, fallback window.fetch", e);
    }
  }
  return fetch(input, init);
}

async function rustOllamaFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const url = new URL(input, "http://127.0.0.1:11434");
  const path = url.pathname + url.search;
  const method = (init?.method ?? "GET").toUpperCase();
  let body: string | null = null;
  if (init?.body != null) {
    body = typeof init.body === "string" ? init.body : String(init.body);
  }

  const r = await invokeTauri<{ status: number; body: string }>("ollama_http", {
    method,
    path,
    body,
  });

  return new Response(r.body ?? "", {
    status: r.status || 502,
    headers: { "Content-Type": "application/json" },
  });
}
