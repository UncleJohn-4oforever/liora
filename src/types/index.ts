export type Locale = "zh" | "en";

export type MessageRole = "user" | "assistant" | "system";

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  /** Reasoning / thinking trace (optional, thinking models). */
  thinking?: string;
  createdAt: number;
}

/** How the assistant should sound. */
export type ReplyStyle = "balanced" | "work" | "companion";

/** Target answer length (drives system prompt + num_predict). */
export type AnswerLength = "concise" | "normal";

/** Ollama context window (tokens). Recommended: 4k / 8k / 16k. */
export type ContextSize = 4096 | 8192 | 16384;

export interface Session {
  id: string;
  title: string;
  characterId: string;
  modelId: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}

export interface CharacterCard {
  id: string;
  name: string;
  nameEn: string;
  tagline: string;
  taglineEn: string;
  description: string;
  descriptionEn: string;
  /** CSS gradient placeholder until real art */
  accent: string;
}

export interface ModelInfo {
  id: string;
  label: string;
  source: "ollama" | "mock";
}

export interface AppSettings {
  locale: Locale;
  defaultModelId: string;
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
   * Reply persona: balanced | work assistant | companion.
   * Default balanced.
   */
  replyStyle?: ReplyStyle;
  /**
   * Answer length preference. Default normal (previous default felt too short).
   */
  answerLength?: AnswerLength;
  /**
   * Model context window in tokens (num_ctx). Default 8192.
   * Larger = longer memory of the chat + room for long answers; uses more VRAM.
   */
  contextSize?: ContextSize;
}
