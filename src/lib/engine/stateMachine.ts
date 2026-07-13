import {
  detectOllamaInstall,
  probeOllamaApi,
  startOllamaServe,
} from "./probe";
import type { EngineSnapshot } from "./types";
import { isTauri } from "./platform";

function base(): Omit<EngineSnapshot, "phase" | "message" | "updatedAt"> {
  return {
    models: [],
    installPath: null,
    version: null,
    lastError: null,
    isDesktop: isTauri(),
  };
}

export function checkingSnapshot(): EngineSnapshot {
  return {
    ...base(),
    phase: "checking",
    message: "checking",
    updatedAt: Date.now(),
  };
}

/**
 * Refresh engine status.
 * - Prefer HTTP probe only (no process spawn).
 * - Disk detect is cached in Rust; pass forceDetect only on manual retry.
 * - tryStart spawns serve at most when explicitly requested.
 */
export async function refreshEngine(options?: {
  tryStart?: boolean;
  forceDetect?: boolean;
  /** When true, skip disk detect if HTTP fails — only used for light polling. */
  probeOnly?: boolean;
  locale?: "zh" | "en";
}): Promise<EngineSnapshot> {
  const locale = options?.locale ?? "zh";
  const t = (zh: string, en: string) => (locale === "en" ? en : zh);
  const desktop = isTauri();

  const api = await probeOllamaApi();
  if (api.online) {
    return {
      phase: "online",
      message: t("本地引擎就绪", "Local engine ready"),
      models: api.models,
      installPath: null,
      version: api.version,
      lastError: null,
      isDesktop: desktop,
      updatedAt: Date.now(),
    };
  }

  if (options?.probeOnly) {
    return {
      phase: "offline",
      message: t(
        "本地引擎暂未响应。",
        "Local engine is not responding.",
      ),
      models: [],
      installPath: null,
      version: null,
      lastError: null,
      isDesktop: desktop,
      updatedAt: Date.now(),
    };
  }

  const detect = await detectOllamaInstall(Boolean(options?.forceDetect));

  if (!detect.installed && !desktop) {
    return {
      phase: "offline",
      message: t(
        "本地引擎未运行。请确保已安装 Ollama；桌面版可自动启动。",
        "Local engine is not running. Install Ollama; desktop can auto-start it.",
      ),
      models: [],
      installPath: null,
      version: null,
      lastError: null,
      isDesktop: desktop,
      updatedAt: Date.now(),
    };
  }

  if (!detect.installed) {
    return {
      phase: "not_installed",
      message: t(
        "未检测到本地引擎（Ollama）。安装一次后，日常只需打开 Liora。",
        "Local engine (Ollama) not found. Install once; then only open Liora day-to-day.",
      ),
      models: [],
      installPath: null,
      version: null,
      lastError: null,
      isDesktop: desktop,
      updatedAt: Date.now(),
    };
  }

  if (options?.tryStart && desktop) {
    const started = await startOllamaServe();
    if (!started.ok) {
      return {
        phase: "error",
        message: t("启动本地引擎失败", "Failed to start local engine"),
        models: [],
        installPath: detect.path,
        version: detect.version,
        lastError: started.error ?? "start_failed",
        isDesktop: desktop,
        updatedAt: Date.now(),
      };
    }
    // Rust already waited until HTTP /api/tags answered.
    // Re-probe once for models list (and short retry if race).
    let again = await probeOllamaApi(4000);
    if (!again.online) {
      // brief settle for slow first response
      await new Promise((r) => setTimeout(r, 800));
      again = await probeOllamaApi(4000);
    }
    if (again.online) {
      return {
        phase: "online",
        message: t("本地引擎已启动", "Local engine started"),
        models: again.models,
        installPath: detect.path,
        version: again.version ?? detect.version,
        lastError: null,
        isDesktop: desktop,
        updatedAt: Date.now(),
      };
    }
    return {
      phase: "error",
      message: t(
        "引擎进程已拉起，但 API 仍不可用。请重试或检查防火墙。",
        "Engine process started but API is unreachable. Retry or check firewall.",
      ),
      models: [],
      installPath: detect.path,
      version: detect.version,
      lastError:
        started.error ??
        `start_method=${started.method ?? "?"} http_probe_failed`,
      isDesktop: desktop,
      updatedAt: Date.now(),
    };
  }

  return {
    phase: "offline",
    message: t(
      "本地引擎已安装但未运行。点击「启动引擎」即可，无需打开 Ollama 界面。",
      "Engine is installed but not running. Click Start — no need to open the Ollama app.",
    ),
    models: [],
    installPath: detect.path,
    version: detect.version,
    lastError: null,
    isDesktop: desktop,
    updatedAt: Date.now(),
  };
}
