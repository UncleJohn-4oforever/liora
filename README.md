# Liora

<p align="center">
  <strong style="font-size:1.35em">Please be nice to your AI</strong>
</p>

<p align="center">
  <em>Created with Grok 4.5</em>
</p>

---

**Version: 0.10.1** — [CHANGELOG](./CHANGELOG.md) · [Versioning](./docs/VERSIONING.md) · [Long-chat QA](./docs/QA_LONG_CHAT.md) · [Character QA](./docs/QA_CHARACTER.md) · [Vision](./docs/VISION.md)

**Local-first desktop AI** for everyday users: chat with models on your PC, remember what matters, keep long conversations without stuffing the whole history into the context window, and switch **character cards** per session.

| | |
|--|--|
| **Privacy** | Memory & chats stay on your machine — never uploaded by Liora |
| **Runtime** | [Ollama](https://ollama.com) under the hood (install once; day-to-day open only Liora; headless serve) |
| **Shell** | Tauri 2 + React + TypeScript (Windows tested) |
| **Characters** | Session-bound cards, 3:4 portraits, Meta steward + persona memory scopes |
| **Chats** | Folders, Markdown, long-chat compress |

> 中文：本地优先的桌面 AI。流式对话、分层记忆（主档 / 角色隔离）、滚动压缩、角色库与立绘、会话文件夹、模型中心。日常只开 Liora；数据在本机。

### Windows release (0.10.1)

After `npm run tauri build`:

`src-tauri/target/release/bundle/nsis/Liora_0.10.1_x64-setup.exe`

Attach that file to a GitHub Release (`v0.10.1`). Do **not** commit `node_modules/`, `src-tauri/target/`, or user data.

**Vision → text:** attach/paste image → local describe → text only in history. Import GGUF auto-attaches same-folder `mmproj` when present ([docs/VISION.md](./docs/VISION.md)).

---

## Please be nice to your AI

Treat models (and the people who build with them) with care: clear goals, honest feedback, no needless abuse of systems or of each other. Liora is meant to be a calm local tool — **please be nice to your AI**.

## Created with Grok 4.5

This project was designed and built in collaboration with **Grok 4.5** (xAI). If you fork, star, or ship Liora, keeping this credit visible is appreciated.

---

## What works today

### Chat & engine
- Streaming chat via local Ollama (`/api/chat`)
- **First-run wizard**: engine → model → data folder
- Engine lifecycle: detect · silent start · install guide (desktop)
- Thinking / reasoning display (when the model supports it)
- Reply style (balanced / work / companion) · answer length · context **4K / 8K / 16K**
- Context usage meter (packed estimate + Ollama measured tokens)
- Fix path for mid-reply cuts (`done_reason=length`, higher `num_predict`, settings apply immediately)
- Direct TCP to `127.0.0.1` (avoids system proxy 502/403)

### Models
- **Model hub**: recommended pulls (light / balanced / strong), custom name, progress + cancel
- **Import local GGUF** (`ollama create` via Modelfile)
- Pre-download / pre-import dialog: switch to model after install? (yes / no / cancel)

### Memory (product differentiator)
- **R1 Rolling context**: hot window only; cold turns summarized — long chats without linear context bloat
- **Budget assemble**: hard pack system + memory + hot under `num_ctx − gen reserve`
- **R2 Quality**: profile heuristics (name / pet / open loops), L3 merge rules, meso merge of micro episodes
- Explicit “remember”, sensitive confirm, memory center (edit / delete)
- Auto + manual “整理记忆”

### Data & backup
- **Desktop data dir** (default `%APPDATA%\Liora\data`): `memory.json` · `sessions.json` · `settings.json`
- **Choose folder** in Settings (migrate optional) · open folder · reset default
- Config pointer: `%APPDATA%\Liora\storage-config.json`
- Export / import JSON backup (merge / replace)
- **GitHub-safe**: user data is never in the repo

### Docs
- [docs/ENGINE.md](./docs/ENGINE.md) · [docs/MEMORY_MVP.md](./docs/MEMORY_MVP.md) · [docs/STORAGE.md](./docs/STORAGE.md) · [docs/BACKUP.md](./docs/BACKUP.md)

---

## Requirements

| Goal | Need |
|------|------|
| **Desktop** | Node.js LTS, [Rust](https://rustup.rs/), VS Build Tools (C++ / `link.exe`), [Ollama](https://ollama.com) |
| **Web UI only (dev)** | Node.js LTS + Ollama |

```bash
ollama pull qwen2.5:7b   # or use Model hub inside Liora
```

---

## Quick start

### Develop (web UI)

```bash
git clone <your-repo-url>
cd liora
npm install
npm run dev
```

Open the Vite URL (default `http://127.0.0.1:1420`). Start Ollama, then pick a model in Liora.

### Desktop build (Windows)

```bash
npm install
npm run version:sync -- 0.10.1   # when releasing
npm run tauri build
```

Installer:

`src-tauri/target/release/bundle/nsis/Liora_0.10.1_x64-setup.exe`

Requires Node.js, Rust, and VS C++ Build Tools. Or use `scripts/dev-desktop.ps1` for day-to-day dev.

---

## Where is my data?

| | Path |
|--|------|
| Default data | `%APPDATA%\Liora\data\` |
| Config (path pointer) | `%APPDATA%\Liora\storage-config.json` |
| Change location | **Settings → 数据位置 / Data location** |

Do **not** commit backup JSON into git. `.gitignore` already covers common backup names.

---

## Project status → next directions

### Done (shippable spine)

```
Scaffold → Engine → Chat stream → Memory MVP
  → Model hub / GGUF import → QoL (context, switch dialog)
  → Rolling compress + budget pack (R1)
  → Memory quality (R2)
  → User-selectable data directory + first-run wizard
  → Character library (session-bound) + unified persona
```

Current product story: **local · private · long chat · remembers what matters · you own the folder · characters are yours**.

### Recommended next (priority)

| Priority | Direction | Why |
|----------|-----------|-----|
| **P1** | Memory scoped per character (optional) | True multi-persona separation |
| **Done** | Markdown in chat (GFM) | Code / lists / tables readable |
| **P2** | Dedicated small summarizer model | Background compress without stealing main GPU |
| **P2** | Vector / embedding retrieval | Fuzzy “what did we say last month?” |
| **P2** | Code signing + GitHub Releases automation | Trust & distribution |
| **P3** | Character visual / portrait track | Differentiation, not blocking 1.0 |

**Not required for a credible v0.6 showcase:** cloud sync, multi-account login, full embedding stack.

---

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server |
| `npm run build` | `tsc` + Vite production build |
| `npm run tauri` | Tauri CLI |
| `npm run version:sync -- x.y.z` | Sync `package.json` / `tauri.conf.json` / `Cargo.toml` |

---

## License

See [LICENSE](./LICENSE) if present in this repository.

---

<p align="center">
  <strong>Please be nice to your AI</strong><br/>
  <sub>Created with Grok 4.5</sub>
</p>
