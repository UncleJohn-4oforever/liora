import type { Dict } from "../i18n";
import type { MemoryItem } from "../types/memory";

interface Props {
  dict: Dict;
  open: boolean;
  memories: MemoryItem[];
  episodesCount: number;
  chunksCount: number;
  pipelineBusy: boolean;
  onClose: () => void;
  onEdit: (id: string, object: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onRunNow: () => void;
}

export function MemoryPanel({
  dict,
  open,
  memories,
  episodesCount,
  chunksCount,
  pipelineBusy,
  onClose,
  onEdit,
  onDelete,
  onClearAll,
  onRunNow,
}: Props) {
  if (!open) return null;

  const byLayer = {
    L3: memories.filter((m) => m.layer === "L3"),
    L4: memories.filter((m) => m.layer === "L4"),
    L5: memories.filter((m) => m.layer === "L5"),
  };

  return (
    <div className="memory-drawer-backdrop" onClick={onClose}>
      <aside
        className="memory-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={dict.memoryCenter}
      >
        <div className="panel-header">
          <h2>{dict.memoryCenter}</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            {dict.close}
          </button>
        </div>

        <div className="memory-meta pad-x">
          <span>
            {dict.memoryStats
              .replace("{n}", String(memories.length))
              .replace("{e}", String(episodesCount))
              .replace("{c}", String(chunksCount))}
          </span>
          {pipelineBusy && <span className="badge">{dict.memoryWorking}</span>}
        </div>

        <p className="muted small pad-x">{dict.memoryPanelHint}</p>

        <div className="memory-actions pad-x">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={pipelineBusy}
            onClick={onRunNow}
          >
            {dict.runMemoryNow}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm danger"
            onClick={() => {
              if (window.confirm(dict.confirmClearMemories)) onClearAll();
            }}
          >
            {dict.clearMemories}
          </button>
        </div>

        {(["L3", "L4", "L5"] as const).map((layer) => (
          <section key={layer} className="memory-section">
            <h3>
              {layer} ·{" "}
              {layer === "L3"
                ? dict.layerL3
                : layer === "L4"
                  ? dict.layerL4
                  : dict.layerL5}
            </h3>
            {byLayer[layer].length === 0 ? (
              <p className="muted small pad-x">{dict.noMemories}</p>
            ) : (
              byLayer[layer].map((m) => (
                <div key={m.id} className="memory-card">
                  <div className="memory-card-top">
                    <code>
                      {m.subject} · {m.predicate}
                    </code>
                    <span className="muted small">
                      conf {(m.confidence * 100).toFixed(0)}% · sp{" "}
                      {(m.specificity * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="memory-card-body">{m.object}</div>
                  <div className="memory-card-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => {
                        const next = window.prompt(dict.editMemory, m.object);
                        if (next != null && next.trim()) onEdit(m.id, next);
                      }}
                    >
                      {dict.edit}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs danger"
                      onClick={() => onDelete(m.id)}
                    >
                      {dict.delete}
                    </button>
                  </div>
                </div>
              ))
            )}
          </section>
        ))}
      </aside>
    </div>
  );
}
