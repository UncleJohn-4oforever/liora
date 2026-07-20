import { describe, expect, it } from "vitest";
import type { MemoryItem } from "../../types/memory";
import {
  characterMemoriesForMetaIndex,
  memoriesForInjection,
  memoryDedupeKey,
  writeTargetForCharacter,
} from "./scope";

function memory(
  id: string,
  scope: "master" | "character" | "orphan",
  characterId?: string,
): MemoryItem {
  return {
    id,
    layer: "L3",
    type: "fact",
    subject: "user",
    predicate: "name",
    object: id,
    confidence: 1,
    specificity: 1,
    source: "user",
    status: "active",
    scope,
    characterId,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("memory scope isolation", () => {
  const master = memory("master", "master");
  const alice = memory("alice", "character", "alice");
  const bob = memory("bob", "character", "bob");
  const orphan = memory("orphan", "orphan");
  const deleted = { ...memory("deleted", "character", "alice"), status: "deleted" as const };

  it("gives Meta master and unclaimed memories by default", () => {
    expect(
      memoriesForInjection([master, alice, bob, orphan], {
        isMeta: true,
        characterId: "meta",
      }),
    ).toEqual([master, orphan]);
  });

  it("never leaks one persona's memories into another", () => {
    expect(
      memoriesForInjection([master, alice, bob, deleted], {
        isMeta: false,
        characterId: "alice",
      }),
    ).toEqual([master, alice]);
  });

  it("lets Meta index every owned persona memory", () => {
    expect(characterMemoriesForMetaIndex([alice, bob])).toEqual([alice, bob]);
  });

  it("includes ownership in dedupe keys", () => {
    expect(memoryDedupeKey(alice)).not.toBe(memoryDedupeKey(bob));
  });

  it("routes persona writes to that persona", () => {
    expect(
      writeTargetForCharacter({
        id: "alice",
        name: "Alice",
        nameEn: "Alice",
        tagline: "",
        taglineEn: "",
        description: "",
        descriptionEn: "",
        accent: "",
        kind: "persona",
      }),
    ).toEqual({ scope: "character", characterId: "alice" });
  });
});
