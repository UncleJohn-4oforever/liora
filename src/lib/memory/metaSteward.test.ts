import { describe, expect, it } from "vitest";
import { DEFAULT_CHARACTER } from "../../data/defaults";
import type { CharacterCard } from "../../types";
import type { MemoryItem, MemoryStoreData } from "../../types/memory";
import { buildMemorySystemBlock } from "./assemble";

const alice: CharacterCard = {
  id: "alice",
  name: "艾琳",
  nameEn: "Alice",
  tagline: "",
  taglineEn: "",
  description: "",
  descriptionEn: "",
  accent: "",
  kind: "persona",
};

function personaMemory(
  id: string,
  object: string,
): MemoryItem {
  return {
    id,
    layer: "L3",
    type: "fact",
    subject: "project:dragon",
    predicate: "discussed",
    object,
    confidence: 0.9,
    specificity: 0.9,
    source: "user",
    status: "active",
    scope: "character",
    characterId: "alice",
    createdAt: 1,
    updatedAt: 2,
  };
}

function store(memories: MemoryItem[]): MemoryStoreData {
  return {
    version: 1,
    memories,
    episodes: [],
    chunks: [],
    cursors: [],
    recentUpdates: [],
    scopeMigrated: true,
    scopeVersion: 2,
  };
}

describe("Meta memory steward prompt", () => {
  it("knows the persona catalog without injecting private detail by default", () => {
    const block = buildMemorySystemBlock(
      store([personaMemory("p1", "The hidden dragon ending")]),
      "meta-session",
      "",
      "en",
      DEFAULT_CHARACTER,
      [DEFAULT_CHARACTER, alice],
    );
    expect(block).toContain("Persona memory catalog");
    expect(block).toContain("艾琳: 1 memories");
    expect(block).not.toContain("The hidden dragon ending");
  });

  it("retrieves relevant persona detail on demand", () => {
    const block = buildMemorySystemBlock(
      store([personaMemory("p1", "The hidden dragon ending")]),
      "meta-session",
      "What did we decide about the dragon project?",
      "en",
      DEFAULT_CHARACTER,
      [DEFAULT_CHARACTER, alice],
    );
    expect(block).toContain("The hidden dragon ending");
    expect(block).toContain("[alice]");
  });

});
