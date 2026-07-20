export type Locale = "zh" | "en";

export type MessageRole = "user" | "assistant" | "system";

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  /** Reasoning / thinking trace (optional, thinking models). */
  thinking?: string;
  createdAt: number;
  /**
   * For assistant turns: which character produced this reply (session character at send time).
   * Snapshot so history stays correct after switching / deleting cards.
   */
  characterId?: string;
  /** Display name snapshot (locale at send time). */
  characterName?: string;
}

/** Target answer length (drives system prompt + num_predict). */
export type AnswerLength = "concise" | "normal";

/** Ollama context window (tokens). Recommended: 4k / 8k / 16k. */
export type ContextSize = 4096 | 8192 | 16384;

export interface Session {
  id: string;
  title: string;
  characterId: string;
  modelId: string;
  /** Parent chat folder; omit / empty = unfiled (root list). */
  folderId?: string | null;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}

/** User-created grouping for sessions in the left rail. */
export interface ChatFolder {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** UI: collapsed in session list */
  collapsed?: boolean;
}

export interface CharacterCard {
  id: string;
  name: string;
  nameEn: string;
  tagline: string;
  taglineEn: string;
  /** Short blurb shown on the card */
  description: string;
  descriptionEn: string;
  /**
   * Optional full persona / system instructions injected into chat.
   * Falls back to description when empty.
   */
  systemPrompt?: string;
  /** CSS gradient placeholder until real art */
  accent: string;
  /**
   * Portrait image (local data URL, app asset, or file URL later).
   * Displayed in fixed 3:4 frame with object-fit: cover.
   * Spec: 768×1024 preferred — docs/CHARACTER_VISUAL.md
   */
  avatarUrl?: string;
  /**
   * Optional root URL for a Liora Live2D character package. The static portrait
   * remains the fallback until a compatible runtime adapter is registered.
   */
  live2dPackageUrl?: string;
  /** Builtin cards cannot be deleted */
  isBuiltin?: boolean;
  /**
   * meta = 本机 AI / master memory steward
   * persona = playable character (private memory)
   */
  kind?: "meta" | "persona";
  source?: "builtin" | "user" | "import";
  createdAt?: number;
  updatedAt?: number;
}

export interface ModelInfo {
  id: string;
  label: string;
  source: "ollama" | "mock";
}

export interface AppSettings {
  locale: Locale;
  defaultModelId: string;
  /** Used for new sessions only (per-session switch does not change this). */
  defaultCharacterId?: string;
  memoryEnabled: boolean;
  /**
   * Auto memory: run extract after this many new messages (2–30).
   * Default 6.
   */
  summaryEveryN?: number;
  /**
   * Show model thinking / reasoning (Ollama `think` + embedded tags).
   * Default true.
   */
  showThinking?: boolean;
  /**
   * Answer length preference. Default normal (previous default felt too short).
   * Tone / persona is owned by the session character card, not a global style chip.
   */
  answerLength?: AnswerLength;
  /**
   * Model context window in tokens (num_ctx). Default 8192.
   * Larger = longer memory of the chat + room for long answers; uses more VRAM.
   */
  contextSize?: ContextSize;
  /**
   * First-run onboarding completed (engine → model → data folder).
   * Default false / undefined until user finishes or skips.
   */
  onboardingDone?: boolean;
  /** Chat folders for the left session rail */
  chatFolders?: ChatFolder[];
}
