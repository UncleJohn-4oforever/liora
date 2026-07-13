# Storage

## Desktop (Tauri) — primary for users

| Item | Location |
|------|----------|
| **Config pointer** (fixed) | `%APPDATA%\Liora\storage-config.json` |
| **Default data dir** | `%APPDATA%\Liora\data\` |
| **User-chosen data dir** | Any folder selected in Settings → 数据位置 |

### Files inside the data directory

| File | Content |
|------|---------|
| `memory.json` | Long-term memory (L2–L5), episodes, chunks, cursors |
| `sessions.json` | Chat sessions & messages |
| `settings.json` | Locale, model, memory switch, context size, etc. |

**Nothing is uploaded.** Changing the folder can optionally **migrate** (copy) these three files.

### Settings UI

- Show current path  
- **选择文件夹…** → pick path + confirm migrate  
- **打开数据文件夹**  
- **恢复默认位置**  
- **打开配置目录** (`%APPDATA%\Liora`)

## Browser / dev preview

- **IndexedDB** `liora-kv` keys: `sessions`, `memory`, `settings`  
- **localStorage** mirror for legacy migration  
- Folder picker is desktop-only  

## First-run migration

1. Create default `%APPDATA%\Liora\data` if missing  
2. If desktop data empty but WebView IndexedDB has sessions/memory → copy into data dir  
3. If still empty, import `liora.*.v1` localStorage keys  

## Git / GitHub

User data is **never** inside the source tree. Safe to publish the repo; do not commit exported `*.backup.json`.
