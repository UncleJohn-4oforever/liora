import type { Dict } from "../i18n";
import type { EngineSnapshot } from "../lib/engine/types";
import type { Locale } from "../types";
import { ModelSelect } from "./ModelSelect";

interface Props {
  dict: Dict;
  locale: Locale;
  engine: EngineSnapshot;
  models: string[];
  currentModelId: string;
  onLocale: (l: Locale) => void;
  onOpenSettings: () => void;
  onModelChange: (id: string) => void;
  onEngineStart: () => void;
  onEngineRetry: () => void;
  onOpenEngineGuide: () => void;
  onOpenModelHub: () => void;
}

function phaseLabel(dict: Dict, engine: EngineSnapshot): string {
  switch (engine.phase) {
    case "online":
      return dict.engineOnline;
    case "checking":
      return dict.engineChecking;
    case "starting":
      return dict.engineStarting;
    case "not_installed":
      return dict.engineNotInstalled;
    case "error":
      return dict.engineError;
    default:
      return dict.engineOffline;
  }
}

export function TopBar({
  dict,
  locale,
  engine,
  models,
  currentModelId,
  onLocale,
  onOpenSettings,
  onModelChange,
  onEngineStart,
  onEngineRetry,
  onOpenEngineGuide,
  onOpenModelHub,
}: Props) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden />
        <div>
          <div className="brand-name">{dict.appName}</div>
          <div className="brand-tag">{dict.appTagline}</div>
        </div>
      </div>

      <div className="topbar-right">
        <div
          className={`status-pill status-engine-${engine.phase}`}
          title={engine.message}
        >
          <span className="dot" />
          {dict.engineLabel}: {phaseLabel(dict, engine)}
          {engine.phase === "online" && engine.version && (
            <span className="status-extra"> · {engine.version}</span>
          )}
        </div>

        {(engine.phase === "offline" || engine.phase === "error") &&
          engine.isDesktop && (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={onEngineStart}
            >
              {dict.engineStart}
            </button>
          )}
        {engine.phase === "not_installed" && (
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={onOpenEngineGuide}
          >
            {dict.engineInstallGuide}
          </button>
        )}
        {engine.phase !== "online" && engine.phase !== "checking" && (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={onEngineRetry}
          >
            {dict.engineRetry}
          </button>
        )}

        <ModelSelect
          dict={dict}
          models={models}
          value={currentModelId}
          disabled={engine.phase !== "online"}
          onChange={onModelChange}
        />

        <button
          type="button"
          className={`btn btn-sm ${models.length === 0 ? "btn-primary" : "btn-ghost"}`}
          onClick={onOpenModelHub}
          title={dict.modelHub}
          disabled={engine.phase === "not_installed"}
        >
          {dict.modelHub}
        </button>

        <div className="lang-switch" role="group" aria-label={dict.language}>
          <button
            type="button"
            className={`btn btn-sm ${locale === "zh" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => onLocale("zh")}
          >
            中文
          </button>
          <button
            type="button"
            className={`btn btn-sm ${locale === "en" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => onLocale("en")}
          >
            EN
          </button>
        </div>

        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={onOpenSettings}
        >
          {dict.openSettings}
        </button>
      </div>
    </header>
  );
}
