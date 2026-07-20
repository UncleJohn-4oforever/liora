import { lazy, Suspense } from "react";
import { CharacterPanel } from "./components/CharacterPanel";
import { ChatPanel } from "./components/ChatPanel";
import { EngineBanner } from "./components/EngineBanner";
import { EngineGuide } from "./components/EngineGuide";
import { MemoryToast } from "./components/MemoryToast";
import { SessionList } from "./components/SessionList";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { TopBar } from "./components/TopBar";
import { useLioraState } from "./hooks/useLioraState";
import "./App.css";

const MemoryPanel = lazy(() =>
  import("./components/MemoryPanel").then((module) => ({
    default: module.MemoryPanel,
  })),
);
const SettingsPanel = lazy(() =>
  import("./components/SettingsPanel").then((module) => ({
    default: module.SettingsPanel,
  })),
);
const ModelHub = lazy(() =>
  import("./components/ModelHub").then((module) => ({
    default: module.ModelHub,
  })),
);
const CharacterHub = lazy(() =>
  import("./components/CharacterHub").then((module) => ({
    default: module.CharacterHub,
  })),
);

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
        engine={state.engine}
        engineActivity={state.engineActivity}
        models={state.ollamaModels}
        currentModelId={currentModel}
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
      {state.persistenceError && (
        <div className="banner-error boot-banner" role="alert">
          {state.settings.locale === "zh"
            ? `数据尚未保存到桌面存储：${state.persistenceError}`
            : `Data was not saved to desktop storage: ${state.persistenceError}`}
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
          folders={state.chatFolders}
          activeId={state.active?.id ?? ""}
          onSelect={state.setActiveId}
          onNew={state.newSession}
          onNewFolder={state.newFolder}
          onDelete={state.deleteSession}
          onRename={state.renameSession}
          onMoveSession={state.moveSessionToFolder}
          onRenameFolder={state.renameFolder}
          onDeleteFolder={state.deleteFolder}
          onToggleFolder={state.toggleFolderCollapsed}
        />
        <ChatPanel
          dict={state.dict}
          session={state.active}
          sessionCharacterName={
            state.settings.locale === "en"
              ? state.character.nameEn || state.character.name
              : state.character.name
          }
          input={state.input}
          generating={state.generating}
          lastError={state.lastError}
          ollamaOnline={state.ollamaOnline}
          modelCount={state.ollamaModels.length}
          memoryEnabled={state.settings.memoryEnabled}
          rememberBusy={state.rememberBusy}
          settings={state.settings}
          tokenUsage={state.tokenUsage}
          usageCtxLimit={state.usageCtxLimit}
          assembledBudget={state.assembledBudget}
          pendingImage={state.pendingImage}
          attachBusy={state.attachBusy}
          onInput={state.setInput}
          onSend={() => void state.send()}
          onStop={state.stop}
          onRememberText={(text) => void state.rememberText(text)}
          onChangeSettings={state.patchSettings}
          onAttachImage={(file) => void state.attachImageFile(file)}
          onClearPendingImage={state.clearPendingImage}
          onOpenModelHub={() => state.setModelHubOpen(true)}
          onStartEngine={() => void state.engineStart()}
        />
        <CharacterPanel
          dict={state.dict}
          locale={state.settings.locale}
          character={state.character}
          defaultCharacterId={state.defaultCharacterId}
          memoryCount={state.memories.length}
          pipelineBusy={state.pipelineBusy || state.rememberBusy}
          generating={state.generating}
          onOpenMemory={() => state.setMemoryOpen(true)}
          onOpenCharacterHub={() => state.setCharacterHubOpen(true)}
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

      {state.memoryOpen && <Suspense fallback={null}><MemoryPanel
        dict={state.dict}
        open={state.memoryOpen}
        memories={state.memories}
        episodesCount={state.memoryStore.episodes.length}
        chunksCount={state.memoryStore.chunks.length}
        pipelineBusy={state.pipelineBusy || state.rememberBusy}
        isMeta={
          state.character.kind === "meta" ||
          state.character.id === "char_default_assistant"
        }
        characterName={
          state.settings.locale === "en"
            ? state.character.nameEn || state.character.name
            : state.character.name
        }
        characters={state.characters}
        onClose={() => state.setMemoryOpen(false)}
        onEdit={state.editMemory}
        onAssign={state.assignMemory}
        onDelete={state.deleteMemory}
        onClearAll={state.clearMemories}
        onRunNow={state.runMemoryNow}
      /></Suspense>}

      {state.settingsOpen && <Suspense fallback={null}><SettingsPanel
        dict={state.dict}
        open={state.settingsOpen}
        settings={state.settings}
        ollamaModels={state.ollamaModels}
        onClose={() => state.setSettingsOpen(false)}
        onChangeSettings={state.patchSettings}
        onExport={state.exportBackup}
        onImportFile={state.importBackupFile}
        onReloadData={() => state.reloadFromDisk()}
      /></Suspense>}

      <EngineGuide
        dict={state.dict}
        open={state.engineGuideOpen}
        isDesktop={state.engine.isDesktop}
        onClose={() => state.setEngineGuideOpen(false)}
        onOpenDownload={() => void state.engineOpenInstall()}
        onRecheck={() => void state.engineAfterInstall()}
      />

      {state.modelHubOpen && <Suspense fallback={null}><ModelHub
        dict={state.dict}
        locale={state.settings.locale}
        open={state.modelHubOpen}
        ollamaOnline={state.ollamaOnline}
        installedModels={state.ollamaModels}
        onClose={() => state.setModelHubOpen(false)}
        onPulled={(id, switchTo) => void state.afterModelPulled(id, switchTo)}
        onPullProgress={state.reportPullProgress}
      /></Suspense>}

      {state.characterHubOpen && <Suspense fallback={null}><CharacterHub
        dict={state.dict}
        locale={state.settings.locale}
        open={state.characterHubOpen}
        characters={state.characters}
        activeCharacterId={state.character.id}
        defaultCharacterId={state.defaultCharacterId}
        generating={state.generating}
        ollamaOnline={state.ollamaOnline}
        onDescribePortrait={state.describePortraitFromArt}
        onClose={() => state.setCharacterHubOpen(false)}
        onSelectCharacter={state.setSessionCharacter}
        onSetDefaultCharacter={state.setDefaultCharacter}
        onSaveCharacter={state.saveCharacterCard}
        onDeleteCharacter={state.deleteCharacterCard}
        onReplaceCharacters={state.replaceCharacters}
      /></Suspense>}

      <OnboardingWizard
        dict={state.dict}
        open={state.needsOnboarding}
        engine={state.engine}
        models={state.ollamaModels}
        onStartEngine={() => void state.engineStart()}
        onRefreshEngine={() => void state.engineRefresh()}
        onOpenInstall={() => void state.engineOpenInstall()}
        onOpenModelHub={() => state.setModelHubOpen(true)}
        onOpenSettingsData={() => state.setSettingsOpen(true)}
        onFinish={() => state.completeOnboarding()}
        onSkip={() => state.completeOnboarding()}
      />
    </div>
  );
}
