import type { Database, SqlJsStatic } from "sql.js";
import { SCHEMA_SQL } from "./schema";
import { loadSqlJs } from "./sqlJsLoader";

const IDB_NAME = "liora-db";
const IDB_STORE = "sqlite";
const IDB_KEY = "main";

let SQL: SqlJsStatic | null = null;
let db: Database | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let readyPromise: Promise<Database> | null = null;

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const idb = req.result;
      if (!idb.objectStoreNames.contains(IDB_STORE)) {
        idb.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("idb open failed"));
  });
}

async function idbGet(): Promise<Uint8Array | null> {
  const idb = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, "readonly");
    const store = tx.objectStore(IDB_STORE);
    const req = store.get(IDB_KEY);
    req.onsuccess = () => {
      const v = req.result as ArrayBuffer | Uint8Array | undefined;
      if (!v) resolve(null);
      else if (v instanceof Uint8Array) resolve(v);
      else resolve(new Uint8Array(v));
    };
    req.onerror = () => reject(req.error ?? new Error("idb get failed"));
  });
}

async function idbSet(data: Uint8Array): Promise<void> {
  const idb = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    const copy = data.slice();
    const req = store.put(copy, IDB_KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("idb put failed"));
  });
}

export async function getDb(): Promise<Database> {
  if (db) return db;
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    if (!SQL) {
      SQL = await loadSqlJs();
    }
    let existing: Uint8Array | null = null;
    try {
      existing = await idbGet();
    } catch {
      existing = null;
    }
    db = existing ? new SQL.Database(existing) : new SQL.Database();
    db.run(SCHEMA_SQL);
    db.run(
      `INSERT OR IGNORE INTO meta(key, value) VALUES ('schema_version', '1')`,
    );
    return db;
  })();

  try {
    return await readyPromise;
  } catch (e) {
    readyPromise = null;
    db = null;
    throw e;
  }
}

export function schedulePersist(delayMs = 250): void {
  if (!db) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void flushPersist();
  }, delayMs);
}

export async function flushPersist(): Promise<void> {
  if (!db) return;
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  try {
    const data = db.export();
    await idbSet(data);
  } catch {
    /* ignore */
  }
}

export function run(
  database: Database,
  sql: string,
  params: (string | number | null)[] = [],
): void {
  database.run(sql, params);
  schedulePersist();
}

export function all<T extends Record<string, unknown>>(
  database: Database,
  sql: string,
  params: (string | number | null)[] = [],
): T[] {
  const stmt = database.prepare(sql);
  stmt.bind(params);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return rows;
}

export function getOne<T extends Record<string, unknown>>(
  database: Database,
  sql: string,
  params: (string | number | null)[] = [],
): T | null {
  const rows = all<T>(database, sql, params);
  return rows[0] ?? null;
}
