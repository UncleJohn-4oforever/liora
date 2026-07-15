import { useEffect, useState } from "react";
import type { Dict } from "../i18n";
import type { EngineSnapshot } from "../lib/engine/types";
import {
  getStorageInfo,
  isDesktopStorage,
  openDataDir,
  type StorageInfo,
} from "../lib/db/desktopKv";

type Step = 0 | 1 | 2;

interface Props {
  dict: Dict;
  open: boolean;
  engine: EngineSnapshot;
  models: string[];
  onStartEngine: () => void;
  onRefreshEngine: () => void;
  onOpenInstall: () => void;
  onOpenModelHub: () => void;
  onOpenSettingsData: () => void;
  onFinish: () => void;
  onSkip: () => void;
}

/**
 * First-run: Engine → Model → Data folder.
 */
export function OnboardingWizard({
  dict,
  open,
  engine,
  models,
  onStartEngine,
  onRefreshEngine,
  onOpenInstall,
  onOpenModelHub,
  onOpenSettingsData,
  onFinish,
  onSkip,
}: Props) {
  const [step, setStep] = useState<Step>(0);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const desktop = isDesktopStorage();

  useEffect(() => {
    if (!open) return;
    setStep(0);
    if (desktop) {
      void getStorageInfo().then(setStorage);
    }
  }, [open, desktop]);

  useEffect(() => {
    if (!open || !desktop) return;
    const t = window.setInterval(() => {
      void getStorageInfo().then(setStorage);
    }, 4000);
    return () => window.clearInterval(t);
  }, [open, desktop]);

  if (!open) return null;

  const engineOk = engine.phase === "online";
  const modelOk = models.length > 0;
  const canNext0 = engineOk;
  const canNext1 = modelOk;

  const title =
    step === 0
      ? dict.onboardStep1Title
      : step === 1
        ? dict.onboardStep2Title
        : dict.onboardStep3Title;

  const body =
    step === 0
      ? dict.onboardStep1Body
      : step === 1
        ? dict.onboardStep2Body
        : dict.onboardStep3Body;

  return (
    <div className="confirm-modal-backdrop onboard-backdrop" role="presentation">
      <div
        className="confirm-modal tone-info onboard-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboard-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="onboard-brand">
          <span className="brand-mark" aria-hidden />
          <div>
            <div className="brand-name">{dict.appName}</div>
            <div className="muted small">{dict.onboardWelcome}</div>
          </div>
        </div>

        <div className="onboard-steps" aria-label="progress">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`onboard-dot ${step === i ? "on" : ""} ${step > i ? "done" : ""}`}
            >
              {i + 1}
            </div>
          ))}
        </div>

        <h2 id="onboard-title">{title}</h2>
        <p className="confirm-modal-desc">{body}</p>

        {step === 0 && (
          <div className="onboard-status">
            <span
              className={`status-pill status-engine-${engine.phase}`}
            >
              <span className="dot" />
              {dict.engineLabel}:{" "}
              {engine.phase === "online"
                ? dict.engineOnline
                : engine.phase === "starting"
                  ? dict.engineStarting
                  : engine.phase === "not_installed"
                    ? dict.engineNotInstalled
                    : dict.engineOffline}
            </span>
            <div className="onboard-actions-row">
              {engine.phase === "not_installed" ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={onOpenInstall}
                >
                  {dict.engineOpenDownload}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={onStartEngine}
                  disabled={engine.phase === "starting" || engine.phase === "online"}
                >
                  {dict.engineStart}
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={onRefreshEngine}
              >
                {dict.engineRetry}
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="onboard-status">
            <p className="small">
              {modelOk
                ? dict.onboardModelsReady.replace(
                    "{n}",
                    String(models.length),
                  )
                : dict.onboardModelsEmpty}
            </p>
            {modelOk && (
              <ul className="onboard-model-list">
                {models.slice(0, 5).map((m) => (
                  <li key={m}>{m.replace(/:latest$/, "")}</li>
                ))}
                {models.length > 5 && <li>…</li>}
              </ul>
            )}
            <div className="onboard-actions-row">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={onOpenModelHub}
              >
                {dict.modelHub}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="onboard-status">
            <p className="muted small">{dict.onboardDataHint}</p>
            {desktop ? (
              <>
                <div className="storage-path-box">
                  {storage?.dataDir ?? dict.onboardDataLoading}
                </div>
                <div className="onboard-actions-row">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => void openDataDir()}
                  >
                    {dict.storageOpen}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={onOpenSettingsData}
                  >
                    {dict.storageChoose}
                  </button>
                </div>
              </>
            ) : (
              <p className="muted small">{dict.storageBrowserOnly}</p>
            )}
          </div>
        )}

        <div className="confirm-modal-actions onboard-footer">
          <button type="button" className="btn btn-ghost" onClick={onSkip}>
            {dict.onboardSkip}
          </button>
          {step > 0 && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setStep((s) => (s - 1) as Step)}
            >
              {dict.onboardBack}
            </button>
          )}
          {step < 2 ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={step === 0 ? !canNext0 : !canNext1}
              onClick={() => setStep((s) => (s + 1) as Step)}
              title={
                step === 0 && !canNext0
                  ? dict.onboardNeedEngine
                  : step === 1 && !canNext1
                    ? dict.onboardNeedModel
                    : undefined
              }
            >
              {dict.onboardNext}
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={onFinish}>
              {dict.onboardFinish}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
