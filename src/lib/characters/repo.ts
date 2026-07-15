import { DEFAULT_CHARACTER } from "../../data/defaults";
import type { CharacterCard } from "../../types";
import { uid } from "../id";
import { kvGetJson, kvSetJson } from "../db/kv";

const KEY = "characters" as const;

export interface CharactersStore {
  version: 1;
  items: CharacterCard[];
}

function normalizeCard(raw: Partial<CharacterCard> & { id?: string }): CharacterCard | null {
  const id = (raw.id ?? "").trim();
  if (!id) return null;
  const name = (raw.name ?? "").trim() || "未命名";
  const now = Date.now();
  return {
    id,
    name,
    nameEn: (raw.nameEn ?? raw.name ?? name).trim() || name,
    tagline: (raw.tagline ?? "").trim(),
    taglineEn: (raw.taglineEn ?? raw.tagline ?? "").trim(),
    description: (raw.description ?? "").trim(),
    descriptionEn: (raw.descriptionEn ?? raw.description ?? "").trim(),
    systemPrompt: (raw.systemPrompt ?? "").trim() || undefined,
    accent:
      (raw.accent ?? "").trim() ||
      "linear-gradient(145deg, #3d5a80 0%, #98c1d9 45%, #e0fbfc 100%)",
    avatarUrl: (raw.avatarUrl ?? "").trim() || undefined,
    isBuiltin: Boolean(raw.isBuiltin),
    kind:
      raw.kind === "meta" || raw.kind === "persona"
        ? raw.kind
        : id === DEFAULT_CHARACTER.id
          ? "meta"
          : "persona",
    source: raw.source ?? (raw.isBuiltin ? "builtin" : "user"),
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : now,
  };
}

/** Ensure builtin Liora exists; dedupe by id. */
export function ensureBuiltin(items: CharacterCard[]): CharacterCard[] {
  const map = new Map<string, CharacterCard>();
  for (const c of items) {
    const n = normalizeCard(c);
    if (n) map.set(n.id, n);
  }
  const builtin = normalizeCard({
    ...DEFAULT_CHARACTER,
    isBuiltin: true,
    source: "builtin",
  })!;
  const existing = map.get(builtin.id);
  if (!existing) {
    map.set(builtin.id, builtin);
  } else {
    // Builtin Meta: product owns default copy/text, but keep user portrait & rename.
    map.set(builtin.id, {
      ...builtin,
      name: existing.name?.trim() || builtin.name,
      nameEn: existing.nameEn?.trim() || builtin.nameEn,
      // Critical: do not wipe uploaded avatar (or custom art path)
      avatarUrl: existing.avatarUrl?.trim() || undefined,
      isBuiltin: true,
      kind: "meta",
      source: "builtin",
      createdAt: existing.createdAt ?? builtin.createdAt,
      updatedAt: existing.updatedAt ?? builtin.updatedAt,
    });
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.isBuiltin && !b.isBuiltin) return -1;
    if (!a.isBuiltin && b.isBuiltin) return 1;
    return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
  });
}

export async function loadCharacters(): Promise<CharacterCard[]> {
  const data = await kvGetJson<CharactersStore | CharacterCard[]>(KEY);
  let items: CharacterCard[] = [];
  if (Array.isArray(data)) {
    items = data;
  } else if (data && Array.isArray(data.items)) {
    items = data.items;
  }
  return ensureBuiltin(items);
}

export async function saveCharacters(items: CharacterCard[]): Promise<void> {
  const next = ensureBuiltin(items);
  await kvSetJson(KEY, { version: 1, items: next } satisfies CharactersStore);
}

export function resolveCharacter(
  items: CharacterCard[],
  id: string | undefined | null,
  fallbackId = DEFAULT_CHARACTER.id,
): CharacterCard {
  const list = ensureBuiltin(items);
  return (
    list.find((c) => c.id === id) ??
    list.find((c) => c.id === fallbackId) ??
    list[0]!
  );
}

export function displayCharacterName(
  card: CharacterCard,
  locale: "zh" | "en",
): string {
  if (locale === "en") return card.nameEn || card.name;
  return card.name || card.nameEn;
}

export function createCharacterDraft(partial?: {
  name?: string;
  tagline?: string;
  description?: string;
  systemPrompt?: string;
  accent?: string;
  avatarUrl?: string;
}): CharacterCard {
  const now = Date.now();
  const name = (partial?.name ?? "").trim() || "新角色";
  return {
    id: uid("char"),
    name,
    nameEn: name,
    tagline: (partial?.tagline ?? "").trim(),
    taglineEn: (partial?.tagline ?? "").trim(),
    description: (partial?.description ?? "").trim(),
    descriptionEn: (partial?.description ?? "").trim(),
    systemPrompt: (partial?.systemPrompt ?? "").trim() || undefined,
    accent:
      partial?.accent?.trim() ||
      pickAccent(name),
    avatarUrl: (partial?.avatarUrl ?? "").trim() || undefined,
    isBuiltin: false,
    kind: "persona",
    source: "user",
    createdAt: now,
    updatedAt: now,
  };
}

const ACCENTS = [
  "linear-gradient(145deg, #3d5a80 0%, #98c1d9 45%, #e0fbfc 100%)",
  "linear-gradient(145deg, #5e4b8b 0%, #c9a0dc 50%, #f3e8ff 100%)",
  "linear-gradient(145deg, #1b4332 0%, #52b788 45%, #d8f3dc 100%)",
  "linear-gradient(145deg, #7f1d1d 0%, #f87171 45%, #fecaca 100%)",
  "linear-gradient(145deg, #0c4a6e 0%, #38bdf8 45%, #e0f2fe 100%)",
  "linear-gradient(145deg, #713f12 0%, #fbbf24 45%, #fef3c7 100%)",
];

function pickAccent(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return ACCENTS[Math.abs(h) % ACCENTS.length]!;
}

export function upsertCharacter(
  items: CharacterCard[],
  card: CharacterCard,
): CharacterCard[] {
  const next = ensureBuiltin(items);
  const idx = next.findIndex((c) => c.id === card.id);
  const normalized = normalizeCard({
    ...card,
    updatedAt: Date.now(),
    isBuiltin: card.isBuiltin || card.id === DEFAULT_CHARACTER.id,
  })!;
  if (idx >= 0) {
    const prev = next[idx]!;
    next[idx] = {
      ...normalized,
      isBuiltin: prev.isBuiltin || normalized.isBuiltin,
      createdAt: prev.createdAt ?? normalized.createdAt,
    };
  } else {
    next.push(normalized);
  }
  return ensureBuiltin(next);
}

export function removeCharacter(
  items: CharacterCard[],
  id: string,
): { items: CharacterCard[]; removed: boolean; error?: string } {
  const list = ensureBuiltin(items);
  const target = list.find((c) => c.id === id);
  if (!target) return { items: list, removed: false, error: "not_found" };
  if (target.isBuiltin || target.id === DEFAULT_CHARACTER.id) {
    return { items: list, removed: false, error: "builtin" };
  }
  return {
    items: list.filter((c) => c.id !== id),
    removed: true,
  };
}
