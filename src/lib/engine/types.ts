/** Local model engine (Ollama) lifecycle for Liora UI. */

export type EnginePhase =
  | "checking"
  | "starting"
  | "online"
  | "offline"
  | "not_installed"
  | "error";

export interface EngineSnapshot {
  phase: EnginePhase;
  /** Human message for banner */
  message: string;
  models: string[];
  /**
   * Models Ollama reports with `capabilities` including `vision`.
   * Empty = none installed (or probe too old); do not send images[] to text-only models.
   */
  visionModels?: string[];
  /** Absolute path to ollama.exe if found */
  installPath: string | null;
  version: string | null;
  lastError: string | null;
  /** Running inside Tauri desktop shell */
  isDesktop: boolean;
  updatedAt: number;
}

export interface OllamaDetectResult {
  installed: boolean;
  path: string | null;
  version: string | null;
}
