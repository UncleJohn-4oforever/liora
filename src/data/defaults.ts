import type { CharacterCard, ModelInfo } from "../types";

/** Default character pack (static card for S0). */
export const DEFAULT_CHARACTER: CharacterCard = {
  id: "char_default_assistant",
  name: "Liora",
  nameEn: "Liora",
  tagline: "本地助手 · 记得住重点",
  taglineEn: "Local assistant · keeps what matters",
  description:
    "默认助手角色。语气清晰、克制，不夸张拟人。记忆与风格策略将在后续版本按角色分离。",
  descriptionEn:
    "Default assistant. Clear and restrained tone. Memory and style policies will be per-character later.",
  accent: "linear-gradient(145deg, #3d5a80 0%, #98c1d9 45%, #e0fbfc 100%)",
};

export const DEFAULT_MODEL: ModelInfo = {
  id: "gemma4-e4b-hauhau",
  label: "gemma4-e4b-hauhau",
  source: "ollama",
};

export const OLLAMA_BASE = "http://127.0.0.1:11434";
