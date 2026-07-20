import type { Dict } from "../i18n";
import { isMetaCharacter } from "../lib/memory/scope";
import type { CharacterCard, Locale } from "../types";
import { CharacterRuntimeStage } from "./CharacterRuntimeStage";

interface Props {
  dict: Dict;
  locale: Locale;
  character: CharacterCard;
  defaultCharacterId: string;
  memoryCount: number;
  pipelineBusy: boolean;
  generating: boolean;
  onOpenMemory: () => void;
  /** Open character library hub (switch / create / export). */
  onOpenCharacterHub: () => void;
}

/**
 * Right rail: fixed 3:4 hero portrait + current session character.
 * Single entry to library: header "Library" (+ clickable portrait).
 */
export function CharacterPanel({
  dict,
  locale,
  character,
  defaultCharacterId,
  memoryCount,
  pipelineBusy,
  generating,
  onOpenMemory,
  onOpenCharacterHub,
}: Props) {
  const name = locale === "en" ? character.nameEn : character.name;
  const tagline = locale === "en" ? character.taglineEn : character.tagline;
  const description =
    locale === "en" ? character.descriptionEn : character.description;
  const isDefault = character.id === defaultCharacterId;
  const meta = isMetaCharacter(character);

  return (
    <aside className="panel panel-right panel-character">
      <div className="panel-header">
        <h2>{dict.characterPanel}</h2>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={generating}
          onClick={onOpenCharacterHub}
          title={dict.characterHubTitle}
        >
          {dict.characterLibrary}
        </button>
      </div>

      <div className="character-card character-card-hero">
        <button
          type="button"
          className={`character-art-btn character-hero-stage character-live-stage ${meta ? "is-meta" : "is-persona"}`}
          data-character-id={character.id}
          onClick={onOpenCharacterHub}
          disabled={generating}
          title={dict.characterHubTitle}
          aria-label={dict.characterHubTitle}
        >
          <CharacterRuntimeStage
            character={character}
            generating={generating}
            memoryWorking={pipelineBusy}
            label={
              character.avatarUrl
                ? undefined
                : meta
                  ? dict.characterMetaGhostHint
                  : dict.visualPlaceholder
            }
            alt={name}
          />
        </button>

        <div className="character-title-row">
          <h3 className="character-name">{name}</h3>
          {meta && (
            <span className="char-badge char-badge-meta">{dict.characterMeta}</span>
          )}
          <span className="char-badge char-badge-active">
            {dict.characterInSession}
          </span>
          {isDefault && (
            <span className="char-badge char-badge-default">
              {dict.characterDefault}
            </span>
          )}
        </div>

        {tagline ? (
          <p className="character-tagline" title={tagline}>
            {tagline}
          </p>
        ) : null}
        {description ? (
          <p className="character-desc" title={description}>
            {description}
          </p>
        ) : (
          <p className="character-desc muted">{dict.characterNoDesc}</p>
        )}
      </div>

      <div className="side-section character-side-tools">
        <div className="side-row">
          <span className="label muted small">
            {memoryCount} · {pipelineBusy ? dict.memoryWorking : "—"}
          </span>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={onOpenMemory}
          >
            {dict.openMemory}
          </button>
        </div>
        <p className="muted small pad-x">{dict.memoryHint}</p>
      </div>
    </aside>
  );
}
