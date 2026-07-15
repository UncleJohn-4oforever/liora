import { useEffect, useMemo, useRef, useState } from "react";
import type { Dict } from "../i18n";
import {
  AvatarProcessException,
  mapAvatarError,
  processCharacterAvatarFile,
} from "../lib/characters/avatar";
import {
  downloadCharacterPack,
  mapCharacterImportError,
  mergeImportedCharacters,
  parseCharacterPackJson,
} from "../lib/characters/io";
import type { CharacterCard, Locale } from "../types";
import { CharacterPortrait } from "./CharacterPortrait";
import { isMetaCharacter } from "../lib/memory/scope";

interface Props {
  dict: Dict;
  locale: Locale;
  open: boolean;
  characters: CharacterCard[];
  activeCharacterId: string;
  defaultCharacterId: string;
  generating: boolean;
  onClose: () => void;
  onSelectCharacter: (id: string) => void;
  onSetDefaultCharacter: (id: string) => void;
  onSaveCharacter: (card: CharacterCard) => void;
  onDeleteCharacter: (id: string) => void;
  onReplaceCharacters: (items: CharacterCard[]) => void;
}

type EditorMode = "closed" | "create" | "edit";

export function CharacterHub({
  dict,
  locale,
  open,
  characters,
  activeCharacterId,
  defaultCharacterId,
  generating,
  onClose,
  onSelectCharacter,
  onSetDefaultCharacter,
  onSaveCharacter,
  onDeleteCharacter,
  onReplaceCharacters,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [editor, setEditor] = useState<EditorMode>("closed");
  const [formName, setFormName] = useState("");
  const [formTagline, setFormTagline] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formSystem, setFormSystem] = useState("");
  /** Draft portrait (data URL); null = none; undefined only internal */
  const [formAvatar, setFormAvatar] = useState<string | undefined>(undefined);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setEditor("closed");
      setConfirmDeleteId(null);
      setMsg(null);
      setErr(null);
      setFormAvatar(undefined);
      setAvatarBusy(false);
    }
  }, [open]);

  const sorted = useMemo(() => {
    return [...characters].sort((a, b) => {
      if (a.id === activeCharacterId) return -1;
      if (b.id === activeCharacterId) return 1;
      if (a.isBuiltin && !b.isBuiltin) return -1;
      if (!a.isBuiltin && b.isBuiltin) return 1;
      return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
    });
  }, [characters, activeCharacterId]);

  const previewCard: CharacterCard = useMemo(() => {
    const prev =
      editor === "edit" && editId
        ? characters.find((c) => c.id === editId)
        : undefined;
    const name = formName.trim() || prev?.name || "…";
    return {
      id: prev?.id ?? "char_preview",
      name,
      nameEn: name,
      tagline: formTagline,
      taglineEn: formTagline,
      description: formDesc,
      descriptionEn: formDesc,
      systemPrompt: formSystem,
      accent: prev?.accent ?? "",
      avatarUrl: formAvatar,
      isBuiltin: prev?.isBuiltin,
      kind: prev?.kind ?? "persona",
      source: prev?.source ?? "user",
    };
  }, [
    editor,
    editId,
    characters,
    formName,
    formTagline,
    formDesc,
    formSystem,
    formAvatar,
  ]);

  if (!open) return null;

  const openCreate = () => {
    setEditor("create");
    setEditId(null);
    setFormName("");
    setFormTagline("");
    setFormDesc("");
    setFormSystem("");
    setFormAvatar(undefined);
    setErr(null);
  };

  const openEdit = (c: CharacterCard) => {
    setEditor("edit");
    setEditId(c.id);
    setFormName(locale === "en" ? c.nameEn || c.name : c.name);
    setFormTagline(locale === "en" ? c.taglineEn || c.tagline : c.tagline);
    setFormDesc(
      locale === "en" ? c.descriptionEn || c.description : c.description,
    );
    setFormSystem(c.systemPrompt ?? "");
    setFormAvatar(c.avatarUrl);
    setErr(null);
  };

  const closeEditor = () => {
    setEditor("closed");
    setEditId(null);
    setFormAvatar(undefined);
    setAvatarBusy(false);
  };

  const onPickAvatar = async (file: File) => {
    setErr(null);
    setAvatarBusy(true);
    try {
      const { dataUrl } = await processCharacterAvatarFile(file);
      setFormAvatar(dataUrl);
      setMsg(dict.characterAvatarOk);
    } catch (e) {
      const code =
        e instanceof AvatarProcessException
          ? e.code
          : e instanceof Error
            ? e.message
            : "failed";
      setErr(mapAvatarError(code, dict));
    } finally {
      setAvatarBusy(false);
    }
  };

  const submitEditor = () => {
    const n = formName.trim();
    if (!n) return;
    if (editor === "create") {
      onSaveCharacter({
        id: "",
        name: n,
        nameEn: n,
        tagline: formTagline.trim(),
        taglineEn: formTagline.trim(),
        description: formDesc.trim(),
        descriptionEn: formDesc.trim(),
        systemPrompt: formSystem.trim() || undefined,
        accent: "",
        avatarUrl: formAvatar,
        isBuiltin: false,
        source: "user",
        kind: "persona",
      });
      setMsg(dict.characterCreatedToast);
    } else if (editor === "edit" && editId) {
      const prev = characters.find((c) => c.id === editId);
      if (!prev) return;
      onSaveCharacter({
        ...prev,
        name: n,
        nameEn: n,
        tagline: formTagline.trim(),
        taglineEn: formTagline.trim(),
        description: formDesc.trim(),
        descriptionEn: formDesc.trim(),
        systemPrompt: formSystem.trim() || undefined,
        avatarUrl: formAvatar,
        updatedAt: Date.now(),
      });
      setMsg(dict.characterSavedToast);
    }
    closeEditor();
  };

  const onImportFile = async (file: File) => {
    setErr(null);
    setMsg(null);
    try {
      const text = await file.text();
      const incoming = parseCharacterPackJson(text);
      const merged = mergeImportedCharacters(characters, incoming);
      onReplaceCharacters(merged);
      setMsg(dict.characterImportOk.replace("{n}", String(incoming.length)));
    } catch (e) {
      const code = e instanceof Error ? e.message : "failed";
      setErr(mapCharacterImportError(code, dict));
    }
  };

  const pendingDelete = confirmDeleteId
    ? characters.find((c) => c.id === confirmDeleteId)
    : null;

  const labelOf = (c: CharacterCard) =>
    locale === "en" ? c.nameEn || c.name : c.name;

  return (
    <div className="memory-drawer-backdrop" onClick={onClose}>
      <aside
        className="memory-drawer character-hub-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={dict.characterHubTitle}
      >
        <div className="panel-header">
          <h2>{dict.characterHubTitle}</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            {dict.close}
          </button>
        </div>

        <p className="muted small pad-x character-hub-intro">
          {dict.characterHubIntro}
        </p>

        <div className="character-hub-toolbar pad-x">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={generating}
            onClick={openCreate}
          >
            {dict.characterNew}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={generating}
            onClick={() => fileRef.current?.click()}
          >
            {dict.characterImport}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={characters.length === 0}
            onClick={() => downloadCharacterPack(characters)}
          >
            {dict.characterExportAll}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void onImportFile(f);
            }}
          />
        </div>

        {msg && <p className="pad-x character-hub-msg">{msg}</p>}
        {err && <p className="pad-x settings-err">{err}</p>}

        {editor !== "closed" && (
          <div className="char-editor character-hub-editor">
            <h4>
              {editor === "create" ? dict.characterNew : dict.characterEdit}
            </h4>

            <div className="char-avatar-row">
              <div className="char-avatar-preview">
                <CharacterPortrait
                  character={previewCard}
                  variant="hub"
                  alt={formName || dict.characterName}
                />
              </div>
              <div className="char-avatar-controls">
                <span className="label">{dict.characterAvatar}</span>
                <p className="muted small">{dict.characterAvatarHint}</p>
                <div className="char-avatar-btns">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={avatarBusy || generating}
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    {avatarBusy
                      ? dict.characterAvatarWorking
                      : formAvatar
                        ? dict.characterAvatarReplace
                        : dict.characterAvatarUpload}
                  </button>
                  {formAvatar && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={avatarBusy}
                      onClick={() => setFormAvatar(undefined)}
                    >
                      {dict.characterAvatarClear}
                    </button>
                  )}
                </div>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void onPickAvatar(f);
                  }}
                />
              </div>
            </div>

            <label className="char-field">
              <span>{dict.characterName}</span>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={dict.characterNamePh}
                maxLength={48}
              />
            </label>
            <label className="char-field">
              <span>{dict.characterTagline}</span>
              <input
                value={formTagline}
                onChange={(e) => setFormTagline(e.target.value)}
                placeholder={dict.characterTaglinePh}
                maxLength={80}
              />
            </label>
            <label className="char-field">
              <span>{dict.characterDesc}</span>
              <textarea
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder={dict.characterDescPh}
                rows={3}
                maxLength={2000}
              />
            </label>
            <label className="char-field">
              <span>{dict.characterSystem}</span>
              <textarea
                value={formSystem}
                onChange={(e) => setFormSystem(e.target.value)}
                placeholder={dict.characterSystemPh}
                rows={5}
                maxLength={8000}
              />
            </label>
            <div className="char-editor-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={closeEditor}
              >
                {dict.close}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!formName.trim() || avatarBusy}
                onClick={submitEditor}
              >
                {dict.characterSave}
              </button>
            </div>
          </div>
        )}

        {pendingDelete && (
          <div className="char-delete-bar character-hub-editor">
            <p className="muted small">
              {dict.confirmDeleteCharacter.replace(
                "{name}",
                labelOf(pendingDelete),
              )}
            </p>
            <div className="char-editor-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setConfirmDeleteId(null)}
              >
                {dict.close}
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => {
                  onDeleteCharacter(pendingDelete.id);
                  setConfirmDeleteId(null);
                  setMsg(dict.characterDeletedToast);
                }}
              >
                {dict.delete}
              </button>
            </div>
          </div>
        )}

        <section className="character-hub-section">
          <h3>{dict.characterYourCards}</h3>
          <div className="character-hub-grid">
            {sorted.map((c) => {
              const active = c.id === activeCharacterId;
              const isDefault = c.id === defaultCharacterId;
              const desc =
                locale === "en"
                  ? c.descriptionEn || c.description
                  : c.description;
              return (
                <article
                  key={c.id}
                  className={`character-hub-card ${active ? "is-active" : ""}`}
                >
                  <div className="character-hub-card-art">
                    <CharacterPortrait
                      character={c}
                      variant="hub"
                      alt={labelOf(c)}
                    />
                  </div>
                  <div className="character-hub-card-body">
                    <div className="character-hub-card-title">
                      <strong>{labelOf(c)}</strong>
                      {isMetaCharacter(c) && (
                        <span className="char-badge char-badge-meta">
                          {dict.characterMeta}
                        </span>
                      )}
                      {active && (
                        <span className="char-badge char-badge-active">
                          {dict.characterInSession}
                        </span>
                      )}
                      {isDefault && (
                        <span className="char-badge char-badge-default">
                          {dict.characterDefault}
                        </span>
                      )}
                    </div>
                    {(c.tagline || c.taglineEn) && (
                      <p className="character-hub-card-tag">
                        {locale === "en"
                          ? c.taglineEn || c.tagline
                          : c.tagline}
                      </p>
                    )}
                    {desc && (
                      <p className="character-hub-card-desc muted small">
                        {desc.length > 120 ? `${desc.slice(0, 120)}…` : desc}
                      </p>
                    )}
                    <div className="character-hub-card-actions">
                      <button
                        type="button"
                        className={`btn btn-sm ${active ? "btn-ghost" : "btn-primary"}`}
                        disabled={generating || active}
                        onClick={() => {
                          onSelectCharacter(c.id);
                          setMsg(
                            dict.characterSwitchedToast.replace(
                              "{name}",
                              labelOf(c),
                            ),
                          );
                        }}
                      >
                        {active
                          ? dict.characterInSession
                          : dict.characterUseInSession}
                      </button>
                      {!isDefault && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={generating}
                          onClick={() => onSetDefaultCharacter(c.id)}
                          title={dict.characterSetDefault}
                        >
                          {dict.characterSetDefaultShort}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={generating}
                        onClick={() => openEdit(c)}
                      >
                        {dict.edit}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => downloadCharacterPack([c])}
                      >
                        {dict.characterExport}
                      </button>
                      {!c.isBuiltin && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={generating}
                          onClick={() => setConfirmDeleteId(c.id)}
                        >
                          {dict.delete}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="character-hub-section character-hub-presets">
          <h3>{dict.characterPresetsTitle}</h3>
          <p className="muted small pad-x">{dict.characterPresetsSoon}</p>
        </section>
      </aside>
    </div>
  );
}
