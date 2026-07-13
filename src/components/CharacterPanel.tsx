import type { Dict } from "../i18n";
import type { CharacterCard, Locale } from "../types";

interface Props {
  dict: Dict;
  locale: Locale;
  character: CharacterCard;
  modelLabel: string;
  memoryEnabled: boolean;
  memoryCount: number;
  pipelineBusy: boolean;
  onToggleMemory: () => void;
  onOpenMemory: () => void;
}

export function CharacterPanel({
  dict,
  locale,
  character,
  modelLabel,
  memoryEnabled,
  memoryCount,
  pipelineBusy,
  onToggleMemory,
  onOpenMemory,
}: Props) {
  const name = locale === "en" ? character.nameEn : character.name;
  const tagline = locale === "en" ? character.taglineEn : character.tagline;
  const description =
    locale === "en" ? character.descriptionEn : character.description;

  return (
    <aside className="panel panel-right">
      <div className="panel-header">
        <h2>{dict.characterPanel}</h2>
      </div>

      <div className="character-card">
        <div
          className="character-art"
          style={{ background: character.accent }}
          aria-hidden
        >
          <span className="character-art-label">{dict.visualPlaceholder}</span>
        </div>
        <h3 className="character-name">{name}</h3>
        <p className="character-tagline">{tagline}</p>
        <p className="character-desc">{description}</p>
        <p className="muted small">{dict.visualLater}</p>
      </div>

      <div className="side-section">
        <div className="side-row">
          <span className="label">{dict.model}</span>
          <span className="value mono">{modelLabel}</span>
        </div>
        <div className="side-row">
          <span className="label">{dict.memory}</span>
          <button
            type="button"
            className={`btn btn-sm ${memoryEnabled ? "btn-primary" : "btn-ghost"}`}
            onClick={onToggleMemory}
          >
            {memoryEnabled ? dict.memoryOn : dict.memoryOff}
          </button>
        </div>
        <div className="side-row">
          <span className="label muted small">
            {memoryCount} · {pipelineBusy ? dict.memoryWorking : "—"}
          </span>
          <button
            type="button"
            className="btn btn-sm btn-primary"
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
