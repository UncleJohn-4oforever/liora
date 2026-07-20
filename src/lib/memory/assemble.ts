import type { CharacterCard, Message } from "../../types";
import type { MemoryItem, MemoryStoreData } from "../../types/memory";
import { DEFAULT_CHARACTER } from "../../data/defaults";
import { L3_IDENTITY_PREDICATES } from "./profileHeuristics";
import {
  characterMemoriesForMetaIndex,
  chunksForCharacter,
  isMetaCharacter,
  memoriesForInjection,
} from "./scope";
import { activeMemories } from "./store";
import { retrieveChunks, tokenize } from "./terms";
import { HOT_TURNS } from "./pipeline";

function scoreMemoryAgainstQuery(m: MemoryItem, queryTokens: string[]): number {
  if (queryTokens.length === 0) return 0;
  const bag = `${m.subject} ${m.predicate} ${m.object}`.toLowerCase();
  let hit = 0;
  for (const t of queryTokens) {
    if (t.length < 2) continue;
    if (bag.includes(t)) hit += t.length >= 2 ? 2 : 1;
  }
  // boost named pets / projects
  if (/pet:|project:|豆豆|柯基/.test(bag) && hit > 0) hit += 2;
  return hit;
}

function rankMemories(mems: MemoryItem[], query: string, limit: number): MemoryItem[] {
  const tokens = tokenize(query);
  if (!query.trim() || tokens.length === 0) {
    // no query: newest first
    return [...mems]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
  }
  return [...mems]
    .map((m) => ({
      m,
      score: scoreMemoryAgainstQuery(m, tokens) + m.confidence + m.specificity * 0.2,
    }))
    .sort((a, b) => b.score - a.score || b.m.updatedAt - a.m.updatedAt)
    .slice(0, limit)
    .map((x) => x.m);
}

/**
 * Build memory block for L0 system prompt (R3 scoped).
 * Meta → master dossier only. Persona → that character's atoms only.
 */
export function buildMemorySystemBlock(
  store: MemoryStoreData,
  sessionId: string,
  latestUserText: string,
  locale: "zh" | "en",
  character?: CharacterCard | null,
  characterCatalog: CharacterCard[] = [],
): string {
  const lines: string[] = [];
  const card = character ?? DEFAULT_CHARACTER;
  const isMeta = isMetaCharacter(card);
  const characterId = card.id || DEFAULT_CHARACTER.id;

  const header =
    locale === "en"
      ? isMeta
        ? [
            "You are Liora's local Meta AI and memory steward. You know that you are an AI and may coordinate multiple personas.",
            "Use the master dossier, unclaimed memories, persona catalog, and relevant cross-persona summaries. Prefer the user's latest message if conflict; never invent memories.",
          ]
        : [
            "Shared user profile plus this character's private memory (auditable). Prefer the latest message if conflict.",
            "Use these facts when relevant. Do not invent memories or assume another character's private experiences.",
          ]
      : isMeta
        ? [
            "以下是用户主档记忆（仅本机 AI / Meta 可见）。与当前消息冲突时以当前消息为准。",
            "你是主档管家；不要编造未列出的事实。",
          ]
        : [
            "以下是当前角色专属记忆（可审计）。与当前消息冲突时以当前消息为准。",
            "相关时请使用这些事实；不要编造；不要假设其他角色的记忆。",
          ];
  lines.push(...header);

  const allActive = activeMemories(store);
  const directlyVisible = memoriesForInjection(allActive, {
    isMeta,
    characterId,
  });
  const q = latestUserText.trim();
  const metaIndex = isMeta ? characterMemoriesForMetaIndex(allActive) : [];
  const queryTokens = tokenize(q);
  const relatedAcrossCharacters = isMeta && q
    ? rankMemories(
        metaIndex.filter((m) => scoreMemoryAgainstQuery(m, queryTokens) > 0),
        q,
        6,
      )
    : [];
  const visibleMap = new Map<string, MemoryItem>();
  for (const memory of [...directlyVisible, ...relatedAcrossCharacters]) {
    visibleMap.set(memory.id, memory);
  }
  const mems = [...visibleMap.values()];

  if (isMeta) {
    const names = new Map(
      characterCatalog.map((c) => [c.id, c.name || c.nameEn || c.id]),
    );
    const groups = new Map<string, MemoryItem[]>();
    for (const memory of metaIndex) {
      const owner = memory.characterId || "unassigned";
      groups.set(owner, [...(groups.get(owner) ?? []), memory]);
    }
    lines.push(locale === "en" ? "Persona memory catalog:" : "角色记忆目录：");
    if (groups.size === 0) {
      lines.push(locale === "en" ? "- No persona memories yet." : "- 暂无角色记忆。");
    } else {
      for (const [owner, owned] of groups) {
        const recent = [...owned].sort((a, b) => b.updatedAt - a.updatedAt)[0];
        lines.push(
          `- ${names.get(owner) ?? owner}: ${owned.length} memories; latest topic ${recent.subject} / ${recent.predicate}`,
        );
      }
    }
    const orphanCount = allActive.filter((m) => m.scope === "orphan").length;
    if (orphanCount > 0) {
      lines.push(
        locale === "en"
          ? `- ${orphanCount} unclaimed memories require review or ownership assignment.`
          : `- 有 ${orphanCount} 条无主记忆需要检查或认领。`,
      );
    }
  }

  // L3: identity predicates first (name/pet), always inject within scope
  const l3All = mems.filter((m) => m.layer === "L3");
  const l3Identity = l3All
    .filter((m) => L3_IDENTITY_PREDICATES.has(m.predicate.toLowerCase()))
    .sort(
      (a, b) =>
        b.confidence * 2 +
        b.specificity -
        (a.confidence * 2 + a.specificity) || b.updatedAt - a.updatedAt,
    );
  const l3Pinned = [...l3All]
    .sort(
      (a, b) =>
        b.confidence * 2 +
        b.specificity -
        (a.confidence * 2 + a.specificity) || b.updatedAt - a.updatedAt,
    )
    .slice(0, 12);
  const l3Related = rankMemories(l3All, q, 8);
  const l3Map = new Map<string, MemoryItem>();
  for (const m of [...l3Identity, ...l3Pinned, ...l3Related]) l3Map.set(m.id, m);
  // Drop weak entity:mentioned if we already have richer profile
  const l3 = [...l3Map.values()]
    .filter(
      (m) =>
        !(
          m.predicate === "mentioned" &&
          m.subject.startsWith("entity:") &&
          l3Identity.length > 0
        ),
    )
    .slice(0, 16);

  // L4: always all (usually few)
  const l4 = mems
    .filter((m) => m.layer === "L4")
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 8);

  // L5: open_loops first, then recent + query related
  const l5All = mems.filter((m) => m.layer === "L5");
  const l5Loops = l5All
    .filter((m) => /open_loop|ongoing|待办|观察/.test(`${m.predicate} ${m.object}`))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 6);
  const l5Recent = [...l5All].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4);
  const l5Related = rankMemories(l5All, q, 4);
  const l5Map = new Map<string, MemoryItem>();
  for (const m of [...l5Loops, ...l5Recent, ...l5Related]) l5Map.set(m.id, m);
  const l5 = [...l5Map.values()].slice(0, 8);

  if (l3.length) {
    lines.push(
      locale === "en"
        ? isMeta
          ? "User master profile:"
          : "Character-relevant profile:"
        : isMeta
          ? "用户主档画像："
          : "本角色相关画像：",
    );
    for (const m of l3) {
      const owner =
        isMeta && m.scope === "character"
          ? ` [${m.characterId ?? "unknown"}]`
          : isMeta && m.scope === "orphan"
            ? " [unclaimed]"
            : "";
      lines.push(`-${owner} ${m.subject} · ${m.predicate}: ${m.object}`);
    }
  }
  if (l4.length) {
    lines.push(locale === "en" ? "Answer style / procedures:" : "交互策略（须遵守）：");
    for (const m of l4) {
      const owner = isMeta && m.scope === "character" ? ` [${m.characterId ?? "unknown"}]` :
        isMeta && m.scope === "orphan" ? " [unclaimed]" : "";
      lines.push(`-${owner} ${m.object}`);
    }
  }
  if (l5.length) {
    lines.push(locale === "en" ? "Events / open loops:" : "事件与进行中事项：");
    for (const m of l5) {
      const owner = isMeta && m.scope === "character" ? ` [${m.characterId ?? "unknown"}]` :
        isMeta && m.scope === "orphan" ? " [unclaimed]" : "";
      lines.push(`-${owner} ${m.object}`);
    }
  }

  // Personas stay isolated; Meta may retrieve relevant summaries across roles.
  const epsSession = store.episodes
    .filter((e) => e.sessionId === sessionId)
    .sort((a, b) => {
      if (a.level !== b.level) return a.level === "meso" ? -1 : 1;
      return b.createdAt - a.createdAt;
    });
  const epsCurrent = [
    ...epsSession.filter((e) => e.level === "meso").slice(0, 3),
    ...epsSession.filter((e) => e.level === "micro").slice(0, 4),
  ].slice(0, 6);

  const tokens = tokenize(q);
  const epsOther = store.episodes
    .filter(
      (e) =>
        e.sessionId !== sessionId &&
        (isMeta || (e.characterId ?? "") === characterId),
    )
    .map((e) => {
      const bag = `${e.topic} ${e.rawText} ${e.entities.join(" ")}`.toLowerCase();
      let score = 0;
      for (const t of tokens) {
        if (t.length >= 2 && bag.includes(t)) score += 1;
      }
      for (const m of l3) {
        const ent = m.subject.replace(/^pet:|^project:/, "");
        if (ent.length >= 2 && bag.includes(ent.toLowerCase())) score += 2;
        if (m.object && bag.includes(m.object.slice(0, 4).toLowerCase())) score += 1;
      }
      return { e, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.e);

  if (epsCurrent.length) {
    lines.push(locale === "en" ? "This chat summaries:" : "本会话摘要：");
    for (const e of epsCurrent) {
      const loops =
        e.openLoops?.length > 0
          ? ` | ${locale === "en" ? "open" : "未完成"}: ${e.openLoops.slice(0, 3).join("; ")}`
          : "";
      const ents =
        e.entities?.length > 0
          ? ` | ${locale === "en" ? "entities" : "实体"}: ${e.entities.slice(0, 6).join(", ")}`
          : "";
      lines.push(
        `- [${e.level}] ${e.topic}: ${e.whatHappened.slice(0, 2).join("; ") || e.rawText}${loops}${ents}`,
      );
    }
  }
  if (epsOther.length) {
    lines.push(locale === "en" ? "Related past chats:" : "相关历史会话：");
    for (const e of epsOther) {
      const owner = isMeta && e.characterId ? ` [${e.characterId}]` : "";
      lines.push(`-${owner} ${e.topic}: ${e.rawText.slice(0, 180)}`);
    }
  }

  if (q) {
    const enrich = [q, ...l3.slice(0, 5).map((m) => m.object)].join(" ");
    const scopedChunks = chunksForCharacter(store.chunks, characterId);
    const hits = retrieveChunks(scopedChunks, enrich, 4);
    if (hits.length) {
      lines.push(locale === "en" ? "Retrieved details:" : "检索到的细节：");
      for (const h of hits) {
        lines.push(`- ${h.text.slice(0, 300)}`);
      }
    }
  }

  const hasBody =
    l3.length + l4.length + l5.length + epsCurrent.length + epsOther.length > 0 ||
    (isMeta && metaIndex.length > 0);
  if (!hasBody && !q) return "";
  if (lines.length <= header.length && !hasBody) return "";

  return lines.join("\n");
}

/** Hot window of messages for L1. */
export function hotMessages(messages: Message[], hotTurns = HOT_TURNS): Message[] {
  if (messages.length <= hotTurns) return messages;
  return messages.slice(-hotTurns);
}

export function composeSystemPrompt(
  base: string,
  memoryBlock: string,
): string {
  if (!memoryBlock.trim()) return base;
  return `${base}\n\n---\n${memoryBlock}`;
}

/** Human-readable summary of what a pipeline run wrote. */
export function formatMemoryJobSummary(
  input: {
    didSummary: boolean;
    labels: string[];
    layerCounts: { L3: number; L4: number; L5: number };
  },
  locale: "zh" | "en",
): string {
  const { didSummary, labels, layerCounts } = input;
  const parts: string[] = [];
  if (layerCounts.L3) parts.push(`L3×${layerCounts.L3}`);
  if (layerCounts.L4) parts.push(`L4×${layerCounts.L4}`);
  if (layerCounts.L5) parts.push(`L5×${layerCounts.L5}`);
  if (parts.length === 0 && didSummary) {
    return locale === "en" ? "Episode summary saved" : "情节摘要已保存";
  }
  if (parts.length === 0 && labels.length) {
    return labels[0];
  }
  const head = parts.join(" · ");
  const sample = labels[0] ? ` · ${labels[0]}` : "";
  return head + sample;
}
