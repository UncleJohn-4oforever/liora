import type { Dict } from "../i18n";

interface Props {
  dict: Dict;
  open: boolean;
  isDesktop: boolean;
  onClose: () => void;
  onOpenDownload: () => void;
  onRecheck: () => void;
}

export function EngineGuide({
  dict,
  open,
  isDesktop,
  onClose,
  onOpenDownload,
  onRecheck,
}: Props) {
  if (!open) return null;
  return (
    <div className="memory-drawer-backdrop" onClick={onClose}>
      <div
        className="sensitive-modal engine-guide"
        role="dialog"
        aria-labelledby="engine-guide-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="engine-guide-title">{dict.engineGuideTitle}</h2>
        <p className="muted small">{dict.engineGuideIntro}</p>
        <ol className="engine-guide-steps">
          <li>{dict.engineGuideStep1}</li>
          <li>{dict.engineGuideStep2}</li>
          <li>{dict.engineGuideStep3}</li>
        </ol>
        <p className="muted small">{dict.engineGuideNote}</p>
        <div className="sensitive-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {dict.close}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onOpenDownload}>
            {dict.engineOpenDownload}
          </button>
          <button type="button" className="btn btn-primary" onClick={onRecheck}>
            {isDesktop ? dict.engineStart : dict.engineRetry}
          </button>
        </div>
      </div>
    </div>
  );
}
