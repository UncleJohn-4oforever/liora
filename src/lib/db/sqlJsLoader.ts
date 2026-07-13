/**
 * Load sql.js in a Vite-friendly way.
 * Dynamic import() of sql.js often yields {} in the browser; static import is more reliable.
 */
import type { SqlJsStatic } from "sql.js";
// Static default import — Vite prebundles CJS correctly more often than dynamic import.
import initSqlJsModule from "sql.js";
// Browser build looks for sql-wasm-browser.wasm when using browser entry;
// package root often resolves to browser condition — ship both URLs.
import wasmBrowserUrl from "sql.js/dist/sql-wasm-browser.wasm?url";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";

function resolveInit(mod: unknown): (cfg?: object) => Promise<SqlJsStatic> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = mod as any;
  const list = [
    m,
    m?.default,
    m?.default?.default,
    m?.initSqlJs,
    m?.default?.initSqlJs,
  ];
  for (const c of list) {
    if (typeof c === "function") {
      return c as (cfg?: object) => Promise<SqlJsStatic>;
    }
  }
  const keys =
    m && typeof m === "object" ? Object.keys(m as object).join(",") : String(m);
  throw new Error(`initSqlJs is not a function (module keys: ${keys})`);
}

let cached: Promise<SqlJsStatic> | null = null;

export function loadSqlJs(): Promise<SqlJsStatic> {
  if (!cached) {
    cached = (async () => {
      const initSqlJs = resolveInit(initSqlJsModule);
      // Prefer browser wasm; fall back to generic name via locateFile
      const SQL = await initSqlJs({
        locateFile: (file: string) => {
          if (file.includes("browser")) return wasmBrowserUrl;
          if (file.endsWith(".wasm")) {
            // sql-wasm-browser.js requests sql-wasm-browser.wasm
            if (file.includes("browser")) return wasmBrowserUrl;
            return file.includes("browser") ? wasmBrowserUrl : wasmUrl;
          }
          // default
          return wasmBrowserUrl;
        },
      });
      return SQL;
    })().catch((e) => {
      cached = null;
      throw e;
    });
  }
  return cached;
}
