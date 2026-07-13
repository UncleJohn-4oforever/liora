import { useEffect, useMemo, useState } from "react";
import type { Dict } from "../i18n";
import {
  isModelInstalled,
  RECOMMENDED_MODELS,
  recommendTier,
  type RecommendedModel,
} from "../lib/models/catalog";
import {
  importLocalGguf,
  mapImportError,
  pickGgufFile,
  suggestNameFromPath,
} from "../lib/models/importGguf";
import {
  fetchSystemRamGb,
  formatBytes,
  pullModel,
  type PullProgress,
} from "../lib/models/pull";
import { ConfirmModal } from "./ConfirmModal";
import { shortModelName } from "./ModelSelect";

interface Props {
  dict: Dict;
  locale: "zh" | "en";
  open: boolean;
  ollamaOnline: boolean;
  installedModels: string[];
  onClose: () => void;
  /**
   * After successful pull/import.
   * @param switchTo — user chose (before start) to make it the current model
   */
  onPulled: (modelId: string, switchTo: boolean) => void;
}

type PendingAction =
  | { kind: "pull"; modelId: string }
  | { kind: "import"; path: string; name: string; system?: string };

export function ModelHub({
  dict,
  locale,
  open,
  ollamaOnline,
  installedModels,
  onClose,
  onPulled,
}: Props) {
  const [ramGb, setRamGb] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const [pullingId, setPullingId] = useState<string | null>(null);
  const [progress, setProgress] = useState<PullProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [abort, setAbort] = useState<AbortController | null>(null);

  const [ggufPath, setGgufPath] = useState("");
  const [importName, setImportName] = useState("");
  const [importSystem, setImportSystem] = useState("");
  const [importing, setImporting] = useState(false);

  /** Ask before starting download/import */
  const [pending, setPending] = useState<PendingAction | null>(null);

  const tier = recommendTier(ramGb);
  const busy = !!pullingId || importing;

  useEffect(() => {
    if (!open) return;
    setError(null);
    setMsg(null);
    setPending(null);
    void fetchSystemRamGb().then(setRamGb);
  }, [open]);

  const sorted = useMemo(() => {
    const order = { light: 0, balanced: 1, strong: 2 } as const;
    return [...RECOMMENDED_MODELS].sort((a, b) => {
      const aRec = a.tier === tier ? -1 : 0;
      const bRec = b.tier === tier ? -1 : 0;
      if (aRec !== bRec) return aRec - bRec;
      return order[a.tier] - order[b.tier];
    });
  }, [tier]);

  if (!open) return null;

  const requestPull = (modelId: string) => {
    if (!ollamaOnline) {
      setError(dict.modelHubNeedEngine);
      return;
    }
    if (busy || pending) return;
    setError(null);
    setMsg(null);
    setPending({ kind: "pull", modelId });
  };

  const runPull = async (modelId: string, switchTo: boolean) => {
    setPending(null);
    setError(null);
    setMsg(null);
    setProgress({
      status: dict.modelHubStarting,
      percent: 0,
      completed: null,
      total: null,
    });
    setPullingId(modelId);
    const ac = new AbortController();
    setAbort(ac);
    const result = await pullModel(modelId, {
      signal: ac.signal,
      onProgress: (p) => setProgress(p),
    });
    setAbort(null);
    setPullingId(null);
    if (result.ok) {
      const name = shortModelName(modelId);
      setProgress({
        status: "success",
        percent: 100,
        completed: null,
        total: null,
      });
      onPulled(modelId, switchTo);
      setMsg(
        switchTo
          ? dict.modelSwitchYes.replace("{m}", name)
          : dict.modelSwitchNo.replace("{m}", name),
      );
    } else if (result.error === "aborted") {
      setMsg(dict.modelHubCancelled);
      setProgress(null);
    } else {
      setError(result.error ?? dict.modelHubFailed);
    }
  };

  const cancelPull = () => {
    abort?.abort();
  };

  const onPickGguf = async () => {
    if (busy || pending) return;
    setError(null);
    const path = await pickGgufFile();
    if (!path) return;
    setGgufPath(path);
    if (!importName.trim()) {
      setImportName(suggestNameFromPath(path));
    }
  };

  const requestImport = () => {
    if (busy || pending) return;
    if (!ggufPath.trim() || !importName.trim()) {
      setError(dict.modelImportErrName);
      return;
    }
    if (!ollamaOnline) {
      setMsg(dict.modelImportNeedEngine);
    }
    setError(null);
    setMsg(null);
    setPending({
      kind: "import",
      path: ggufPath.trim(),
      name: importName.trim(),
      system: importSystem.trim() || undefined,
    });
  };

  const runImport = async (
    path: string,
    name: string,
    system: string | undefined,
    switchTo: boolean,
  ) => {
    setPending(null);
    setError(null);
    setMsg(null);
    setImporting(true);
    try {
      const result = await importLocalGguf({ path, name, system });
      if (result.ok) {
        const short = shortModelName(result.name);
        onPulled(result.name, switchTo);
        setMsg(
          switchTo
            ? dict.modelSwitchYes.replace("{m}", short)
            : dict.modelSwitchNo.replace("{m}", short),
        );
      } else {
        setError(
          mapImportError(result.error, dict) +
            (result.log ? `\n${result.log.slice(-280)}` : ""),
        );
      }
    } finally {
      setImporting(false);
    }
  };

  const pendingHighlight =
    pending?.kind === "pull"
      ? shortModelName(pending.modelId)
      : pending?.kind === "import"
        ? shortModelName(pending.name)
        : undefined;

  return (
    <div className="memory-drawer-backdrop" onClick={onClose}>
      <aside
        className="memory-drawer model-hub-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={dict.modelHubTitle}
      >
        <div className="panel-header">
          <h2>{dict.modelHubTitle}</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            {dict.close}
          </button>
        </div>

        <p className="muted small pad-x">{dict.modelHubIntro}</p>
        {ramGb != null && (
          <p className="muted small pad-x">
            {dict.modelHubRamHint.replace("{n}", String(ramGb))}
          </p>
        )}
        {!ollamaOnline && (
          <p className="settings-err pad-x">{dict.modelHubNeedEngine}</p>
        )}

        <section className="settings-section">
          <h3>{dict.modelHubRecommended}</h3>
          <div className="model-hub-list">
            {sorted.map((m) => (
              <ModelCard
                key={m.id}
                model={m}
                dict={dict}
                isEn={locale === "en"}
                installed={isModelInstalled(m.id, installedModels)}
                recommended={m.tier === tier}
                busy={pullingId === m.id}
                disabled={busy || !!pending || !ollamaOnline}
                onPull={() => requestPull(m.id)}
              />
            ))}
          </div>
        </section>

        <section className="settings-section">
          <h3>{dict.modelHubCustom}</h3>
          <p className="muted small pad-x">{dict.modelHubCustomHint}</p>
          <div className="settings-model-row pad-x">
            <input
              className="settings-input"
              placeholder="qwen2.5:3b"
              value={custom}
              disabled={busy || !!pending}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && custom.trim()) {
                  requestPull(custom.trim());
                }
              }}
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy || !!pending || !custom.trim() || !ollamaOnline}
              onClick={() => requestPull(custom.trim())}
            >
              {dict.modelHubPull}
            </button>
          </div>
        </section>

        <section className="settings-section">
          <h3>{dict.modelImportTitle}</h3>
          <p className="muted small pad-x">{dict.modelImportHint}</p>
          <div className="pad-x model-import-block">
            <label className="label">{dict.modelImportPath}</label>
            <div className="settings-model-row">
              <input
                className="settings-input"
                value={ggufPath}
                disabled={busy || !!pending}
                placeholder="D:\models\xxx.gguf"
                onChange={(e) => {
                  setGgufPath(e.target.value);
                  if (!importName.trim() && e.target.value) {
                    setImportName(suggestNameFromPath(e.target.value));
                  }
                }}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy || !!pending}
                onClick={() => void onPickGguf()}
              >
                {dict.modelImportPick}
              </button>
            </div>

            <label className="label" style={{ marginTop: 10 }}>
              {dict.modelImportName}
            </label>
            <p className="muted small">{dict.modelImportNameHint}</p>
            <input
              className="settings-input"
              style={{ width: "100%", marginTop: 4 }}
              value={importName}
              disabled={busy || !!pending}
              placeholder="my-local-model"
              onChange={(e) => setImportName(e.target.value)}
            />

            <label className="label" style={{ marginTop: 10 }}>
              {dict.modelImportSystem}
            </label>
            <p className="muted small">{dict.modelImportSystemHint}</p>
            <textarea
              className="settings-input model-import-system"
              rows={3}
              value={importSystem}
              disabled={busy || !!pending}
              onChange={(e) => setImportSystem(e.target.value)}
            />

            <div className="model-card-actions" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={
                  busy || !!pending || !ggufPath.trim() || !importName.trim()
                }
                onClick={requestImport}
              >
                {importing ? dict.modelImportWorking : dict.modelImportRun}
              </button>
            </div>
            {importing && (
              <p className="muted small" style={{ marginTop: 8 }}>
                {dict.modelImportWorking}
              </p>
            )}
          </div>
        </section>

        {(pullingId || progress) && (
          <section className="settings-section model-hub-progress">
            <h3>{dict.modelHubProgress}</h3>
            <div className="pad-x">
              {pullingId && (
                <p className="small">
                  {dict.modelHubPulling.replace(
                    "{m}",
                    shortModelName(pullingId),
                  )}
                </p>
              )}
              <div
                className="progress-track"
                aria-valuenow={progress?.percent ?? 0}
              >
                <div
                  className="progress-fill"
                  style={{
                    width: `${progress?.percent != null ? progress.percent : pullingId ? 8 : 0}%`,
                  }}
                />
              </div>
              <p className="muted small progress-status">
                {progress?.status ?? "…"}
                {progress?.percent != null ? ` · ${progress.percent}%` : ""}
                {progress?.completed != null && progress.total != null
                  ? ` · ${formatBytes(progress.completed)} / ${formatBytes(progress.total)}`
                  : ""}
              </p>
              {pullingId && (
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={cancelPull}
                >
                  {dict.modelHubCancel}
                </button>
              )}
            </div>
          </section>
        )}

        {msg && <p className="settings-msg pad-x">{msg}</p>}
        {error && <p className="settings-err pad-x">{error}</p>}

        {installedModels.length > 0 && (
          <section className="settings-section">
            <h3>{dict.modelHubInstalled}</h3>
            <ul className="model-hub-installed pad-x">
              {installedModels.map((m) => (
                <li key={m}>{shortModelName(m)}</li>
              ))}
            </ul>
          </section>
        )}
      </aside>

      <ConfirmModal
        open={!!pending}
        tone="info"
        title={
          pending?.kind === "import"
            ? dict.modelPreAskTitleImport
            : dict.modelPreAskTitlePull
        }
        description={dict.modelPreAskBody}
        highlight={pendingHighlight}
        cancelLabel={dict.modelPreAskCancel}
        secondaryLabel={dict.modelPreAskNoSwitch}
        primaryLabel={dict.modelPreAskSwitch}
        onCancel={() => setPending(null)}
        onSecondary={() => {
          if (!pending) return;
          if (pending.kind === "pull") {
            void runPull(pending.modelId, false);
          } else {
            void runImport(
              pending.path,
              pending.name,
              pending.system,
              false,
            );
          }
        }}
        onPrimary={() => {
          if (!pending) return;
          if (pending.kind === "pull") {
            void runPull(pending.modelId, true);
          } else {
            void runImport(pending.path, pending.name, pending.system, true);
          }
        }}
      />
    </div>
  );
}

function ModelCard({
  model,
  dict,
  isEn,
  installed,
  recommended,
  busy,
  disabled,
  onPull,
}: {
  model: RecommendedModel;
  dict: Dict;
  isEn: boolean;
  installed: boolean;
  recommended: boolean;
  busy: boolean;
  disabled: boolean;
  onPull: () => void;
}) {
  const copy = isEn ? model.en : model.zh;
  return (
    <div
      className={`model-card ${recommended ? "model-card-rec" : ""} ${installed ? "model-card-installed" : ""}`}
    >
      <div className="model-card-top">
        <div>
          <div className="model-card-name">
            {copy.name}
            {recommended && (
              <span className="model-card-badge">{dict.modelHubForYou}</span>
            )}
            {installed && (
              <span className="model-card-badge model-card-badge-ok">
                {dict.modelHubInstalledBadge}
              </span>
            )}
          </div>
          <div className="muted small model-card-id">{model.id}</div>
        </div>
        <div className="model-card-size">{model.sizeLabel}</div>
      </div>
      <p className="small model-card-blurb">{copy.blurb}</p>
      <div className="model-card-actions">
        {installed ? (
          <button type="button" className="btn btn-ghost btn-sm" disabled>
            {dict.modelHubInstalledBadge}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={disabled}
            onClick={onPull}
          >
            {busy ? dict.modelHubPullingShort : dict.modelHubPull}
          </button>
        )}
      </div>
    </div>
  );
}
