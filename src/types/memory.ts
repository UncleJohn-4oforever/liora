/** Memory layers used in Liora MVP (subset of full L0–L6 design). */

export type MemoryLayer = "L2" | "L3" | "L4" | "L5";

export type MemoryType =
  | "fact"
  | "preference"
  | "procedure"
  | "event"
  | "boundary"
  | "episode";

export interface MemoryItem {
  id: string;
  layer: MemoryLayer;
  type: MemoryType;
  /** e.g. user | pet:dou_dou | project:orion */
  subject: string;
  predicate: string;
  /** Human-readable, specific object text */
  object: string;
  qualifiers?: Record<string, string>;
  confidence: number;
  specificity: number;
  source: "extract" | "user" | "summary";
  status: "active" | "deleted" | "superseded";
  sessionId?: string;
  evidence?: string;
  createdAt: number;
  updatedAt: number;
}

export interface EpisodeSummary {
  id: string;
  sessionId: string;
  level: "micro" | "meso";
  fromMsg: number;
  toMsg: number;
  topic: string;
  whatHappened: string[];
  decisions: string[];
  openLoops: string[];
  entities: string[];
  rawText: string;
  createdAt: number;
}

/** Cold detail chunk for retrieval (simple local "vector"). */
export interface TextChunk {
  id: string;
  sessionId: string;
  text: string;
  /** bag-of-words style sparse features: token -> weight */
  terms: Record<string, number>;
  messageFrom: number;
  messageTo: number;
  createdAt: number;
}

export interface SessionMemoryCursor {
  sessionId: string;
  /** Next message index to include in micro-summary window */
  nextSummaryFrom: number;
  updatedAt: number;
}

export interface MemoryStoreData {
  version: 1;
  memories: MemoryItem[];
  episodes: EpisodeSummary[];
  chunks: TextChunk[];
  cursors: SessionMemoryCursor[];
  /** Recent toast events for UI */
  recentUpdates: { id: string; label: string; at: number }[];
}
