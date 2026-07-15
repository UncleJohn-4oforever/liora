import { useEffect, useRef, useState } from "react";
import type { Dict } from "../i18n";
import type { ImportMode } from "../lib/backup";
import {
  CONTEXT_SIZE_OPTIONS,
  formatContextLabel,
  normalizeContextSize,
} from "../lib/chatPrompt";
import {
  getStorageInfo,
  isDesktopStorage,
  openConfigDir,
  openDataDir,
  pickDataDir,
  resetDataDirDefault,
  setDataDir,
  type StorageInfo,
} from "../lib/db/desktopKv";
import type { AppSettings } from "../types";

interface Props {
  dict: Dict;
  open: boolean;
  settings: AppSettings;
  ollamaModels: string[];
  onClose: () => void;
  onChangeSettings: (patch: Partial<AppSettings>) => void;
  onExport: () => void;
  onImportFile: (file: File, mode: ImportMode) => Promise<void>;
  /** Reload sessions/memory/settings after data-dir change */
  onReloadData?: () => Promise<void>;
}

export function SettingsPanel({
  dict,
  open,
  settings,
  ollamaModels,
  onClose,
  onChangeSettings,
  onExport,
  onImportFile,
  onReloadData,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [modelDraft, setModelDraft] = useState(settings.defaultModelId);
  const [importMode, setImportMode] = useState<ImportMode>("merge");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const desktop = isDesktopStorage();

  const refreshStorage = async () => {
    if (!desktop) {
      setStorage(null);
      return;
    }
    const info = await getStorageInfo();
    setStorage(info);
  };

  useEffect(() => {
    if (open) {
      setModelDraft(settings.defaultModelId);
      setMsg(null);
      setErr(null);
      void refreshStorage();
    }
  }, [open, settings.defaultModelId]);

  if (!open) return null;

  const applyModel = () => {
    const v = modelDraft.trim();
    if (!v) return;
    onChangeSettings({ defaultModelId: v });
    setMsg(dict.apply);
    setErr(null);
  };

  const pickImport = () => {
    setMsg(null);
    setErr(null);
    fileRef.current?.click();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      await onImportFile(file, importMode);
      setMsg(dict.importSuccess);
    } catch (e) {
      setErr(
        `${dict.importFailed}: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const chooseDataDir = async () => {
    if (!desktop) return;
    setErr(null);
    setMsg(null);
    const path = await pickDataDir();
    if (!path) return;
    const migrate = window.confirm(dict.storageMigrateAsk);
    setBusy(true);
    try {
      const r = await setDataDir(path, migrate);
      if (!r.ok) {
        setErr(r.error ?? dict.importFailed);
        return;
      }
      await onReloadData?.();
      await refreshStorage();
      setMsg(r.migrated ? dict.storageMigrated : dict.storageChanged);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const resetDefault = async () => {
    if (!desktop) return;
    setErr(null);
    setMsg(null);
    const migrate = window.confirm(dict.storageMigrateAsk);
    setBusy(true);
    try {
      const r = await resetDataDirDefault(migrate);
      if (!r.ok) {
        setErr(r.error ?? dict.importFailed);
        return;
      }
      await onReloadData?.();
      await refreshStorage();
      setMsg(r.migrated ? dict.storageMigrated : dict.storageChanged);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="memory-drawer-backdrop" onClick={onClose}>
      <aside
        className="memory-drawer settings-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={dict.settingsTitle}
      >
        <div className="panel-header">
          <h2>{dict.settingsTitle}</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            {dict.close}
          </button>
        </div>

        <section className="settings-section">
          <h3>{dict.settingsGeneral}</h3>
          <p className="muted small pad-x">{dict.storageNote}</p>

          <div className="settings-row">
            <label className="label">{dict.language}</label>
            <div className="lang-switch">
              <button
                type="button"
                className={`btn btn-sm ${settings.locale === "zh" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => onChangeSettings({ locale: "zh" })}
              >
                中文
              </button>
              <button
                type="button"
                className={`btn btn-sm ${settings.locale === "en" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => onChangeSettings({ locale: "en" })}
              >
                EN
              </button>
            </div>
          </div>

          <div className="settings-row">
            <label className="label">{dict.memory}</label>
            <button
              type="button"
              className={`btn btn-sm ${settings.memoryEnabled ? "btn-primary" : "btn-ghost"}`}
              onClick={() =>
                onChangeSettings({ memoryEnabled: !settings.memoryEnabled })
              }
            >
              {settings.memoryEnabled ? dict.memoryOn : dict.memoryOff}
            </button>
          </div>

          <div className="settings-block pad-x">
            <label className="label" htmlFor="default-model">
              {dict.defaultModel}
            </label>
            <p className="muted small">{dict.defaultModelHint}</p>
            <div className="settings-model-row">
              <input
                id="default-model"
                className="settings-input"
                list="ollama-models"
                value={modelDraft}
                onChange={(e) => setModelDraft(e.target.value)}
                onFocus={() => setModelDraft(settings.defaultModelId)}
              />
              <datalist id="ollama-models">
                {ollamaModels.map((m) => (
                  <option key={m} value={m.replace(/:latest$/, "")} />
                ))}
              </datalist>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={applyModel}
              >
                {dict.apply}
              </button>
            </div>
          </div>

          <div className="settings-block pad-x">
            <label className="label" htmlFor="summary-every">
              {dict.summaryEveryN}
            </label>
            <p className="muted small">{dict.summaryEveryNHint}</p>
            <div className="settings-model-row">
              <input
                id="summary-every"
                className="settings-input"
                type="number"
                min={2}
                max={30}
                value={settings.summaryEveryN ?? 6}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isFinite(n)) return;
                  onChangeSettings({
                    summaryEveryN: Math.max(2, Math.min(30, Math.round(n))),
                  });
                }}
              />
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h3>{dict.settingsData}</h3>
          {!desktop ? (
            <p className="muted small pad-x">{dict.storageBrowserOnly}</p>
          ) : (
            <>
              <p className="muted small pad-x">{dict.storageDataDirHint}</p>
              <div className="settings-block pad-x">
                <span className="label">{dict.storageDataDir}</span>
                <div className="storage-path-box" title={storage?.dataDir}>
                  {storage?.dataDir ?? "…"}
                </div>
                <p className="muted small" style={{ marginTop: 6 }}>
                  {storage?.isDefault ? dict.storageDefault : dict.storageCustom}
                  {storage
                    ? ` · ${storage.files.filter((f) => f.exists).length}/${storage.files.length} files`
                    : ""}
                </p>
                <div className="storage-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busy}
                    onClick={() => void chooseDataDir()}
                  >
                    {dict.storageChoose}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy}
                    onClick={() => void openDataDir().catch((e) => setErr(String(e)))}
                  >
                    {dict.storageOpen}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy || storage?.isDefault}
                    onClick={() => void resetDefault()}
                  >
                    {dict.storageResetDefault}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy}
                    onClick={() =>
                      void openConfigDir().catch((e) => setErr(String(e)))
                    }
                  >
                    {dict.storageOpenConfig}
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        <section className="settings-section">
          <h3>{dict.settingsChat}</h3>

          <div className="settings-row">
            <div>
              <div className="label">{dict.showThinking}</div>
              <p className="muted small" style={{ margin: "4px 0 0" }}>
                {dict.showThinkingHint}
              </p>
            </div>
            <button
              type="button"
              className={`btn btn-sm ${settings.showThinking !== false ? "btn-primary" : "btn-ghost"}`}
              onClick={() =>
                onChangeSettings({
                  showThinking: !(settings.showThinking !== false),
                })
              }
            >
              {settings.showThinking !== false ? dict.memoryOn : dict.memoryOff}
            </button>
          </div>

          <div className="settings-block pad-x">
            <span className="label">{dict.answerLength}</span>
            <p className="muted small">{dict.answerLengthHint}</p>
            <div className="pref-chips" style={{ marginTop: 8 }}>
              {(
                [
                  ["concise", dict.answerLengthConcise],
                  ["normal", dict.answerLengthNormal],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`chip ${(settings.answerLength ?? "normal") === id ? "chip-on" : ""}`}
                  onClick={() => onChangeSettings({ answerLength: id })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-block pad-x">
            <span className="label">{dict.contextSize}</span>
            <p className="muted small">{dict.contextSizeHint}</p>
            <div className="pref-chips" style={{ marginTop: 8 }}>
              {CONTEXT_SIZE_OPTIONS.map((size) => (
                <button
                  key={size}
                  type="button"
                  className={`chip ${normalizeContextSize(settings.contextSize) === size ? "chip-on" : ""}`}
                  onClick={() => onChangeSettings({ contextSize: size })}
                >
                  {formatContextLabel(size)}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h3>{dict.settingsBackup}</h3>
          <p className="muted small pad-x">{dict.exportBackupHint}</p>
          <div className="pad-x" style={{ marginBottom: 12 }}>
            <button type="button" className="btn btn-primary" onClick={onExport}>
              {dict.exportBackup}
            </button>
          </div>

          <p className="muted small pad-x">{dict.importBackupHint}</p>
          <div className="settings-row">
            <label className="label">{dict.importBackup}</label>
            <div className="lang-switch">
              <button
                type="button"
                className={`btn btn-sm ${importMode === "merge" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setImportMode("merge")}
              >
                {dict.importModeMerge}
              </button>
              <button
                type="button"
                className={`btn btn-sm ${importMode === "replace" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setImportMode("replace")}
              >
                {dict.importModeReplace}
              </button>
            </div>
          </div>
          <div className="pad-x" style={{ marginBottom: 12 }}>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              style={{ display: "none" }}
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={pickImport}
            >
              {busy ? "…" : dict.importBackup}
            </button>
          </div>
        </section>

        {msg && <p className="settings-msg pad-x">{msg}</p>}
        {err && <p className="settings-err pad-x">{err}</p>}
      </aside>
    </div>
  );
}
