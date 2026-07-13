import type { Dict } from "../i18n";

interface Props {
  dict: Dict;
  count: number;
  labels: string[];
  detail?: string;
  onOpen: () => void;
  onDismiss: () => void;
}

export function MemoryToast({
  dict,
  count,
  labels,
  detail,
  onOpen,
  onDismiss,
}: Props) {
  if (count <= 0) return null;
  const sub = detail || labels[0];
  return (
    <div className="memory-toast" role="status">
      <button type="button" className="memory-toast-main" onClick={onOpen}>
        <span className="memory-toast-title">
          {count === 1
            ? dict.memoryUpdated
            : `${dict.memoryUpdated}（${count}）`}
        </span>
        {sub && <span className="memory-toast-sub">{sub}</span>}
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-xs"
        onClick={onDismiss}
        aria-label="dismiss"
      >
        ×
      </button>
    </div>
  );
}
