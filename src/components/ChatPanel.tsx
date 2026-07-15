import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Dict } from "../i18n";
import {
  CONTEXT_SIZE_OPTIONS,
  formatContextLabel,
  normalizeContextSize,
} from "../lib/chatPrompt";
import { emptyChatHint } from "../lib/errors";
import type { AssembledBudget } from "../lib/memory/budgetAssemble";
import type { TokenUsage } from "../lib/ollama";
import type {
  AnswerLength,
  AppSettings,
  ContextSize,
  Message,
  Session,
} from "../types";
import { MarkdownBody } from "./MarkdownBody";

interface Props {
  dict: Dict;
  session: Session | null;
  /** Display name of the character bound to this session */
  sessionCharacterName?: string;
  input: string;
  generating: boolean;
  lastError: string | null;
  modelLabel: string;
  ollamaOnline: boolean;
  modelCount: number;
  memoryEnabled: boolean;
  rememberBusy: boolean;
  settings: AppSettings;
  /** Last turn token usage from Ollama (null if none yet / generating). */
  tokenUsage: TokenUsage | null;
  /** num_ctx used for last/current turn. */
  usageCtxLimit: number | null;
  /** Pre-send rolling pack estimate */
  assembledBudget: AssembledBudget | null;
  onInput: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  onRememberText: (text: string) => void;
  onChangeSettings: (patch: Partial<AppSettings>) => void;
  onOpenModelHub?: () => void;
  onStartEngine?: () => void;
}

export function ChatPanel({
  dict,
  session,
  sessionCharacterName,
  input,
  generating,
  lastError,
  modelLabel,
  ollamaOnline,
  modelCount,
  memoryEnabled,
  rememberBusy,
  settings,
  tokenUsage,
  usageCtxLimit,
  assembledBudget,
  onInput,
  onSend,
  onStop,
  onRememberText,
  onChangeSettings,
  onOpenModelHub,
  onStartEngine,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.messages, generating]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const answerLength: AnswerLength = settings.answerLength ?? "normal";
  const showThinking = settings.showThinking !== false;
  const contextSize: ContextSize = normalizeContextSize(settings.contextSize);
  const limit = usageCtxLimit ?? assembledBudget?.limit ?? contextSize;
  const packed = assembledBudget?.estimatedPrompt ?? null;
  const used = tokenUsage?.totalTokens ?? packed;
  const pct =
    used != null && limit > 0
      ? Math.min(100, Math.round((used / limit) * 100))
      : null;
  const usageTitle = [
    dict.contextUsageHint,
    assembledBudget
      ? `${dict.contextPacked}: ~${assembledBudget.estimatedPrompt} · ${dict.contextHot}: ${assembledBudget.hotCount} · ${dict.contextCold}: ${assembledBudget.coldCount}`
      : "",
    tokenUsage
      ? `${dict.contextUsagePrompt} ${tokenUsage.promptTokens} · ${dict.contextUsageGen} ${tokenUsage.completionTokens} · ${dict.contextUsageTotal} ${tokenUsage.totalTokens} / ${limit}`
      : `${dict.contextUsageLimit} ${limit}`,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <main className="panel panel-center">
      <div className="panel-header chat-header">
        <div className="chat-header-left">
          <h2>{session?.title ?? dict.chat}</h2>
          {sessionCharacterName && (
            <span
              className="model-chip model-chip-char"
              title={dict.characterSessionHint}
            >
              {dict.character}: {sessionCharacterName}
            </span>
          )}
          <span className="model-chip" title={modelLabel}>
            {dict.usingModel}: {modelLabel}
          </span>
          <span
            className="model-chip model-chip-ctx"
            title={dict.contextSizeHint}
          >
            {dict.contextSize}: {formatContextLabel(contextSize)}
          </span>
        </div>
        <span className="badge">
          {generating
            ? dict.statusGenerating
            : rememberBusy
              ? dict.rememberWorking
              : dict.statusReady}
        </span>
      </div>

      <div className="context-usage-bar" title={usageTitle}>
        <div className="context-usage-meta">
          <span className="context-usage-label">{dict.contextUsageLabel}</span>
          <span className="context-usage-nums">
            {tokenUsage ? (
              <>
                <span>
                  {dict.contextUsagePrompt}{" "}
                  <strong>{tokenUsage.promptTokens.toLocaleString()}</strong>
                </span>
                <span className="ctx-sep">·</span>
                <span>
                  {dict.contextUsageGen}{" "}
                  <strong>
                    {tokenUsage.completionTokens.toLocaleString()}
                  </strong>
                </span>
                <span className="ctx-sep">·</span>
                <span>
                  {dict.contextUsageTotal}{" "}
                  <strong>{tokenUsage.totalTokens.toLocaleString()}</strong>
                  {" / "}
                  {limit.toLocaleString()}
                  {pct != null ? ` (${pct}%)` : ""}
                </span>
              </>
            ) : assembledBudget ? (
              <>
                <span>
                  {dict.contextPacked}{" "}
                  <strong>
                    ~{assembledBudget.estimatedPrompt.toLocaleString()}
                  </strong>
                  {" / "}
                  {limit.toLocaleString()}
                  {pct != null ? ` (${pct}%)` : ""}
                </span>
                <span className="ctx-sep">·</span>
                <span>
                  {dict.contextHot} {assembledBudget.hotCount}
                </span>
                <span className="ctx-sep">·</span>
                <span>
                  {dict.contextCold} {assembledBudget.coldCount}
                  {assembledBudget.trimmed ? ` · ${dict.contextTrimmed}` : ""}
                </span>
                {generating ? (
                  <>
                    <span className="ctx-sep">·</span>
                    <span>{dict.contextUsageWaiting}</span>
                  </>
                ) : null}
              </>
            ) : (
              <>
                {dict.contextUsageLimit} {limit.toLocaleString()} · —
              </>
            )}
          </span>
        </div>
        <div className="context-usage-track" aria-hidden>
          <div
            className={`context-usage-fill ${pct != null && pct >= 90 ? "ctx-hot" : pct != null && pct >= 70 ? "ctx-warm" : ""}`}
            style={{
              width: `${generating && !tokenUsage ? 12 : (pct ?? 0)}%`,
              opacity: tokenUsage || generating ? 1 : 0.35,
            }}
          />
        </div>
      </div>

      <div className="messages">
        {!session || session.messages.length === 0 ? (
          <div className="empty-state">
            <p>
              {emptyChatHint({
                locale: settings.locale,
                engineOnline: ollamaOnline,
                modelCount,
                memoryEnabled,
              })}
            </p>
            <div className="empty-state-actions">
              {!ollamaOnline && onStartEngine && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={onStartEngine}
                >
                  {dict.engineStart}
                </button>
              )}
              {ollamaOnline && modelCount === 0 && onOpenModelHub && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={onOpenModelHub}
                >
                  {dict.modelHub}
                </button>
              )}
            </div>
            {assembledBudget && assembledBudget.coldCount > 0 && (
              <p className="muted small" style={{ marginTop: 12 }}>
                {dict.memoryCompressedHint}
              </p>
            )}
          </div>
        ) : (
          session.messages.map((m) => (
            <Bubble
              key={m.id}
              message={m}
              dict={dict}
              memoryEnabled={memoryEnabled}
              rememberBusy={rememberBusy}
              showThinking={showThinking}
              fallbackCharacterName={sessionCharacterName}
              isStreaming={
                generating &&
                m.role === "assistant" &&
                m.id === session.messages[session.messages.length - 1]?.id
              }
              onRemember={() => onRememberText(m.content)}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {lastError && <div className="banner-error">{lastError}</div>}

      <div className="composer">
        <div className="composer-prefs" aria-label={dict.settingsChat}>
          <div className="pref-group">
            <span className="pref-label">{dict.answerLength}</span>
            <div className="pref-chips">
              {(
                [
                  ["concise", dict.answerLengthConcise],
                  ["normal", dict.answerLengthNormal],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`chip ${answerLength === id ? "chip-on" : ""}`}
                  disabled={generating}
                  onClick={() => onChangeSettings({ answerLength: id })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="pref-group">
            <span className="pref-label" title={dict.contextSizeHint}>
              {dict.contextSize}
            </span>
            <div className="pref-chips">
              {CONTEXT_SIZE_OPTIONS.map((size) => (
                <button
                  key={size}
                  type="button"
                  className={`chip ${contextSize === size ? "chip-on" : ""}`}
                  disabled={generating}
                  title={dict.contextSizeHint}
                  onClick={() => onChangeSettings({ contextSize: size })}
                >
                  {formatContextLabel(size)}
                </button>
              ))}
            </div>
          </div>
          <div className="pref-group">
            <span className="pref-label">{dict.showThinking}</span>
            <div className="pref-chips">
              <button
                type="button"
                className={`chip ${showThinking ? "chip-on" : ""}`}
                disabled={generating}
                onClick={() => onChangeSettings({ showThinking: true })}
              >
                {dict.memoryOn}
              </button>
              <button
                type="button"
                className={`chip ${!showThinking ? "chip-on" : ""}`}
                disabled={generating}
                onClick={() => onChangeSettings({ showThinking: false })}
              >
                {dict.memoryOff}
              </button>
            </div>
          </div>
        </div>

        <textarea
          value={input}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={dict.placeholder}
          rows={3}
          disabled={!session || generating}
        />
        <div className="composer-actions">
          {!ollamaOnline && (
            <span className="composer-hint">{dict.ollamaOfflineHint}</span>
          )}
          {memoryEnabled && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!input.trim() || rememberBusy || !session}
              onClick={() => onRememberText(input)}
              title={dict.rememberInput}
            >
              {dict.rememberInput}
            </button>
          )}
          {generating ? (
            <button type="button" className="btn btn-danger" onClick={onStop}>
              {dict.stop}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onSend}
              disabled={!input.trim() || !session || !ollamaOnline}
            >
              {dict.send}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

function Bubble({
  message,
  dict,
  memoryEnabled,
  rememberBusy,
  showThinking,
  fallbackCharacterName,
  isStreaming,
  onRemember,
}: {
  message: Message;
  dict: Dict;
  memoryEnabled: boolean;
  rememberBusy: boolean;
  showThinking: boolean;
  fallbackCharacterName?: string;
  isStreaming: boolean;
  onRemember: () => void;
}) {
  const hasThinking = Boolean(message.thinking?.trim());
  const [open, setOpen] = useState(false);

  // Auto-open while thinking is streaming and answer not yet started
  useEffect(() => {
    if (isStreaming && hasThinking && !message.content.trim()) {
      setOpen(true);
    }
  }, [isStreaming, hasThinking, message.content]);

  const charName =
    message.characterName || fallbackCharacterName || dict.character;
  const roleLabel = message.role === "user" ? dict.you : charName;

  return (
    <div className={`bubble bubble-${message.role}`}>
      <div className="bubble-role-row">
        <div className="bubble-role">
          {message.role === "assistant" ? (
            <span className="bubble-role-name">{roleLabel}</span>
          ) : (
            roleLabel
          )}
        </div>
        {memoryEnabled && message.role === "user" && message.content.trim() && (
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            disabled={rememberBusy}
            onClick={onRemember}
          >
            {dict.rememberThis}
          </button>
        )}
      </div>

      {showThinking && hasThinking && message.role === "assistant" && (
        <div className="thinking-block">
          <button
            type="button"
            className="thinking-toggle"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            <span className="thinking-chevron">{open ? "▾" : "▸"}</span>
            {isStreaming && !message.content.trim()
              ? dict.thinkingStreaming
              : dict.thinkingLabel}
          </button>
          {open && (
            <pre className="thinking-body">{message.thinking}</pre>
          )}
        </div>
      )}

      <div className="bubble-body">
        {message.content.trim() ? (
          <MarkdownBody content={message.content} />
        ) : isStreaming && hasThinking ? (
          ""
        ) : isStreaming ? (
          "…"
        ) : (
          "…"
        )}
      </div>
      {message.role === "assistant" &&
        message.content.trim() &&
        !isStreaming && (
          <div className="bubble-char-footer">
            {dict.characterReplyAs}：{charName}
          </div>
        )}
    </div>
  );
}
