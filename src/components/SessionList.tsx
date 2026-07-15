import { useMemo, useState, type DragEvent } from "react";
import type { Dict } from "../i18n";
import type { ChatFolder, Session } from "../types";

interface Props {
  dict: Dict;
  sessions: Session[];
  folders: ChatFolder[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onNewFolder: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onMoveSession: (sessionId: string, folderId: string | null) => void;
  onRenameFolder: (folderId: string, name: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onToggleFolder: (folderId: string) => void;
}

type MenuState =
  | { kind: "session"; x: number; y: number; sessionId: string }
  | { kind: "folder"; x: number; y: number; folderId: string }
  | null;

const DRAG_TYPE = "application/x-liora-session";

export function SessionList({
  dict,
  sessions,
  folders,
  activeId,
  onSelect,
  onNew,
  onNewFolder,
  onDelete,
  onRename,
  onMoveSession,
  onRenameFolder,
  onDeleteFolder,
  onToggleFolder,
}: Props) {
  const [menu, setMenu] = useState<MenuState>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const sortedFolders = useMemo(
    () => [...folders].sort((a, b) => a.createdAt - b.createdAt),
    [folders],
  );

  const unfiled = useMemo(
    () =>
      sessions
        .filter((s) => !s.folderId)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [sessions],
  );

  const byFolder = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const f of sortedFolders) map.set(f.id, []);
    for (const s of sessions) {
      if (!s.folderId) continue;
      const list = map.get(s.folderId);
      if (list) list.push(s);
      else {
        // orphan folder id → treat as unfiled visually by not listing under folder
      }
    }
    for (const [, list] of map) {
      list.sort((a, b) => b.updatedAt - a.updatedAt);
    }
    return map;
  }, [sessions, sortedFolders]);

  const orphanSessions = useMemo(() => {
    const folderIds = new Set(sortedFolders.map((f) => f.id));
    return sessions
      .filter((s) => s.folderId && !folderIds.has(s.folderId))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [sessions, sortedFolders]);

  const closeMenu = () => setMenu(null);

  const onDragStartSession = (e: DragEvent, sessionId: string) => {
    e.dataTransfer.setData(DRAG_TYPE, sessionId);
    e.dataTransfer.effectAllowed = "move";
  };

  const allowDrop = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const dropOn = (e: DragEvent, folderId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverKey(null);
    const id =
      e.dataTransfer.getData(DRAG_TYPE) || e.dataTransfer.getData("text/plain");
    if (!id) return;
    onMoveSession(id, folderId);
  };

  const renderSession = (s: Session) => (
    <div
      key={s.id}
      className={`session-item ${s.id === activeId ? "active" : ""}`}
      draggable
      onDragStart={(e) => onDragStartSession(e, s.id)}
      onClick={() => {
        closeMenu();
        onSelect(s.id);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setMenu({
          kind: "session",
          x: e.clientX,
          y: e.clientY,
          sessionId: s.id,
        });
      }}
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
  );

  const menuSession = menu?.kind === "session"
    ? sessions.find((s) => s.id === menu.sessionId)
    : null;

  return (
    <aside className="panel panel-left" onClick={closeMenu}>
      <div className="panel-header session-panel-header">
        <h2>{dict.sessions}</h2>
        <div className="session-header-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              onNewFolder();
            }}
            title={dict.newFolder}
          >
            {dict.newFolder}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              onNew();
            }}
          >
            {dict.newSession}
          </button>
        </div>
      </div>

      <div className="session-list">
        {sessions.length === 0 && sortedFolders.length === 0 && (
          <p className="muted pad">{dict.noSessions}</p>
        )}

        {sortedFolders.map((f) => {
          const kids = byFolder.get(f.id) ?? [];
          const collapsed = Boolean(f.collapsed);
          const dropKey = `folder:${f.id}`;
          return (
            <div
              key={f.id}
              className={`session-folder ${dragOverKey === dropKey ? "drag-over" : ""}`}
              onDragOver={(e) => {
                allowDrop(e);
                setDragOverKey(dropKey);
              }}
              onDragLeave={() =>
                setDragOverKey((k) => (k === dropKey ? null : k))
              }
              onDrop={(e) => dropOn(e, f.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenu({
                  kind: "folder",
                  x: e.clientX,
                  y: e.clientY,
                  folderId: f.id,
                });
              }}
            >
              <button
                type="button"
                className="session-folder-head"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFolder(f.id);
                }}
              >
                <span className="session-folder-chevron" aria-hidden>
                  {collapsed ? "▸" : "▾"}
                </span>
                <span className="session-folder-icon" aria-hidden>
                  📁
                </span>
                <span className="session-folder-name" title={f.name}>
                  {f.name}
                </span>
                <span className="session-folder-count muted small">
                  {kids.length}
                </span>
              </button>
              {!collapsed && (
                <div className="session-folder-body">
                  {kids.length === 0 ? (
                    <p className="muted small session-folder-empty">
                      {dict.folderDropHint}
                    </p>
                  ) : (
                    kids.map(renderSession)
                  )}
                </div>
              )}
            </div>
          );
        })}

        <div
          className={`session-root-zone ${dragOverKey === "root" ? "drag-over" : ""}`}
          onDragOver={(e) => {
            allowDrop(e);
            setDragOverKey("root");
          }}
          onDragLeave={() => setDragOverKey((k) => (k === "root" ? null : k))}
          onDrop={(e) => dropOn(e, null)}
        >
          {(unfiled.length > 0 || orphanSessions.length > 0) &&
            sortedFolders.length > 0 && (
              <div className="session-section-label muted small">
                {dict.unfiledChats}
              </div>
            )}
          {[...unfiled, ...orphanSessions].map(renderSession)}
        </div>
      </div>

      {menu && (
        <div
          className="session-context-menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
          role="menu"
        >
          {menu.kind === "session" && menuSession && (
            <>
              <div className="session-context-title muted small">
                {dict.moveToFolder}
              </div>
              <button
                type="button"
                className="session-context-item"
                role="menuitem"
                onClick={() => {
                  onMoveSession(menu.sessionId, null);
                  closeMenu();
                }}
              >
                {dict.unfiledChats}
              </button>
              {sortedFolders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`session-context-item ${menuSession.folderId === f.id ? "is-current" : ""}`}
                  role="menuitem"
                  onClick={() => {
                    onMoveSession(menu.sessionId, f.id);
                    closeMenu();
                  }}
                >
                  📁 {f.name}
                </button>
              ))}
              {sortedFolders.length === 0 && (
                <div className="session-context-empty muted small">
                  {dict.noFoldersYet}
                </div>
              )}
              <div className="session-context-sep" />
              <button
                type="button"
                className="session-context-item"
                role="menuitem"
                onClick={() => {
                  const next = window.prompt(dict.rename, menuSession.title);
                  if (next != null) onRename(menu.sessionId, next);
                  closeMenu();
                }}
              >
                {dict.rename}
              </button>
              <button
                type="button"
                className="session-context-item danger"
                role="menuitem"
                onClick={() => {
                  if (window.confirm(dict.confirmDeleteSession)) {
                    onDelete(menu.sessionId);
                  }
                  closeMenu();
                }}
              >
                {dict.delete}
              </button>
            </>
          )}
          {menu.kind === "folder" && (
            <>
              <button
                type="button"
                className="session-context-item"
                role="menuitem"
                onClick={() => {
                  const f = folders.find((x) => x.id === menu.folderId);
                  const next = window.prompt(
                    dict.renameFolder,
                    f?.name ?? "",
                  );
                  if (next != null) onRenameFolder(menu.folderId, next);
                  closeMenu();
                }}
              >
                {dict.renameFolder}
              </button>
              <button
                type="button"
                className="session-context-item danger"
                role="menuitem"
                onClick={() => {
                  if (window.confirm(dict.confirmDeleteFolder)) {
                    onDeleteFolder(menu.folderId);
                  }
                  closeMenu();
                }}
              >
                {dict.deleteFolder}
              </button>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
