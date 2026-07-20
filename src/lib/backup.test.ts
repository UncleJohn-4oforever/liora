import { describe, expect, it } from "vitest";
import type { AppSettings, Session } from "../types";
import type { MemoryStoreData } from "../types/memory";
import { applyBackup, buildBackup, parseBackupJson } from "./backup";

const settings: AppSettings = {
  locale: "en",
  defaultModelId: "test",
  memoryEnabled: true,
  showThinking: false,
};

const memory: MemoryStoreData = {
  version: 1,
  memories: [],
  episodes: [],
  chunks: [],
  cursors: [],
  recentUpdates: [{ id: "same", label: "saved", at: 10 }],
  scopeMigrated: true,
  scopeVersion: 2,
};

function session(updatedAt: number, title: string): Session {
  return {
    id: "session-1",
    title,
    characterId: "character-1",
    modelId: "test",
    createdAt: 1,
    updatedAt,
    messages: [],
  };
}

describe("backup import", () => {
  it("rejects unrelated JSON", () => {
    expect(() => parseBackupJson('{"format":"other"}')).toThrow(
      "Unknown format",
    );
  });

  it("keeps the newest session during merge", () => {
    const backup = buildBackup({
      settings,
      sessions: [session(20, "incoming")],
      memory,
    });
    const result = applyBackup(
      {
        settings,
        sessions: [session(10, "local")],
        memory,
      },
      backup,
      "merge",
    );
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].title).toBe("incoming");
  });

  it("is idempotent when the same backup is merged repeatedly", () => {
    const backup = buildBackup({ settings, sessions: [], memory });
    const current = { settings, sessions: [], memory, characters: [] };
    const once = applyBackup(current, backup, "merge");
    const twice = applyBackup(once, backup, "merge");

    expect(twice.memory.recentUpdates).toEqual(once.memory.recentUpdates);
    expect(twice.memory.scopeMigrated).toBe(true);
  });
});
