import type { CharacterRuntimeFactory } from "./types";

let runtimeFactory: CharacterRuntimeFactory | null = null;

export function registerCharacterRuntime(factory: CharacterRuntimeFactory): () => void {
  runtimeFactory = factory;
  return () => {
    if (runtimeFactory === factory) runtimeFactory = null;
  };
}

export function createCharacterRuntime() {
  return runtimeFactory?.() ?? null;
}

