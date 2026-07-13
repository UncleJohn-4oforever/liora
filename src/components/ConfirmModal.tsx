import type { ReactNode } from "react";

interface Props {
  open: boolean;
  title: string;
  /** Short friendly description */
  description?: string;
  children?: ReactNode;
  /** Optional detail line (model name, path) */
  highlight?: string;
  cancelLabel: string;
  secondaryLabel?: string;
  primaryLabel: string;
  onCancel: () => void;
  onSecondary?: () => void;
  onPrimary: () => void;
  /** Avoid looking like an error dialog */
  tone?: "info" | "success";
}

/**
 * Centered, calm confirmation (not browser alert / not error-red).
 */
export function ConfirmModal({
  open,
  title,
  description,
  children,
  highlight,
  cancelLabel,
  secondaryLabel,
  primaryLabel,
  onCancel,
  onSecondary,
  onPrimary,
  tone = "info",
}: Props) {
  if (!open) return null;
  return (
    <div
      className="confirm-modal-backdrop"
      role="presentation"
      onClick={onCancel}
    >
      <div
        className={`confirm-modal tone-${tone}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-modal-icon" aria-hidden>
          {tone === "success" ? "✓" : "↓"}
        </div>
        <h2 id="confirm-modal-title">{title}</h2>
        {description && <p className="confirm-modal-desc">{description}</p>}
        {highlight && (
          <div className="confirm-modal-highlight" title={highlight}>
            {highlight}
          </div>
        )}
        {children}
        <div className="confirm-modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          {secondaryLabel && onSecondary && (
            <button
              type="button"
              className="btn btn-ghost confirm-secondary"
              onClick={onSecondary}
            >
              {secondaryLabel}
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={onPrimary}>
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
