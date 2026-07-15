import type { CharacterCard } from "../types";
import { isMetaCharacter } from "../lib/memory/scope";
import type { PortraitVariant } from "../lib/characters/visual";

interface Props {
  character: CharacterCard;
  variant?: PortraitVariant;
  /** Optional clickable wrapper styles handled by parent */
  className?: string;
  label?: string;
  /** For button art: empty string keeps decorative */
  alt?: string;
}

/**
 * Fixed 3:4 portrait stage.
 * - persona: accent / future avatarUrl
 * - meta: same frame, ghost silhouette placeholder until custom art ships
 */
export function CharacterPortrait({
  character,
  variant = "hero",
  className = "",
  label,
  alt = "",
}: Props) {
  const meta = isMetaCharacter(character);
  const hasImage = Boolean(character.avatarUrl?.trim());
  const rootClass = [
    "char-portrait",
    `char-portrait-${variant}`,
    meta ? "char-portrait-meta" : "char-portrait-persona",
    hasImage ? "has-image" : "no-image",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={rootClass}
      style={
        !hasImage
          ? { background: character.accent || undefined }
          : undefined
      }
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
    >
      {hasImage ? (
        <img
          className="char-portrait-img"
          src={character.avatarUrl}
          alt={alt}
          draggable={false}
        />
      ) : meta ? (
        <div className="char-portrait-ghost" aria-hidden>
          <div className="char-ghost-glow" />
          <div className="char-ghost-figure">
            <div className="char-ghost-head" />
            <div className="char-ghost-body" />
          </div>
          <div className="char-ghost-mist" />
        </div>
      ) : (
        <div className="char-portrait-fallback" aria-hidden>
          <span className="char-portrait-initial">
            {(character.name || "?").slice(0, 1)}
          </span>
        </div>
      )}
      {label ? <span className="char-portrait-label">{label}</span> : null}
    </div>
  );
}
