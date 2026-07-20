/** Composer-only pending image — never written into Message history. */
export type PendingChatImage = {
  id: string;
  /** data URL for thumbnail in composer */
  previewUrl: string;
  /** base64 JPEG for Ollama vision */
  base64: string;
  name?: string;
};
