import type { Dict } from "../i18n";
import type { Session } from "../types";

interface Props {
  dict: Dict;
  sessions: Session[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

export function SessionList({
  dict,
  sessions,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
}: Props) {
  return (
    <aside className="panel panel-left">
      <div className="panel-header">
        <h2>{dict.sessions}</h2>
        <button type="button" className="btn btn-primary btn-sm" onClick={onNew}>
          {dict.newSession}
        </button>
      </div>
      <div className="session-list">
        {sessions.length === 0 && (
          <p className="muted pad">{dict.noSessions}</p>
        )}
        {sessions.map((s) => (
          <div
            key={s.id}
            className={`session-item ${s.id === activeId ? "active" : ""}`}
            onClick={() => onSelect(s.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSelect(s.id);
            }}
            role="button"
            tabIndex={0}
          >
            <div className="session-title" title={s.title}>
              {s.title || dict.untitled}
            </div>
            <div className="session-meta">
              {new Date(s.updatedAt).toLocaleString()}
            </div>
            <div className="session-actions">
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  const next = window.prompt(dict.rename, s.title);
                  if (next != null) onRename(s.id, next);
                }}
              >
                {dict.rename}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-xs danger"
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(dict.confirmDeleteSession)) onDelete(s.id);
                }}
              >
                {dict.delete}
              </button>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
