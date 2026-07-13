# Local engine state machine (Ollama)

## Goal

- Product docs may say Ollama is required.
- Day-to-day: user only opens **Liora** — select models and chat here.
- No need to open the Ollama GUI for normal use.

## Phases

| Phase | Meaning |
|-------|---------|
| `checking` | Probing `http://127.0.0.1:11434` |
| `starting` | Desktop: spawned `ollama serve` |
| `online` | API OK; model list available |
| `offline` | Installed (or unknown) but API down |
| `not_installed` | Desktop: no `ollama.exe` found |
| `error` | Start failed |

## Desktop Tauri commands

- `detect_ollama(forceRefresh?)` → `{ installed, path, version }` (cached; no console window on Windows)
- `start_ollama_serve` → `ollama serve` with `CREATE_NO_WINDOW` (no PowerShell/cmd flash)

## Anti-flash policy (Windows)

- Prefer filesystem path checks over `where.exe`
- All helper `Command`s use `CREATE_NO_WINDOW`
- Periodic UI poll uses **HTTP probe only** when possible — does not re-spawn Ollama
- Auto-start `serve` runs **once** at boot, not on every poll

## Web

- Can probe API only; cannot spawn process.
- Shows install guide + recheck.

## Model selection

Top bar `<select>` lists `GET /api/tags` models; updates session + default settings.
