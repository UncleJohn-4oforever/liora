import type { Session } from "../../types";
import { kvGetJson, kvSetJson } from "./kv";

const KEY = "sessions" as const;

export async function loadAllSessions(): Promise<Session[]> {
  const data = await kvGetJson<Session[]>(KEY);
  return Array.isArray(data) ? data : [];
}

export async function replaceAllSessions(sessions: Session[]): Promise<void> {
  await kvSetJson(KEY, sessions);
}

export async function countSessions(): Promise<number> {
  const list = await loadAllSessions();
  return list.length;
}
