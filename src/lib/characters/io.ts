import type { CharacterCard } from "../../types";
import { createCharacterDraft, ensureBuiltin, upsertCharacter } from "./repo";

export const CHARACTER_PACK_FORMAT = "liora-character" as const;
export const CHARACTER_PACK_VERSION = 1 as const;

export interface CharacterPack {
  format: typeof CHARACTER_PACK_FORMAT;
  version: typeof CHARACTER_PACK_VERSION;
  exportedAt: number;
  characters: CharacterCard[];
}

export function buildCharacterPack(cards: CharacterCard[]): CharacterPack {
  return {
    format: CHARACTER_PACK_FORMAT,
    version: CHARACTER_PACK_VERSION,
    exportedAt: Date.now(),
    characters: cards.map((c) => ({ ...c })),
  };
}

export function downloadCharacterPack(
  cards: CharacterCard[],
  filename?: string,
): void {
  const pack = buildCharacterPack(cards);
  const name =
    filename ??
    (cards.length === 1
      ? `liora-character-${sanitizeFilePart(cards[0]!.name)}.json`
      : `liora-characters-${new Date().toISOString().slice(0, 10)}.json`);
  const blob = new Blob([JSON.stringify(pack, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function sanitizeFilePart(s: string): string {
  return (
    s
      .trim()
      .replace(/[^\w\u4e00-\u9fff.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "character"
  );
}

/** Parse pack or bare CharacterCard / CharacterCard[]. */
export function parseCharacterPackJson(text: string): CharacterCard[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    throw new Error("invalid_json");
  }
  if (!raw || typeof raw !== "object") throw new Error("invalid_json");

  const obj = raw as Record<string, unknown>;
  if (obj.format === CHARACTER_PACK_FORMAT) {
    if (obj.version !== 1) throw new Error("unsupported_version");
    if (!Array.isArray(obj.characters)) throw new Error("missing_characters");
    return normalizeImported(obj.characters as CharacterCard[]);
  }

  if (Array.isArray(raw)) {
    return normalizeImported(raw as CharacterCard[]);
  }

  // Single card
  if (typeof obj.name === "string" || typeof obj.id === "string") {
    return normalizeImported([obj as unknown as CharacterCard]);
  }

  throw new Error("unknown_format");
}

function normalizeImported(list: CharacterCard[]): CharacterCard[] {
  const out: CharacterCard[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const name = (raw.name || raw.nameEn || "").trim();
    if (!name) continue;
    // Always mint a new user id when importing to avoid clobbering builtins by accident
    if (raw.isBuiltin || raw.id === "char_default_assistant") {
      out.push(
        createCharacterDraft({
          name,
          tagline: raw.tagline || raw.taglineEn,
          description: raw.description || raw.descriptionEn,
          systemPrompt: raw.systemPrompt,
          accent: raw.accent,
        }),
      );
      continue;
    }
    if (raw.id?.trim()) {
      out.push({
        ...raw,
        name,
        nameEn: (raw.nameEn || name).trim(),
        isBuiltin: false,
        source: "import",
        updatedAt: Date.now(),
      });
    } else {
      out.push(
        createCharacterDraft({
          name,
          tagline: raw.tagline || raw.taglineEn,
          description: raw.description || raw.descriptionEn,
          systemPrompt: raw.systemPrompt,
          accent: raw.accent,
        }),
      );
    }
  }
  if (out.length === 0) throw new Error("empty_import");
  return out;
}

export function mergeImportedCharacters(
  local: CharacterCard[],
  incoming: CharacterCard[],
): CharacterCard[] {
  let next = ensureBuiltin(local);
  for (const c of incoming) {
    next = upsertCharacter(next, c);
  }
  return next;
}

export function mapCharacterImportError(
  code: string,
  dict: {
    characterImportErrJson: string;
    characterImportErrEmpty: string;
    characterImportFailed: string;
  },
): string {
  switch (code) {
    case "invalid_json":
      return dict.characterImportErrJson;
    case "empty_import":
      return dict.characterImportErrEmpty;
    case "unsupported_version":
    case "missing_characters":
    case "unknown_format":
      return dict.characterImportErrJson;
    default:
      return dict.characterImportFailed;
  }
}
