# Liora

**Version: 0.2.0** — see [CHANGELOG](./CHANGELOG.md) · [Versioning](./docs/VERSIONING.md)

本地优先的桌面 AI 助手：**Ollama 真对话** + **可审计分层记忆** + **设置/备份**。  
数据默认留在本机（IndexedDB），不上传云端。

> English: Local-first desktop AI assistant with Ollama chat, structured memory, and JSON backup. Private by default.

## Features

- Chat with local models via [Ollama](https://ollama.com) (streaming)
- **Engine state machine**: detect / auto-start `ollama serve` (desktop) / install guide — day-to-day you only open Liora
- **Model picker in Liora** (no need to use the Ollama app UI)
- Memory: auto extract + “remember this” + memory center (L3/L4/L5)
- Sensitive-content confirm before save
- Settings: language, default model, auto-memory interval
- Export / import backup (sessions + memory + settings)
- Desktop shell: **Tauri 2** (Windows tested)
- Web UI for development: Vite + React + TypeScript

## Requirements

| Use case | Need |
|----------|------|
| **Web UI only** | [Node.js](https://nodejs.org/) LTS, [Ollama](https://ollama.com) |
| **Desktop (Tauri)** | Above + [Rust](https://rustup.rs/) + **Visual Studio Build Tools** with **C++** workload (`link.exe`) |

Optional: a local model already pulled into Ollama, e.g.:

```bash
ollama pull llama3.2
# or create from your own GGUF — see docs below
```

## Quick start (web)

```bash
git clone https://github.com/<YOU>/<REPO>.git
cd <REPO>
npm install
npm run dev
```

Open the URL printed by Vite (default `http://127.0.0.1:1420`).

Keep Ollama running. In Liora **Settings**, set **default model** to a name from `ollama list`.

### Fresh port (Windows)

```bash
npm run dev:fresh
```

## Desktop (Tauri)

```bash
# Windows: open "x64 Native Tools Command Prompt for VS" or load vcvars64,
# then:
npm install
npm run tauri dev
```

Helper script (PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev-desktop.ps1
```

Build installer (NSIS on Windows):

```bash
npm run tauri build
```

Artifacts appear under `src-tauri/target/release/bundle/`.

## Import a local GGUF into Ollama

Ollama does **not** auto-scan arbitrary folders. Create a `Modelfile`:

```text
FROM /absolute/path/to/model.gguf
PARAMETER temperature 0.7
```

```bash
ollama create my-model -f Modelfile
ollama list
```

Put large models on a disk with space; optional env:

```text
OLLAMA_MODELS=D:\ollama\models
```

## Docs in repo

| File | Content |
|------|---------|
| `docs/VERSIONING.md` | SemVer rules & release workflow |
| `CHANGELOG.md` | Release notes |
| `docs/MEMORY_MVP.md` | Memory pipeline |
| `docs/ENGINE.md` | Ollama engine state machine |
| `docs/BACKUP.md` | Backup JSON format |
| `docs/STORAGE.md` | IndexedDB storage |
| `scripts/dev-desktop.ps1` | Desktop start helper |

### Bump version (maintainers)

```bash
npm run version:sync -- 0.2.1
# then edit CHANGELOG.md, commit, tag v0.2.1
```

Design notes (Chinese) may live outside this repo (`local-ai-desktop/开发手册.md` if you keep that folder private).

## Privacy

- Chat and memory stay on the user’s machine by default  
- Backup export is a local file the user chooses to share  
- Do not commit personal chats, backups, or API keys  

## License

Add a license before publishing (e.g. MIT / Apache-2.0). Until you add one, others have no clear rights to use or modify.

## Roadmap (short)

- Native app data directory (shared desktop storage)
- Optional release binaries on GitHub Releases
- Stronger memory extraction / embeddings

## Contributing

Issues and PRs welcome after the repo is public. Please open an issue before large features.
