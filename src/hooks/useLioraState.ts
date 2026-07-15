import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_CHARACTER, DEFAULT_MODEL } from "../data/defaults";
import { t } from "../i18n";
import {
  flushPersist,
  loadAllSessions,
  loadMemoryStoreFromDb,
  loadSettingsFromDb,
  migrateFromLocalStorageIfNeeded,
  mirrorMemoryToLocalStorage,
  mirrorSessionsToLocalStorage,
  mirrorSettingsToLocalStorage,
  replaceAllSessions,
  replaceMemoryStore,
  saveSettingsToDb,
} from "../lib/db";
import {
  createCharacterDraft,
  displayCharacterName,
  ensureBuiltin,
  loadCharacters,
  removeCharacter,
  resolveCharacter,
  saveCharacters,
  upsertCharacter,
} from "../lib/characters/repo";
import { uid } from "../lib/id";
import { formatMemoryJobSummary } from "../lib/memory/assemble";
import {
  assembleChatContext,
  type AssembledBudget,
} from "../lib/memory/budgetAssemble";
import {
  runMemoryPipeline,
  SUMMARY_EVERY_N_MESSAGES,
} from "../lib/memory/pipeline";
import {
  commitPendingSensitive,
  rememberExplicitText,
} from "../lib/memory/rememberExplicit";
import {
  isMetaCharacter,
  memoriesForPanel,
  migrateMemoryStoreScopes,
} from "../lib/memory/scope";
import {
  activeMemories,
  clearAllMemories,
  softDeleteMemory,
  updateMemoryObject,
} from "../lib/memory/store";
import type { MemoryItem, MemoryStoreData } from "../types/memory";
import { genOptionsForChat, normalizeContextSize } from "../lib/chatPrompt";
import { humanizeError } from "../lib/errors";
import {
  resolveModelName,
  streamOllamaChat,
  toOllamaMessages,
  type TokenUsage,
} from "../lib/ollama";
import { useEngine } from "./useEngine";
import {
  applyBackup,
  buildBackup,
  downloadBackup,
  parseBackupJson,
  readFileAsText,
  type ImportMode,
} from "../lib/backup";
import type {
  AppSettings,
  CharacterCard,
  ChatFolder,
  Locale,
  Message,
  Session,
} from "../types";

const defaultSettings: AppSettings = {
  locale: "zh",
  defaultModelId: DEFAULT_MODEL.id,
  defaultCharacterId: DEFAULT_CHARACTER.id,
  memoryEnabled: true,
  summaryEveryN: SUMMARY_EVERY_N_MESSAGES,
  showThinking: true,
  answerLength: "normal",
  contextSize: 8192,
  chatFolders: [],
};

function createSession(
  locale: Locale,
  modelId = DEFAULT_MODEL.id,
  characterId = DEFAULT_CHARACTER.id,
): Session {
  const now = Date.now();
  return {
    id: uid("ses"),
    title: t(locale).defaultSessionTitle,
    characterId,
    modelId,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

function emptyMemory(): MemoryStoreData {
  return {
    version: 1,
    memories: [],
    episodes: [],
    chunks: [],
    cursors: [],
    recentUpdates: [],
  };
}

export function useLioraState() {
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [characters, setCharacters] = useState<CharacterCard[]>(() =>
    ensureBuiltin([]),
  );
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [input, setInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [memoryStore, setMemoryStore] = useState<MemoryStoreData>(emptyMemory);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modelHubOpen, setModelHubOpen] = useState(false);
  const [characterHubOpen, setCharacterHubOpen] = useState(false);
  /** Last completed turn's token usage (from Ollama). */
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);
  /** Context limit used for that turn (num_ctx). */
  const [usageCtxLimit, setUsageCtxLimit] = useState<number | null>(null);
  /** Pre-send packed budget (rolling assemble). */
  const [assembledBudget, setAssembledBudget] =
    useState<AssembledBudget | null>(null);
  const [pipelineBusy, setPipelineBusy] = useState(false);
  const [toast, setToast] = useState<{
    count: number;
    labels: string[];
    detail?: string;
  } | null>(null);
  const [rememberBusy, setRememberBusy] = useState(false);
  const [sensitivePending, setSensitivePending] = useState<{
    text: string;
    tags: string[];
    items: Omit<MemoryItem, "id" | "createdAt" | "updatedAt">[];
  } | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const pipelineRef = useRef(false);
  const memoryStoreRef = useRef(memoryStore);
  memoryStoreRef.current = memoryStore;
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const charactersRef = useRef(characters);
  charactersRef.current = characters;
  /** Always-fresh settings inside send (avoid stale num_ctx / num_predict). */
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const dict = useMemo(() => t(settings.locale), [settings.locale]);
  const active = sessions.find((s) => s.id === activeId) ?? sessions[0] ?? null;
  const defaultCharacterId =
    settings.defaultCharacterId || DEFAULT_CHARACTER.id;
  const character = useMemo(
    () =>
      resolveCharacter(
        characters,
        active?.characterId ?? defaultCharacterId,
        defaultCharacterId,
      ),
    [characters, active?.characterId, defaultCharacterId],
  );
  const engineApi = useEngine(settings.locale);
  const ollamaModels = engineApi.models;
  const ollamaOnline = engineApi.online;

  // Boot SQLite + migrate
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await migrateFromLocalStorageIfNeeded(defaultSettings);
        const [s, sess, mem, chars] = await Promise.all([
          loadSettingsFromDb(defaultSettings),
          loadAllSessions(),
          loadMemoryStoreFromDb(),
          loadCharacters(),
        ]);
        if (cancelled) return;
        const charsOk = ensureBuiltin(chars);
        await saveCharacters(charsOk);
        const defChar =
          s.defaultCharacterId &&
          charsOk.some((c) => c.id === s.defaultCharacterId)
            ? s.defaultCharacterId
            : DEFAULT_CHARACTER.id;
        const settingsOk = { ...s, defaultCharacterId: defChar };
        let nextSessions = sess;
        if (nextSessions.length === 0) {
          nextSessions = [
            createSession(settingsOk.locale, settingsOk.defaultModelId, defChar),
          ];
          await replaceAllSessions(nextSessions);
        }
        setSettings(settingsOk);
        setCharacters(charsOk);
        setSessions(nextSessions);
        setActiveId(nextSessions[0].id);
        setMemoryStore(
          migrateMemoryStoreScopes(mem, DEFAULT_CHARACTER.id),
        );
        setReady(true);
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("Liora boot failed, falling back to localStorage:", e);
          setBootError(msg);
          // Fallback: localStorage path so UI is never stuck blank
          try {
            const { loadSessions, loadSettings } = await import("../lib/storage");
            const { loadMemoryStore } = await import("../lib/memory/store");
            const s = loadSettings(defaultSettings);
            let sess = loadSessions();
            if (sess.length === 0) {
              sess = [
                createSession(
                  s.locale,
                  s.defaultModelId,
                  s.defaultCharacterId || DEFAULT_CHARACTER.id,
                ),
              ];
            }
            setSettings(s);
            setCharacters(ensureBuiltin([]));
            setSessions(sess);
            setActiveId(sess[0].id);
            setMemoryStore(
              migrateMemoryStoreScopes(
                loadMemoryStore(),
                DEFAULT_CHARACTER.id,
              ),
            );
          } catch {
            const s = createSession("zh");
            setSessions([s]);
            setActiveId(s.id);
            setCharacters(ensureBuiltin([]));
          }
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced persist sessions (streaming would thrash otherwise)
  useEffect(() => {
    if (!ready) return;
    mirrorSessionsToLocalStorage(sessions);
    const t = window.setTimeout(() => {
      void replaceAllSessions(sessions).catch(() => {
        /* keep LS mirror */
      });
    }, 400);
    return () => window.clearTimeout(t);
  }, [sessions, ready]);

  // Persist settings
  useEffect(() => {
    if (!ready) return;
    mirrorSettingsToLocalStorage(settings);
    void saveSettingsToDb(settings);
  }, [settings, ready]);

  // Persist characters
  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(() => {
      void saveCharacters(characters).catch(() => {
        /* ignore */
      });
    }, 300);
    return () => window.clearTimeout(t);
  }, [characters, ready]);

  // Debounced persist memory
  useEffect(() => {
    if (!ready) return;
    mirrorMemoryToLocalStorage(memoryStore);
    const t = window.setTimeout(() => {
      void replaceMemoryStore(memoryStore).catch(() => {
        /* keep LS mirror */
      });
    }, 400);
    return () => window.clearTimeout(t);
  }, [memoryStore, ready]);

  // Flush on unload
  useEffect(() => {
    const onHide = () => {
      void flushPersist();
    };
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onHide);
    };
  }, []);

  const setLocale = useCallback((locale: Locale) => {
    setSettings((s) => ({ ...s, locale }));
  }, []);

  const patchSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  const toggleMemory = useCallback(() => {
    setSettings((s) => ({ ...s, memoryEnabled: !s.memoryEnabled }));
  }, []);

  const exportBackup = useCallback(() => {
    const backup = buildBackup({
      settings,
      sessions: sessionsRef.current,
      memory: memoryStoreRef.current,
      characters: charactersRef.current,
    });
    downloadBackup(backup);
    setToast({
      count: 1,
      labels: [settings.locale === "en" ? "Backup downloaded" : "备份已下载"],
    });
  }, [settings]);

  const importBackupFile = useCallback(
    async (file: File, mode: ImportMode) => {
      const text = await readFileAsText(file);
      const backup = parseBackupJson(text);
      const next = applyBackup(
        {
          settings,
          sessions: sessionsRef.current,
          memory: memoryStoreRef.current,
          characters: charactersRef.current,
        },
        backup,
        mode,
      );
      setSettings(next.settings);
      setSessions(next.sessions);
      setMemoryStore(next.memory);
      setCharacters(ensureBuiltin(next.characters));
      if (next.sessions.length > 0) {
        setActiveId(next.sessions[0].id);
      }
      setToast({
        count: 1,
        labels: [
          settings.locale === "en"
            ? `Imported (${mode})`
            : `已导入（${mode === "merge" ? "合并" : "覆盖"}）`,
        ],
      });
    },
    [settings],
  );

  /** Clear usage meter — new/switched chats do not inherit previous turn's fill. */
  const resetContextUsage = useCallback(() => {
    setTokenUsage(null);
    setUsageCtxLimit(null);
    setAssembledBudget(null);
  }, []);

  const selectSession = useCallback(
    (id: string) => {
      setActiveId(id);
      setLastError(null);
      resetContextUsage();
    },
    [resetContextUsage],
  );

  const newSession = useCallback(() => {
    const charId =
      settings.defaultCharacterId || DEFAULT_CHARACTER.id;
    const s = createSession(
      settings.locale,
      settings.defaultModelId,
      charId,
    );
    setSessions((prev) => [s, ...prev]);
    setActiveId(s.id);
    setInput("");
    setLastError(null);
    resetContextUsage();
  }, [
    settings.locale,
    settings.defaultModelId,
    settings.defaultCharacterId,
    resetContextUsage,
  ]);

  /** Bind character to the active session only (not global). */
  const setSessionCharacter = useCallback(
    (characterId: string) => {
      const exists = charactersRef.current.some((c) => c.id === characterId);
      if (!exists) return;
      setSessions((prev) => {
        const aid = activeId || prev[0]?.id;
        if (!aid) return prev;
        return prev.map((s) =>
          s.id === aid ? { ...s, characterId, updatedAt: Date.now() } : s,
        );
      });
    },
    [activeId],
  );

  const setDefaultCharacter = useCallback((characterId: string) => {
    const exists = charactersRef.current.some((c) => c.id === characterId);
    if (!exists) return;
    setSettings((s) => ({ ...s, defaultCharacterId: characterId }));
  }, []);

  const saveCharacterCard = useCallback((card: CharacterCard) => {
    if (!card.id) {
      const draft = createCharacterDraft({
        name: card.name,
        tagline: card.tagline,
        description: card.description,
        systemPrompt: card.systemPrompt,
        accent: card.accent || undefined,
        avatarUrl: card.avatarUrl,
      });
      setCharacters((prev) => upsertCharacter(prev, draft));
      // Bind new card to current session so user can chat immediately
      setSessions((prev) => {
        const aid = activeId || prev[0]?.id;
        if (!aid) return prev;
        return prev.map((s) =>
          s.id === aid
            ? { ...s, characterId: draft.id, updatedAt: Date.now() }
            : s,
        );
      });
      return;
    }
    setCharacters((prev) => upsertCharacter(prev, card));
  }, [activeId]);

  const deleteCharacterCard = useCallback(
    (id: string) => {
      const { items, removed } = removeCharacter(charactersRef.current, id);
      if (!removed) return;
      setCharacters(items);
      const fallback =
        settingsRef.current.defaultCharacterId === id
          ? DEFAULT_CHARACTER.id
          : settingsRef.current.defaultCharacterId || DEFAULT_CHARACTER.id;
      if (settingsRef.current.defaultCharacterId === id) {
        setSettings((s) => ({
          ...s,
          defaultCharacterId: DEFAULT_CHARACTER.id,
        }));
      }
      setSessions((prev) =>
        prev.map((s) =>
          s.characterId === id
            ? { ...s, characterId: fallback, updatedAt: Date.now() }
            : s,
        ),
      );
    },
    [],
  );

  /** Replace full character list (e.g. after JSON import). */
  const replaceCharacters = useCallback((items: CharacterCard[]) => {
    setCharacters(ensureBuiltin(items));
  }, []);

  const setSessionModel = useCallback(
    (modelId: string) => {
      const id = modelId.trim();
      if (!id || !active) return;
      setSettings((s) => ({ ...s, defaultModelId: id }));
      setSessions((prev) =>
        prev.map((s) =>
          s.id === active.id
            ? { ...s, modelId: id, updatedAt: Date.now() }
            : s,
        ),
      );
    },
    [active],
  );

  /**
   * When engine reports installed models, heal stale default / session model ids
   * (common after GGUF rename or deleted tags → Ollama 404).
   */
  useEffect(() => {
    if (!ready || ollamaModels.length === 0) return;
    const def = settings.defaultModelId?.trim() ?? "";
    const resolvedDef = resolveModelName(def, ollamaModels);
    if (resolvedDef && resolvedDef !== def) {
      setSettings((s) =>
        s.defaultModelId === resolvedDef
          ? s
          : { ...s, defaultModelId: resolvedDef },
      );
    }
    setSessions((prev) => {
      let changed = false;
      const next = prev.map((s) => {
        const want = (s.modelId || def || "").trim();
        const resolved = resolveModelName(want, ollamaModels);
        if (resolved && resolved !== s.modelId) {
          changed = true;
          return { ...s, modelId: resolved, updatedAt: Date.now() };
        }
        if (!s.modelId && resolvedDef) {
          changed = true;
          return { ...s, modelId: resolvedDef, updatedAt: Date.now() };
        }
        return s;
      });
      return changed ? next : prev;
    });
  }, [ready, ollamaModels, settings.defaultModelId]);

  const deleteSession = useCallback(
    (id: string) => {
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== id);
        if (next.length === 0) {
          const s = createSession(settings.locale, settings.defaultModelId);
          setActiveId(s.id);
          resetContextUsage();
          return [s];
        }
        if (activeId === id) {
          setActiveId(next[0].id);
          resetContextUsage();
        }
        return next;
      });
    },
    [activeId, settings.locale, settings.defaultModelId, resetContextUsage],
  );

  const renameSession = useCallback((id: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setSessions((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, title: trimmed, updatedAt: Date.now() } : s,
      ),
    );
  }, []);

  const chatFolders = settings.chatFolders ?? [];

  const newFolder = useCallback(() => {
    const name =
      window.prompt(
        settings.locale === "en" ? "Folder name" : "文件夹名称",
        settings.locale === "en" ? "New folder" : "新建文件夹",
      )?.trim() ||
      (settings.locale === "en" ? "New folder" : "新建文件夹");
    const folder: ChatFolder = {
      id: uid("fld"),
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      collapsed: false,
    };
    setSettings((s) => ({
      ...s,
      chatFolders: [...(s.chatFolders ?? []), folder],
    }));
  }, [settings.locale]);

  const renameFolder = useCallback((folderId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSettings((s) => ({
      ...s,
      chatFolders: (s.chatFolders ?? []).map((f) =>
        f.id === folderId
          ? { ...f, name: trimmed, updatedAt: Date.now() }
          : f,
      ),
    }));
  }, []);

  const deleteFolder = useCallback((folderId: string) => {
    setSettings((s) => ({
      ...s,
      chatFolders: (s.chatFolders ?? []).filter((f) => f.id !== folderId),
    }));
    // Sessions return to unfiled root
    setSessions((prev) =>
      prev.map((s) =>
        s.folderId === folderId
          ? { ...s, folderId: null, updatedAt: Date.now() }
          : s,
      ),
    );
  }, []);

  const toggleFolderCollapsed = useCallback((folderId: string) => {
    setSettings((s) => ({
      ...s,
      chatFolders: (s.chatFolders ?? []).map((f) =>
        f.id === folderId ? { ...f, collapsed: !f.collapsed } : f,
      ),
    }));
  }, []);

  const moveSessionToFolder = useCallback(
    (sessionId: string, folderId: string | null) => {
      if (folderId) {
        const ok = (settingsRef.current.chatFolders ?? []).some(
          (f) => f.id === folderId,
        );
        if (!ok) return;
      }
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? { ...s, folderId: folderId || null, updatedAt: Date.now() }
            : s,
        ),
      );
    },
    [],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setGenerating(false);
  }, []);

  const scheduleMemoryJob = useCallback(
    async (
      sessionId: string,
      messages: Message[],
      model: string,
      force = false,
    ) => {
      if (!settings.memoryEnabled || pipelineRef.current) return;
      if (!ollamaOnline) return;
      pipelineRef.current = true;
      setPipelineBusy(true);
      try {
        const everyN =
          settings.summaryEveryN ?? SUMMARY_EVERY_N_MESSAGES;
        const numCtx = normalizeContextSize(settings.contextSize);
        const sess =
          sessionsRef.current.find((x) => x.id === sessionId) ?? null;
        const char = resolveCharacter(
          charactersRef.current,
          sess?.characterId,
          settingsRef.current.defaultCharacterId || DEFAULT_CHARACTER.id,
        );
        const result = await runMemoryPipeline({
          store: memoryStoreRef.current,
          sessionId,
          messages,
          model,
          memoryEnabled: true,
          character: char,
          force,
          everyN,
          numCtx,
        });
        setMemoryStore(result.store);
        if (result.didSummary) {
          const detail = formatMemoryJobSummary(
            {
              didSummary: result.didSummary,
              labels: result.updatedLabels,
              layerCounts: result.layerCounts,
            },
            settings.locale,
          );
          const compressHint =
            settings.locale === "en"
              ? "Compressed older turns into summary"
              : "已将更早对话压缩为摘要";
          const n =
            result.updatedLabels.length ||
            result.layerCounts.L3 +
              result.layerCounts.L4 +
              result.layerCounts.L5 ||
            1;
          setToast({
            count: n,
            labels: result.updatedLabels.length
              ? result.updatedLabels
              : [compressHint],
            detail: `${compressHint} · ${detail}`,
          });
        }
      } catch {
        /* non-fatal */
      } finally {
        pipelineRef.current = false;
        setPipelineBusy(false);
      }
    },
    [
      ollamaOnline,
      settings.locale,
      settings.memoryEnabled,
      settings.contextSize,
      settings.summaryEveryN,
    ],
  );

  const runMemoryNow = useCallback(() => {
    if (!active || !settings.memoryEnabled) return;
    if (active.messages.length < 2) return;
    const model = resolveModelName(
      active.modelId || settings.defaultModelId,
      ollamaModels,
    );
    void scheduleMemoryJob(active.id, active.messages, model, true);
  }, [
    active,
    ollamaModels,
    scheduleMemoryJob,
    settings.defaultModelId,
    settings.memoryEnabled,
  ]);

  const rememberText = useCallback(
    async (raw: string) => {
      if (!active || !settings.memoryEnabled) return;
      const text = raw.trim();
      if (!text) return;
      const model = resolveModelName(
        active.modelId || settings.defaultModelId,
        ollamaModels,
      );
      setRememberBusy(true);
      setLastError(null);
      try {
        const char = resolveCharacter(
          charactersRef.current,
          active.characterId,
          settingsRef.current.defaultCharacterId || DEFAULT_CHARACTER.id,
        );
        const result = await rememberExplicitText({
          store: memoryStoreRef.current,
          sessionId: active.id,
          text,
          model,
          character: char,
        });
        if (result.error === "empty") return;
        if (result.pendingSensitive) {
          setSensitivePending(result.pendingSensitive);
          return;
        }
        setMemoryStore(result.store);
        if (result.labels.length > 0) {
          setToast({ count: result.labels.length, labels: result.labels });
        }
      } catch (e) {
        setLastError(e instanceof Error ? e.message : String(e));
      } finally {
        setRememberBusy(false);
      }
    },
    [active, ollamaModels, settings.defaultModelId, settings.memoryEnabled],
  );

  const confirmSensitiveSave = useCallback(() => {
    if (!sensitivePending) return;
    const { store, labels } = commitPendingSensitive(
      memoryStoreRef.current,
      sensitivePending.items,
    );
    setMemoryStore(store);
    setSensitivePending(null);
    if (labels.length > 0) {
      setToast({ count: labels.length, labels });
    }
  }, [sensitivePending]);

  const cancelSensitiveSave = useCallback(() => {
    setSensitivePending(null);
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || !active || generating) return;

    const sNow = settingsRef.current;

    if (!ollamaOnline) {
      setLastError(
        humanizeError("connect_failed", sNow.locale) || dict.ollamaOfflineHint,
      );
      return;
    }

    if (ollamaModels.length === 0) {
      setLastError(humanizeError("no models", sNow.locale));
      return;
    }

    const preferredModel = (
      active.modelId ||
      sNow.defaultModelId ||
      ""
    ).trim();
    const model = resolveModelName(preferredModel, ollamaModels);
    if (!ollamaModels.includes(model) && !ollamaModels.some((m) => m.startsWith(`${model}:`))) {
      setLastError(humanizeError(`model '${preferredModel || "?"}' not found`, sNow.locale));
      return;
    }
    // Heal session if we remapped to an installed name
    if (model && model !== active.modelId) {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === active.id
            ? { ...s, modelId: model, updatedAt: Date.now() }
            : s,
        ),
      );
      if (!sNow.defaultModelId || sNow.defaultModelId === preferredModel) {
        setSettings((s) => ({ ...s, defaultModelId: model }));
      }
    }

    const rememberMatch = text.match(
      /^(?:请)?记住(?:这个|一下|：|:)?\s*(.+)$/s,
    );
    if (rememberMatch?.[1] && sNow.memoryEnabled) {
      void rememberText(rememberMatch[1]);
    } else if (
      sNow.memoryEnabled &&
      /(请记住|帮我记住|记下来)/.test(text)
    ) {
      void rememberText(text);
    }

    const sessionId = active.id;
    const sessionCharacter = resolveCharacter(
      charactersRef.current,
      active.characterId,
      sNow.defaultCharacterId || DEFAULT_CHARACTER.id,
    );
    const characterName = displayCharacterName(
      sessionCharacter,
      sNow.locale,
    );

    const userMsg: Message = {
      id: uid("msg"),
      role: "user",
      content: text,
      createdAt: Date.now(),
    };
    const assistantId = uid("msg");
    const assistantMsg: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      characterId: sessionCharacter.id,
      characterName,
    };

    const title =
      active.messages.length === 0
        ? text.slice(0, 28) + (text.length > 28 ? "…" : "")
        : active.title;

    const historyForModel = [...active.messages, userMsg];
    // settingsRef already snapped to sNow above
    const contextSize = normalizeContextSize(sNow.contextSize);
    const answerLength = sNow.answerLength ?? "normal";
    const showThinking = sNow.showThinking !== false;

    // Rolling pack: cold history only via memory/summaries; hot under budget
    const assembled = assembleChatContext({
      messages: historyForModel,
      sessionId,
      store: memoryStoreRef.current,
      locale: sNow.locale,
      answerLength,
      memoryEnabled: Boolean(sNow.memoryEnabled),
      showThinking,
      contextSize,
      character: sessionCharacter,
    });
    const hot = assembled.hotMessages;
    const fullSystem = assembled.systemPrompt;
    setAssembledBudget(assembled.budget);
    setUsageCtxLimit(assembled.budget.limit);

    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              title,
              updatedAt: Date.now(),
              messages: [...s.messages, userMsg, assistantMsg],
            }
          : s,
      ),
    );
    setInput("");
    setGenerating(true);
    setLastError(null);

    const ac = new AbortController();
    abortRef.current = ac;

    const ollamaMessages = toOllamaMessages(hot, fullSystem);
    const genOptions = genOptionsForChat(
      answerLength,
      contextSize,
      showThinking,
    );
    // Real Ollama usage clears until this turn finishes; keep packed estimate visible
    setTokenUsage(null);

    // Kick rolling compress for cold region (does not block this turn)
    if (sNow.memoryEnabled && assembled.budget.coldCount >= 2) {
      void scheduleMemoryJob(sessionId, historyForModel, model, false);
    }

    const truncNote =
      sNow.locale === "en"
        ? "\n\n—\n[Stopped early: generation limit reached. Try a larger Context (8K/16K), Concise length off, or turn off Show thinking.]"
        : "\n\n—\n【回答因生成长度上限中途停止。可尝试：更大上下文 8K/16K、关闭「精简」、或关闭「显示思考」以把额度留给正文。】";

    try {
      let acc = "";
      let thinkAcc = "";
      let doneReason: string | undefined;
      for await (const chunk of streamOllamaChat({
        model,
        messages: ollamaMessages,
        signal: ac.signal,
        showThinking,
        genOptions,
      })) {
        if (chunk.error && chunk.error !== "aborted") {
          const friendly = humanizeError(chunk.error, sNow.locale);
          setLastError(friendly);
          if (!acc) {
            const errText = `${dict.generateFailed}\n${friendly}`;
            setSessions((prev) =>
              prev.map((s) =>
                s.id === sessionId
                  ? {
                      ...s,
                      updatedAt: Date.now(),
                      messages: s.messages.map((m) =>
                        m.id === assistantId ? { ...m, content: errText } : m,
                      ),
                    }
                  : s,
              ),
            );
          }
          break;
        }
        if (chunk.doneReason) doneReason = chunk.doneReason;
        if (chunk.usage) setTokenUsage(chunk.usage);
        let changed = false;
        if (chunk.thinkingDelta) {
          thinkAcc += chunk.thinkingDelta;
          changed = true;
        }
        if (chunk.contentDelta) {
          acc += chunk.contentDelta;
          changed = true;
        }
        if (changed) {
          const contentSnap = acc;
          const thinkSnap = thinkAcc;
          setSessions((prev) =>
            prev.map((s) =>
              s.id === sessionId
                ? {
                    ...s,
                    updatedAt: Date.now(),
                    messages: s.messages.map((m) =>
                      m.id === assistantId
                        ? {
                            ...m,
                            content: contentSnap,
                            thinking: thinkSnap || undefined,
                          }
                        : m,
                    ),
                  }
                : s,
            ),
          );
        }
      }

      if (ac.signal.aborted && !acc) {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  messages: s.messages.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: dict.stopped }
                      : m,
                  ),
                }
              : s,
          ),
        );
      }

      // Hit num_predict / context budget — append a clear tip (not a hard error)
      if (
        !ac.signal.aborted &&
        doneReason === "length" &&
        !acc.includes("生成长度上限") &&
        !acc.includes("generation limit")
      ) {
        acc = (acc || "").trimEnd() + truncNote;
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  updatedAt: Date.now(),
                  messages: s.messages.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          content: acc,
                          thinking: thinkAcc || undefined,
                        }
                      : m,
                  ),
                }
              : s,
          ),
        );
        setLastError(humanizeError("done_reason length", sNow.locale));
      }

      if (!ac.signal.aborted && acc) {
        const finalMessages = [
          ...historyForModel,
          {
            ...assistantMsg,
            content: acc,
            thinking: thinkAcc || undefined,
          },
        ];
        void scheduleMemoryJob(sessionId, finalMessages, model);
      }
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      setGenerating(false);
    }
  }, [
    active,
    dict,
    generating,
    input,
    ollamaModels,
    ollamaOnline,
    rememberText,
    scheduleMemoryJob,
  ]);

  const editMemory = useCallback((id: string, object: string) => {
    setMemoryStore((s) => updateMemoryObject(s, id, object));
  }, []);

  const deleteMemory = useCallback((id: string) => {
    setMemoryStore((s) => softDeleteMemory(s, id));
  }, []);

  const clearMemories = useCallback(() => {
    setMemoryStore((s) => clearAllMemories(s));
    setToast(null);
  }, []);

  const memories = useMemo(() => {
    const all = activeMemories(memoryStore);
    return memoriesForPanel(all, {
      isMeta: isMetaCharacter(character),
      characterId: character.id,
    });
  }, [memoryStore, character]);

  /**
   * After pull/import: re-probe models; optionally switch active session to it.
   */
  const afterModelPulled = useCallback(
    async (modelId: string, switchTo = true) => {
      const short = modelId.replace(/:latest$/, "");
      await engineApi.refresh();
      if (switchTo) {
        setSessionModel(short);
      }
    },
    [engineApi, setSessionModel],
  );

  return {
    ready,
    bootError,
    dict,
    settings,
    sessions,
    active,
    activeId,
    setActiveId: selectSession,
    input,
    setInput,
    generating,
    lastError,
    ollamaOnline,
    ollamaModels,
    engine: engineApi.engine,
    engineGuideOpen: engineApi.guideOpen,
    setEngineGuideOpen: engineApi.setGuideOpen,
    engineStart: engineApi.startEngine,
    engineRefresh: engineApi.refresh,
    engineOpenInstall: engineApi.openInstallPage,
    engineAfterInstall: engineApi.afterInstallRecheck,
    setSessionModel,
    characters,
    character,
    defaultCharacterId,
    setSessionCharacter,
    setDefaultCharacter,
    saveCharacterCard,
    deleteCharacterCard,
    replaceCharacters,
    model: DEFAULT_MODEL,
    setLocale,
    patchSettings,
    toggleMemory,
    settingsOpen,
    setSettingsOpen,
    modelHubOpen,
    setModelHubOpen,
    characterHubOpen,
    setCharacterHubOpen,
    afterModelPulled,
    tokenUsage,
    usageCtxLimit,
    assembledBudget,
    exportBackup,
    importBackupFile,
    newSession,
    deleteSession,
    renameSession,
    chatFolders,
    newFolder,
    renameFolder,
    deleteFolder,
    toggleFolderCollapsed,
    moveSessionToFolder,
    send,
    stop,
    memories,
    memoryStore,
    memoryOpen,
    setMemoryOpen,
    pipelineBusy,
    toast,
    dismissToast: () => setToast(null),
    editMemory,
    deleteMemory,
    clearMemories,
    runMemoryNow,
    rememberText,
    rememberBusy,
    sensitivePending,
    confirmSensitiveSave,
    cancelSensitiveSave,
    reloadFromDisk: async () => {
      try {
        const [s, sess, mem, chars] = await Promise.all([
          loadSettingsFromDb(defaultSettings),
          loadAllSessions(),
          loadMemoryStoreFromDb(),
          loadCharacters(),
        ]);
        const charsOk = ensureBuiltin(chars);
        const defChar =
          s.defaultCharacterId &&
          charsOk.some((c) => c.id === s.defaultCharacterId)
            ? s.defaultCharacterId
            : DEFAULT_CHARACTER.id;
        const settingsOk = { ...s, defaultCharacterId: defChar };
        let nextSessions = sess;
        if (nextSessions.length === 0) {
          nextSessions = [
            createSession(
              settingsOk.locale,
              settingsOk.defaultModelId,
              defChar,
            ),
          ];
          await replaceAllSessions(nextSessions);
        }
        setSettings(settingsOk);
        setCharacters(charsOk);
        setSessions(nextSessions);
        setActiveId(nextSessions[0].id);
        setMemoryStore(
          migrateMemoryStoreScopes(mem, DEFAULT_CHARACTER.id),
        );
        resetContextUsage();
      } catch (e) {
        console.error("reloadFromDisk failed", e);
      }
    },
    completeOnboarding: () => {
      patchSettings({ onboardingDone: true });
    },
    needsOnboarding: settings.onboardingDone !== true,
  };
}
