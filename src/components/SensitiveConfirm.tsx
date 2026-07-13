import type { Dict } from "../i18n";

interface Props {
  dict: Dict;
  open: boolean;
  preview: string;
  tags: string[];
  onConfirm: () => void;
  onCancel: () => void;
}

export function SensitiveConfirm({
  dict,
  open,
  preview,
  tags,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;
  return (
    <div className="memory-drawer-backdrop" onClick={onCancel}>
      <div
        className="sensitive-modal"
        role="alertdialog"
        aria-labelledby="sens-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="sens-title">{dict.sensitiveTitle}</h2>
        <p className="muted small">{dict.sensitiveHint}</p>
        {tags.length > 0 && (
          <p className="sensitive-tags">
            {dict.sensitiveTags}: {tags.join(", ")}
          </p>
        )}
        <pre className="sensitive-preview">{preview.slice(0, 400)}</pre>
        <div className="sensitive-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            {dict.cancel}
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm}>
            {dict.confirmSaveMemory}
          </button>
        </div>
      </div>
    </div>
  );
}
