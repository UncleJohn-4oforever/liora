import type {
  CharacterCommand,
  CharacterRuntime,
  CharacterRuntimeHost,
} from "./types";

/** Deterministic adapter for UI/TTS integration before Cubism SDK is installed. */
export class MockCharacterRuntime implements CharacterRuntime {
  loadedPackageUrl = "";
  lastCommand: CharacterCommand = {};
  size = { width: 0, height: 0, pixelRatio: 1 };
  disposed = false;

  async load(host: CharacterRuntimeHost): Promise<void> {
    this.loadedPackageUrl = host.packageUrl;
    this.disposed = false;
  }

  command(command: CharacterCommand): void {
    this.lastCommand = structuredClone(command);
  }

  resize(width: number, height: number, pixelRatio: number): void {
    this.size = { width, height, pixelRatio };
  }

  dispose(): void {
    this.disposed = true;
  }
}

