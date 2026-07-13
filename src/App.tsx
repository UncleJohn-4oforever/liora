import { CharacterPanel } from "./components/CharacterPanel";
import { ChatPanel } from "./components/ChatPanel";
import { EngineBanner } from "./components/EngineBanner";
import { EngineGuide } from "./components/EngineGuide";
import { MemoryPanel } from "./components/MemoryPanel";
import { MemoryToast } from "./components/MemoryToast";
import { SensitiveConfirm } from "./components/SensitiveConfirm";
import { SessionList } from "./components/SessionList";
import { ModelHub } from "./components/ModelHub";
import { SettingsPanel } from "./components/SettingsPanel";
import { TopBar } from "./components/TopBar";
import { useLioraState } from "./hooks/useLioraState";
import "./App.css";

export default function App() {
  const state = useLioraState();

  if (!state.ready) {
    return (
      <div
        className="boot-screen"
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#0f1218",
          color: "#e8eef7",
        }}
      >
        <div
          className="boot-card"
          style={{
            textAlign: "center",
            padding: "28px 32px",
            borderRadius: 16,
            border: "1px solid #243041",
            background: "#161b24",
          }}
        >
          <div className="brand-mark boot-mark" aria-hidden />
          <h1 style={{ margin: "12px 0 6px" }}>Liora</h1>
          <p style={{ color: "#8b9bb0", margin: 0 }}>
            Loading local database…
          </p>
          {state.bootError && (
            <p style={{ color: "#f0a0a0", marginTop: 12, fontSize: 13 }}>
              {state.bootError}
            </p>
          )}
        </div>
      </div>
    );
  }

  const currentModel =
    state.active?.modelId || state.settings.defaultModelId;

  return (
    <div className="app">
      <TopBar
        dict={state.dict}
        locale={state.settings.locale}
        engine={state.engine}
        models={state.ollamaModels}
        currentModelId={currentModel}
        onLocale={state.setLocale}
        onOpenSettings={() => state.setSettingsOpen(true)}
        onModelChange={state.setSessionModel}
        onEngineStart={() => void state.engineStart()}
        onEngineRetry={() => void state.engineRefresh()}
        onOpenEngineGuide={() => state.setEngineGuideOpen(true)}
        onOpenModelHub={() => state.setModelHubOpen(true)}
      />
      <EngineBanner
        dict={state.dict}
        engine={state.engine}
        onStart={() => void state.engineStart()}
        onRetry={() => void state.engineRefresh()}
        onOpenGuide={() => state.setEngineGuideOpen(true)}
      />
      {state.bootError && (
        <div className="banner-error boot-banner">
          DB: {state.bootError} (fallback mode)
        </div>
      )}
      {state.ollamaOnline && state.ollamaModels.length === 0 && (
        <div className="banner-warn model-none-banner">
          <span>{state.dict.modelNoneHint}</span>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => state.setModelHubOpen(true)}
          >
            {state.dict.modelHub}
          </button>
        </div>
      )}
      <div className="workspace">
        <SessionList
          dict={state.dict}
          sessions={state.sessions}
          activeId={state.active?.id ?? ""}
          onSelect={state.setActiveId}
          onNew={state.newSession}
          onDelete={state.deleteSession}
          onRename={state.renameSession}
        />
        <ChatPanel
          dict={state.dict}
          session={state.active}
          input={state.input}
          generating={state.generating}
          lastError={state.lastError}
          modelLabel={currentModel}
          ollamaOnline={state.ollamaOnline}
          memoryEnabled={state.settings.memoryEnabled}
          rememberBusy={state.rememberBusy}
          settings={state.settings}
          tokenUsage={state.tokenUsage}
          usageCtxLimit={state.usageCtxLimit}
          assembledBudget={state.assembledBudget}
          onInput={state.setInput}
          onSend={() => void state.send()}
          onStop={state.stop}
          onRememberText={(text) => void state.rememberText(text)}
          onChangeSettings={state.patchSettings}
        />
        <CharacterPanel
          dict={state.dict}
          locale={state.settings.locale}
          character={state.character}
          modelLabel={currentModel}
          memoryEnabled={state.settings.memoryEnabled}
          memoryCount={state.memories.length}
          pipelineBusy={state.pipelineBusy || state.rememberBusy}
          onToggleMemory={state.toggleMemory}
          onOpenMemory={() => state.setMemoryOpen(true)}
        />
      </div>

      {state.toast && (
        <MemoryToast
          dict={state.dict}
          count={state.toast.count}
          labels={state.toast.labels}
          detail={state.toast.detail}
          onOpen={() => {
            state.setMemoryOpen(true);
            state.dismissToast();
          }}
          onDismiss={state.dismissToast}
        />
      )}

      <MemoryPanel
        dict={state.dict}
        open={state.memoryOpen}
        memories={state.memories}
        episodesCount={state.memoryStore.episodes.length}
        chunksCount={state.memoryStore.chunks.length}
        pipelineBusy={state.pipelineBusy || state.rememberBusy}
        onClose={() => state.setMemoryOpen(false)}
        onEdit={state.editMemory}
        onDelete={state.deleteMemory}
        onClearAll={state.clearMemories}
        onRunNow={state.runMemoryNow}
      />

      <SettingsPanel
        dict={state.dict}
        open={state.settingsOpen}
        settings={state.settings}
        ollamaModels={state.ollamaModels}
        onClose={() => state.setSettingsOpen(false)}
        onChangeSettings={state.patchSettings}
        onExport={state.exportBackup}
        onImportFile={state.importBackupFile}
        onReloadData={() => state.reloadFromDisk()}
      />

      <EngineGuide
        dict={state.dict}
        open={state.engineGuideOpen}
        isDesktop={state.engine.isDesktop}
        onClose={() => state.setEngineGuideOpen(false)}
        onOpenDownload={() => void state.engineOpenInstall()}
        onRecheck={() => void state.engineAfterInstall()}
      />

      <ModelHub
        dict={state.dict}
        locale={state.settings.locale}
        open={state.modelHubOpen}
        ollamaOnline={state.ollamaOnline}
        installedModels={state.ollamaModels}
        onClose={() => state.setModelHubOpen(false)}
        onPulled={(id, switchTo) => void state.afterModelPulled(id, switchTo)}
      />

      <SensitiveConfirm
        dict={state.dict}
        open={!!state.sensitivePending}
        preview={state.sensitivePending?.text ?? ""}
        tags={state.sensitivePending?.tags ?? []}
        onConfirm={state.confirmSensitiveSave}
        onCancel={state.cancelSensitiveSave}
      />
    </div>
  );
}
