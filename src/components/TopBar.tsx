import type { Dict } from "../i18n";
import type { EngineActivity } from "../lib/engine/activity";
import type { EngineSnapshot } from "../lib/engine/types";
import { ModelSelect } from "./ModelSelect";

interface Props {
  dict: Dict;
  engine: EngineSnapshot;
  /** Pull / VRAM load / etc. — shown with progress on the engine pill */
  engineActivity: EngineActivity;
  models: string[];
  currentModelId: string;
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

function activityTone(
  engine: EngineSnapshot,
  activity: EngineActivity,
): string {
  if (
    activity.kind === "pull" ||
    activity.kind === "load" ||
    activity.kind === "vision" ||
    activity.kind === "generate"
  ) {
    return "busy";
  }
  if (engine.phase === "starting" || engine.phase === "checking") {
    return "busy";
  }
  return engine.phase;
}

export function TopBar({
  dict,
  engine,
  engineActivity,
  models,
  currentModelId,
  onOpenSettings,
  onModelChange,
  onEngineStart,
  onEngineRetry,
  onOpenEngineGuide,
  onOpenModelHub,
}: Props) {
  const busyKind =
    engineActivity.kind !== "idle"
      ? engineActivity.kind
      : engine.phase === "starting"
        ? "engine_start"
        : engine.phase === "checking"
          ? "checking"
          : null;

  const showBar = busyKind != null;
  const percent =
    engineActivity.kind === "pull" ? engineActivity.percent : null;
  const busyLabel =
    engineActivity.kind !== "idle"
      ? engineActivity.label
      : engine.phase === "starting"
        ? dict.engineStarting
        : engine.phase === "checking"
          ? dict.engineChecking
          : "";

  const tone = activityTone(engine, engineActivity);
  const statusText =
    engineActivity.kind !== "idle"
      ? engineActivity.label
      : `${dict.engineLabel}: ${phaseLabel(dict, engine)}`;

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
          className={`status-pill status-engine-${tone} ${showBar ? "status-pill-busy" : ""}`}
          title={
            engineActivity.detail ||
            engineActivity.label ||
            engine.message ||
            statusText
          }
        >
          <span className="dot" />
          <div className="status-pill-body">
            <div className="status-pill-line">
              {statusText}
              {engine.phase === "online" &&
                engineActivity.kind === "idle" &&
                engine.version && (
                  <span className="status-extra"> · {engine.version}</span>
                )}
              {percent != null && (
                <span className="status-extra"> · {percent}%</span>
              )}
            </div>
            {showBar && (
              <div
                className="engine-activity-track"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent ?? undefined}
                aria-label={busyLabel || statusText}
              >
                <div
                  className={`engine-activity-fill ${percent == null ? "indeterminate" : ""}`}
                  style={
                    percent != null
                      ? { width: `${Math.max(2, Math.min(100, percent))}%` }
                      : undefined
                  }
                />
              </div>
            )}
          </div>
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
        {engine.phase !== "online" &&
          engine.phase !== "checking" &&
          engineActivity.kind === "idle" && (
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
          disabled={
            engine.phase !== "online" || engineActivity.kind === "pull"
          }
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

        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={onOpenSettings}
        >
          {dict.settings}
        </button>
      </div>
    </header>
  );
}
