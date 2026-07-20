import { useCallback, useEffect, useRef, useState } from "react";
import { OLLAMA_DOWNLOAD_URL, waitUntilOnline } from "../lib/engine/probe";
import { openExternalUrl } from "../lib/engine/platform";
import { checkingSnapshot, refreshEngine } from "../lib/engine/stateMachine";
import type { EngineSnapshot } from "../lib/engine/types";
import type { Locale } from "../types";

export function useEngine(locale: Locale) {
  const [engine, setEngine] = useState<EngineSnapshot>(() => checkingSnapshot());
  const [guideOpen, setGuideOpen] = useState(false);
  const booted = useRef(false);
  const startOnce = useRef(false);
  /** Prevent light poll from overwriting while start is in flight. */
  const startingLock = useRef(false);

  const refresh = useCallback(
    async (opts?: { tryStart?: boolean; forceDetect?: boolean }) => {
      const tryStart = Boolean(opts?.tryStart);
      if (tryStart) {
        startingLock.current = true;
        setEngine((e) => ({
          ...e,
          phase: "starting",
          message: locale === "en" ? "Starting…" : "启动中…",
          lastError: null,
          updatedAt: Date.now(),
        }));
      }
      try {
        const snap = await refreshEngine({
          tryStart,
          forceDetect: opts?.forceDetect,
          locale,
        });
        setEngine(snap);
        // Only auto-open guide on first not_installed, not every poll
        if (snap.phase === "not_installed" && !booted.current) {
          setGuideOpen(true);
        }
        return snap;
      } finally {
        if (tryStart) startingLock.current = false;
      }
    },
    [locale],
  );

  const startEngine = useCallback(async () => {
    return refresh({ tryStart: true, forceDetect: true });
  }, [refresh]);

  const openInstallPage = useCallback(async () => {
    await openExternalUrl(OLLAMA_DOWNLOAD_URL);
  }, []);

  // Boot once: probe → if desktop offline, start serve once (silent)
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    void (async () => {
      const first = await refreshEngine({
        tryStart: false,
        forceDetect: true,
        locale,
      });
      setEngine(first);
      if (first.phase === "online") return;
      if (first.phase === "not_installed") {
        setGuideOpen(true);
        return;
      }
      if (first.isDesktop && first.phase === "offline" && !startOnce.current) {
        startOnce.current = true;
        startingLock.current = true;
        setEngine((e) => ({
          ...e,
          phase: "starting",
          message: locale === "en" ? "Starting…" : "启动中…",
          updatedAt: Date.now(),
        }));
        try {
          const second = await refreshEngine({ tryStart: true, locale });
          setEngine(second);
          if (second.phase === "not_installed") setGuideOpen(true);
        } finally {
          startingLock.current = false;
        }
      }
    })();
  }, [locale]);

  // Light poll: HTTP only — never spawn processes / where.exe
  // Skip entirely while start is in flight (avoid offline flash).
  useEffect(() => {
    const id = window.setInterval(() => {
      if (startingLock.current) return;
      void (async () => {
        if (startingLock.current) return;
        const snap = await refreshEngine({
          tryStart: false,
          // When online, light probe is enough; when offline, still detect path once via cache
          probeOnly: true,
          forceDetect: false,
          locale,
        });
        if (startingLock.current) return;
        setEngine((prev) => {
          // Don't clobber starting / error mid-action with a bare offline poll
          if (prev.phase === "starting") return prev;
          if (snap.phase === "online") {
            return {
              ...snap,
              installPath: snap.installPath ?? prev.installPath,
            };
          }
          // Offline poll: keep install path; if we believed we were online, flip to offline
          if (prev.phase === "online") {
            return {
              ...snap,
              phase: "offline",
              installPath: prev.installPath,
              message:
                locale === "en"
                  ? "Local engine is not responding."
                  : "本地引擎暂未响应。",
            };
          }
          // Stay on offline / error / not_installed without rewriting message every 15s
          return {
            ...prev,
            models: snap.models,
            version: snap.version ?? prev.version,
            updatedAt: Date.now(),
          };
        });
      })();
    }, 15000);
    return () => window.clearInterval(id);
  }, [locale]);

  const afterInstallRecheck = useCallback(async () => {
    setGuideOpen(false);
    startingLock.current = true;
    try {
      const snap = await refreshEngine({
        tryStart: true,
        forceDetect: true,
        locale,
      });
      setEngine(snap);
      if (snap.phase === "online") return;
      const up = await waitUntilOnline(15000);
      if (up) {
        const again = await refreshEngine({ tryStart: false, locale });
        setEngine(again);
      } else if (snap.phase === "not_installed") {
        setGuideOpen(true);
      }
    } finally {
      startingLock.current = false;
    }
  }, [locale]);

  return {
    engine,
    guideOpen,
    setGuideOpen,
    refresh: () => refresh({ tryStart: false, forceDetect: true }),
    startEngine,
    openInstallPage,
    afterInstallRecheck,
    online: engine.phase === "online",
    models: engine.models,
    visionModels: engine.visionModels ?? [],
  };
}
