# Local engine state machine (Ollama)

## Goal

- Product docs may say Ollama is required under the hood.
- Day-to-day: user only opens **Liora** — select models and chat here.
- **Never show the Ollama GUI/tray for normal use** — Liora starts headless `ollama serve` only.
- **When Liora exits**, if it started the engine this session, it **stops Ollama** too.
- If Ollama was already running before Liora opened, Liora does **not** kill it on exit.

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
- `start_ollama_serve` → headless `ollama serve` only (`CREATE_NO_WINDOW`; **not** `ollama app.exe`)
- `stop_ollama_serve` / process exit → `taskkill` ollama if Liora owns the process

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
