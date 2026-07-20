import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_CHARACTER, DEFAULT_MODEL } from "../data/defaults";
import { t } from "../i18n";
import {
  loadAllSessions,
  loadMemoryStoreFromDb,
  loadSettingsFromDb,
  migrateFromLocalStorageIfNeeded,
  replaceAllSessions,
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
import { rememberExplicitText } from "../lib/memory/rememberExplicit";
import {
  isMetaCharacter,
  memoriesForPanel,
  migrateMemoryStoreScopes,
} from "../lib/memory/scope";
import {
  activeMemories,
  clearAllMemories,
  loadMemoryStore,
  softDeleteMemory,
  updateMemoryObject,
  updateMemoryOwnership,
} from "../lib/memory/store";
import { loadSessions, loadSettings } from "../lib/storage";
import type { MemoryStoreData } from "../types/memory";
import { genOptionsForChat, normalizeContextSize } from "../lib/chatPrompt";
import { humanizeError } from "../lib/errors";
import {
  generateActivity,
  IDLE_ACTIVITY,
  loadActivity,
  pullActivity,
  visionActivity,
  type EngineActivity,
} from "../lib/engine/activity";
import {
  resolveModelName,
  streamOllamaChat,
  toOllamaMessages,
  warmModel,
  type TokenUsage,
} from "../lib/ollama";
import {
  VisionCompressException,
  compressImageDataUrl,
  compressImageFile,
  describeImage,
  formatImageInjectedContent,
  mapVisionCompressError,
  pickVisionModel,
  visionInstallHint,
  type PendingChatImage,
} from "../lib/vision";
import type { PullProgress } from "../lib/models/pull";
import { useEngine } from "./useEngine";
import { usePersistence } from "./usePersistence";
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
    scopeMigrated: true,
    scopeVersion: 2,
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
  /** Composer attachment: described on send, never stored in message history. */
  const [pendingImage, setPendingImage] = useState<PendingChatImage | null>(
    null,
  );
  const pendingImageRef = useRef<PendingChatImage | null>(null);
  const [attachBusy, setAttachBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [memoryStore, setMemoryStore] = useState<MemoryStoreData>(emptyMemory);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modelHubOpen, setModelHubOpen] = useState(false);
  const [characterHubOpen, setCharacterHubOpen] = useState(false);
  /** Top-bar engine activity: pull / VRAM load (beyond raw online/offline). */
  const [engineActivity, setEngineActivity] =
    useState<EngineActivity>(IDLE_ACTIVITY);
  const warmAbortRef = useRef<AbortController | null>(null);
  /** Last model that completed a chat/warm successfully (weights likely resident). */
  const residentModelRef = useRef<string | null>(null);
  /** True only while assistant stream is running — memory jobs defer in this window. */
  const generatingRef = useRef(false);
  /** Abort in-flight memory pipeline when user starts a new generation. */
  const memoryAbortRef = useRef<AbortController | null>(null);
  /** Job to run once generation ends (or after an aborted pipeline). */
  const pendingMemoryRef = useRef<{
    sessionId: string;
    messages: Message[];
    model: string;
    force: boolean;
  } | null>(null);
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
  const visionModels = engineApi.visionModels;
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

  const { persistenceError } = usePersistence({
    ready,
    sessions,
    settings,
    characters,
    memoryStore,
  });

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

  const clearPendingImage = useCallback(() => {
    pendingImageRef.current = null;
    setPendingImage(null);
  }, []);

  const attachImageFile = useCallback(
    async (file: File) => {
      if (generatingRef.current) return;
      setAttachBusy(true);
      setLastError(null);
      try {
        const compressed = await compressImageFile(file);
        const next: PendingChatImage = {
          id: uid("img"),
          previewUrl: compressed.previewUrl,
          base64: compressed.base64,
          name: file.name || undefined,
        };
        pendingImageRef.current = next;
        setPendingImage(next);
      } catch (e) {
        const code =
          e instanceof VisionCompressException
            ? e.code
            : e instanceof Error
              ? e.message
              : "failed";
        setLastError(mapVisionCompressError(code, dict));
      } finally {
        setAttachBusy(false);
      }
    },
    [dict],
  );

  const selectSession = useCallback(
    (id: string) => {
      setActiveId(id);
      setLastError(null);
      clearPendingImage();
      resetContextUsage();
    },
    [resetContextUsage, clearPendingImage],
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
    clearPendingImage();
    setLastError(null);
    resetContextUsage();
  }, [
    settings.locale,
    settings.defaultModelId,
    settings.defaultCharacterId,
    resetContextUsage,
    clearPendingImage,
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

  const reportPullProgress = useCallback(
    (modelId: string, p: PullProgress | null) => {
      const locale = settingsRef.current.locale;
      if (!p) {
        setEngineActivity((a) => (a.kind === "pull" ? IDLE_ACTIVITY : a));
        return;
      }
      setEngineActivity(
        pullActivity(modelId, p.percent, p.status || "", locale),
      );
    },
    [],
  );

  const warmSessionModel = useCallback(async (modelId: string) => {
    const id = modelId.trim();
    if (!id) return;
    // Already warmed / used this session — skip redundant load (expensive)
    if (residentModelRef.current === id) return;
    const locale = settingsRef.current.locale;
    warmAbortRef.current?.abort();
    const ac = new AbortController();
    warmAbortRef.current = ac;
    setEngineActivity(loadActivity(id, locale));
    try {
      const numCtx = normalizeContextSize(settingsRef.current.contextSize);
      const r = await warmModel(id, { signal: ac.signal, numCtx });
      if (r.ok) residentModelRef.current = id;
    } finally {
      if (warmAbortRef.current === ac) {
        warmAbortRef.current = null;
        setEngineActivity((a) => (a.kind === "load" ? IDLE_ACTIVITY : a));
      }
    }
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
      if (engineApi.online) {
        void warmSessionModel(id);
      }
    },
    [active, engineApi.online, warmSessionModel],
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


  const scheduleMemoryJob = useCallback(
    async (
      sessionId: string,
      messages: Message[],
      model: string,
      force = false,
    ) => {
      if (!settingsRef.current.memoryEnabled) return;
      if (!ollamaOnline) return;

      // Only defer while the assistant is generating. Typing time is free for memory.
      if (generatingRef.current) {
        pendingMemoryRef.current = { sessionId, messages, model, force };
        return;
      }

      // Newer request while a job is running: queue latest work after current finishes
      if (pipelineRef.current) {
        pendingMemoryRef.current = { sessionId, messages, model, force };
        return;
      }

      const ac = new AbortController();
      memoryAbortRef.current = ac;
      pipelineRef.current = true;
      setPipelineBusy(true);
      try {
        // If user starts generating mid-job, abort promptly
        if (generatingRef.current) {
          pendingMemoryRef.current = { sessionId, messages, model, force };
          return;
        }
        const everyN =
          settingsRef.current.summaryEveryN ?? SUMMARY_EVERY_N_MESSAGES;
        const numCtx = normalizeContextSize(settingsRef.current.contextSize);
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
          signal: ac.signal,
        });
        if (ac.signal.aborted || generatingRef.current) {
          // Interrupted by a new chat turn — leave pending if set by send()
          return;
        }
        setMemoryStore(result.store);
        if (result.didSummary) {
          const detail = formatMemoryJobSummary(
            {
              didSummary: result.didSummary,
              labels: result.updatedLabels,
              layerCounts: result.layerCounts,
            },
            settingsRef.current.locale,
          );
          const compressHint =
            settingsRef.current.locale === "en"
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
        /* non-fatal / aborted */
      } finally {
        pipelineRef.current = false;
        if (memoryAbortRef.current === ac) memoryAbortRef.current = null;
        setPipelineBusy(false);
        const next = pendingMemoryRef.current;
        if (next && !generatingRef.current) {
          pendingMemoryRef.current = null;
          void scheduleMemoryJob(
            next.sessionId,
            next.messages,
            next.model,
            next.force,
          );
        }
      }
    },
    [ollamaOnline],
  );

  /** Stop generation; memory may resume while user types. */
  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    generatingRef.current = false;
    setGenerating(false);
    setEngineActivity((a) =>
      a.kind === "load" ||
      a.kind === "generate" ||
      a.kind === "vision"
        ? IDLE_ACTIVITY
        : a,
    );
    const p = pendingMemoryRef.current;
    if (p) {
      pendingMemoryRef.current = null;
      void scheduleMemoryJob(p.sessionId, p.messages, p.model, p.force);
    }
  }, [scheduleMemoryJob]);

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

  const send = useCallback(async () => {
    const text = input.trim();
    const attached = pendingImageRef.current;
    if ((!text && !attached) || !active || generating) return;

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

    // Claim GPU early: vision describe + chat are one atomic turn for the user
    generatingRef.current = true;
    memoryAbortRef.current?.abort();
    setGenerating(true);
    setLastError(null);

    const ac = new AbortController();
    abortRef.current = ac;

    let finalUserContent = text;
    // Vision → text: describe once, then only text enters history / assemble
    if (attached) {
      const visionModel = pickVisionModel({
        available: ollamaModels,
        visionCapable: visionModels,
        preferred: null,
        chatModel: model,
      });
      if (!visionModel) {
        generatingRef.current = false;
        setGenerating(false);
        setEngineActivity(IDLE_ACTIVITY);
        abortRef.current = null;
        setLastError(
          `${dict.visionNoModel}\n${visionInstallHint(sNow.locale)}`,
        );
        return;
      }
      setEngineActivity(visionActivity(visionModel, sNow.locale));
      try {
        const desc = await describeImage({
          model: visionModel,
          base64: attached.base64,
          locale: sNow.locale,
          mode: "chat",
          signal: ac.signal,
          numCtx: Math.min(4096, normalizeContextSize(sNow.contextSize)),
        });
        finalUserContent = formatImageInjectedContent(
          desc,
          text,
          sNow.locale,
        );
        // Drop pixels immediately — never land in Message / memory payload
        clearPendingImage();
        // Vision model may have replaced chat weights in VRAM
        if (visionModel !== model) {
          residentModelRef.current = null;
        } else {
          residentModelRef.current = visionModel;
        }
      } catch (e) {
        if (ac.signal.aborted) {
          generatingRef.current = false;
          setGenerating(false);
          setEngineActivity(IDLE_ACTIVITY);
          abortRef.current = null;
          return;
        }
        const msg = e instanceof Error ? e.message : String(e);
        generatingRef.current = false;
        setGenerating(false);
        setEngineActivity(IDLE_ACTIVITY);
        abortRef.current = null;
        if (
          /vision_not_multimodal|vision_model_not_found|does not support images|multimodal/i.test(
            msg,
          )
        ) {
          setLastError(
            `${dict.visionFailed}: ${dict.visionNoModel}\n${visionInstallHint(sNow.locale)}`,
          );
        } else {
          setLastError(
            `${dict.visionFailed}: ${humanizeError(msg, sNow.locale)}`,
          );
        }
        return;
      }
    }

    if (!finalUserContent.trim()) {
      generatingRef.current = false;
      setGenerating(false);
      setEngineActivity(IDLE_ACTIVITY);
      abortRef.current = null;
      return;
    }

    const rememberMatch = finalUserContent.match(
      /^(?:请)?记住(?:这个|一下|：|:)?\s*(.+)$/s,
    );
    if (rememberMatch?.[1] && sNow.memoryEnabled) {
      void rememberText(rememberMatch[1]);
    } else if (
      sNow.memoryEnabled &&
      /(请记住|帮我记住|记下来)/.test(finalUserContent)
    ) {
      void rememberText(finalUserContent);
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
      content: finalUserContent,
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

    const titleSeed =
      text ||
      (sNow.locale === "en" ? "Image" : "图片");
    const title =
      active.messages.length === 0
        ? titleSeed.slice(0, 28) + (titleSeed.length > 28 ? "…" : "")
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
      characterCatalog: charactersRef.current,
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
    // Only show load when weights not resident; else generating
    const needLoad = residentModelRef.current !== model;
    setEngineActivity(
      needLoad
        ? loadActivity(model, sNow.locale)
        : generateActivity(model, sNow.locale),
    );

    const ollamaMessages = toOllamaMessages(hot, fullSystem);
    const genOptions = genOptionsForChat(
      answerLength,
      contextSize,
      showThinking,
    );
    // Real Ollama usage clears until this turn finishes; keep packed estimate visible
    setTokenUsage(null);

    // IMPORTANT: do NOT run memory pipeline in parallel with generation.
    // Same GPU + different num_ctx / concurrent requests thrash Ollama and
    // make every turn feel like a model reload (unlike bare Ollama / LM Studio).

    const truncNote =
      sNow.locale === "en"
        ? "\n\n—\n[Stopped early: generation limit reached. Try a larger Context (8K/16K), Concise length off, or turn off Show thinking.]"
        : "\n\n—\n【回答因生成长度上限中途停止。可尝试：更大上下文 8K/16K、关闭「精简」、或关闭「显示思考」以把额度留给正文。】";

    try {
      let acc = "";
      let thinkAcc = "";
      let doneReason: string | undefined;
      let sawOutput = false;
      for await (const chunk of streamOllamaChat({
        model,
        messages: ollamaMessages,
        signal: ac.signal,
        showThinking,
        genOptions,
      })) {
        if (
          !sawOutput &&
          (chunk.contentDelta ||
            chunk.thinkingDelta ||
            chunk.done ||
            chunk.error)
        ) {
          sawOutput = true;
          // First token: weights are in; switch load 鈫?generate (or clear if done)
          if (chunk.contentDelta || chunk.thinkingDelta) {
            residentModelRef.current = model;
            setEngineActivity(generateActivity(model, sNow.locale));
          } else {
            setEngineActivity((a) =>
              a.kind === "load" || a.kind === "generate" ? IDLE_ACTIVITY : a,
            );
          }
        }
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

      // Hit num_predict / context budget 鈥?append a clear tip (not a hard error)
      if (
        !ac.signal.aborted &&
        doneReason === "length" &&
        !acc.includes("鐢熸垚闀垮害涓婇檺") &&
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
        // Queue memory for after generation flag clears (user reading/typing window)
        pendingMemoryRef.current = {
          sessionId,
          messages: finalMessages,
          model,
          force: false,
        };
      }
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      generatingRef.current = false;
      setGenerating(false);
      setEngineActivity((a) =>
        a.kind === "load" ||
        a.kind === "generate" ||
        a.kind === "vision"
          ? IDLE_ACTIVITY
          : a,
      );
      // Now free to summarize while human reads / types next message
      const p = pendingMemoryRef.current;
      if (p && sNow.memoryEnabled) {
        pendingMemoryRef.current = null;
        void scheduleMemoryJob(p.sessionId, p.messages, p.model, p.force);
      }
    }
  }, [
    active,
    clearPendingImage,
    dict,
    generating,
    input,
    ollamaModels,
    ollamaOnline,
    rememberText,
    scheduleMemoryJob,
    visionModels,
  ]);

  /**
   * Optional: describe character portrait into text (fills description field).
   * Deferred while chat is generating (same GPU policy as memory).
   */
  const describePortraitFromArt = useCallback(
    async (dataUrl: string): Promise<string> => {
      if (generatingRef.current) {
        throw new Error("busy_generating");
      }
      if (!ollamaOnline || ollamaModels.length === 0) {
        throw new Error("engine_offline");
      }
      const chatModel = resolveModelName(
        active?.modelId || settingsRef.current.defaultModelId || "",
        ollamaModels,
      );
      const visionModel = pickVisionModel({
        available: ollamaModels,
        visionCapable: visionModels,
        preferred: null,
        chatModel,
      });
      if (!visionModel) {
        throw new Error("vision_no_model");
      }
      const locale = settingsRef.current.locale;
      setEngineActivity(visionActivity(visionModel, locale));
      try {
        const compressed = await compressImageDataUrl(dataUrl);
        const desc = await describeImage({
          model: visionModel,
          base64: compressed.base64,
          locale,
          mode: "character",
          signal: AbortSignal.timeout(180_000),
          numCtx: 4096,
        });
        if (visionModel !== chatModel) {
          residentModelRef.current = null;
        }
        return desc;
      } finally {
        setEngineActivity((a) =>
          a.kind === "vision" ? IDLE_ACTIVITY : a,
        );
      }
    },
    [active?.modelId, ollamaModels, ollamaOnline, visionModels],
  );

  const editMemory = useCallback((id: string, object: string) => {
    setMemoryStore((s) => updateMemoryObject(s, id, object));
  }, []);

  const assignMemory = useCallback(
    (id: string, scope: "master" | "character" | "orphan", characterId?: string) => {
      setMemoryStore((store) =>
        updateMemoryOwnership(store, id, { scope, characterId }),
      );
    },
    [],
  );

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
      setEngineActivity((a) => (a.kind === "pull" ? IDLE_ACTIVITY : a));
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
    persistenceError,
    dict,
    settings,
    sessions,
    active,
    activeId,
    setActiveId: selectSession,
    input,
    setInput,
    pendingImage,
    attachBusy,
    attachImageFile,
    clearPendingImage,
    describePortraitFromArt,
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
    engineActivity,
    reportPullProgress,
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
    assignMemory,
    deleteMemory,
    clearMemories,
    runMemoryNow,
    rememberText,
    rememberBusy,
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
