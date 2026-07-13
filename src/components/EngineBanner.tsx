import type { Dict } from "../i18n";
import type { EngineSnapshot } from "../lib/engine/types";

interface Props {
  dict: Dict;
  engine: EngineSnapshot;
  onStart: () => void;
  onRetry: () => void;
  onOpenGuide: () => void;
}

export function EngineBanner({
  dict,
  engine,
  onStart,
  onRetry,
  onOpenGuide,
}: Props) {
  if (engine.phase === "online" || engine.phase === "checking") {
    return null;
  }

  const title =
    engine.phase === "not_installed"
      ? dict.engineNotInstalled
      : engine.phase === "starting"
        ? dict.engineStarting
        : engine.phase === "error"
          ? dict.engineError
          : dict.engineOffline;

  return (
    <div className={`engine-banner phase-${engine.phase}`}>
      <div className="engine-banner-text">
        <strong>{title}</strong>
        <span>{engine.message}</span>
        {engine.lastError && (
          <span className="engine-banner-err">{engine.lastError}</span>
        )}
      </div>
      <div className="engine-banner-actions">
        {engine.phase === "not_installed" && (
          <button type="button" className="btn btn-primary btn-sm" onClick={onOpenGuide}>
            {dict.engineInstallGuide}
          </button>
        )}
        {(engine.phase === "offline" || engine.phase === "error") &&
          engine.isDesktop && (
            <button type="button" className="btn btn-primary btn-sm" onClick={onStart}>
              {dict.engineStart}
            </button>
          )}
        {engine.phase === "offline" && !engine.isDesktop && (
          <button type="button" className="btn btn-primary btn-sm" onClick={onOpenGuide}>
            {dict.engineInstallGuide}
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>
          {dict.engineRetry}
        </button>
      </div>
    </div>
  );
}
