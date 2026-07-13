# Changelog

本文件遵循 [Keep a Changelog](https://keepachangelog.com/) 风格，版本号遵循 `docs/VERSIONING.md`。

## [0.5.0] — 2026-07-13

### Added

- **可选数据目录**：记忆/会话/设置写入本机文件夹（默认 `%APPDATA%\Liora\data`）
- 设置 → 数据位置：选择文件夹、打开、恢复默认、可选迁移
- 配置指针：`%APPDATA%\Liora\storage-config.json`（固定）；数据可放到任意盘
- 首次启动：从旧 WebView IndexedDB 自动迁到数据目录（若目标为空）

### Notes

- 浏览器预览仍用 IndexedDB；选目录仅桌面版
- GitHub 仓库不含用户数据

## [0.4.1] — 2026-07-13

### Added

- **记忆质量 R2**：画像启发式（我叫X / 宠物名 / open loops）
- L3 身份事实冲突覆盖与去重；注入优先 name/pet
- Episode 展示 open_loops + entities；micro 过多时 **Meso 合并**

### Notes

- 目标：第 5 轮说的名字/宠物，在第 40 轮热区滚出后仍可通过 L3/摘要想起

## [0.4.0] — 2026-07-13

### Added

- **滚动压缩 + 预算组装（R1）**：热区硬窗口、冷区只进摘要、发送前按 num_ctx 硬打包
- 冷区 Micro-summary 触发（滚出热区即压）；模型失败时启发式摘要仍推进 cursor
- 用量条显示组装估算 / 热区·冷区条数；回复后仍显示 Ollama 实测

### Notes

- 第一版长聊特色路径：8K 下长对话不再线性塞满原文
- 向量库与专用小总结模型仍为后续增强

## [0.3.5] — 2026-07-13

### Changed

- 切换模型确认改为居中美化弹窗（不再用系统 alert）
- **在下载/导入开始前**询问是否完成后切换，避免工作中途被打断

## [0.3.4] — 2026-07-13

### Changed

- 下载/导入模型完成后询问是否立刻切换为当前模型（可选）
- 新建会话或切换会话时重置上下文用量显示

## [0.3.3] — 2026-07-13

### Added

- **上下文用量条**：显示上限（num_ctx）与上次真实用量（提示词 + 生成 token，含思考）
- 占用进度条（≥70% 变黄、≥90% 变红）

## [0.3.2] — 2026-07-13

### Fixed

- 长回答中途停止：提高思考模型下的 `num_predict`，修复设置未实时生效导致仍用旧上限
- 识别 Ollama `done_reason=length` 并提示提高上下文 / 关闭思考
- 流结束后避免误 cancel 竞态；读超时放宽

## [0.3.1] — 2026-07-13

### Added

- **导入本地 GGUF**：模型中心可选本机 `.gguf` 文件，填写名称后注册到 Ollama（`ollama create`）
- 可选 system 提示；导入后刷新列表并自动选中

### Notes

- 仅桌面版；需已安装 Ollama。大文件导入可能需数分钟

## [0.3.0] — 2026-07-13

### Added

- **模型中心**：应用内推荐模型 + 一键 pull 下载（无需打开 Ollama UI）
- 三档推荐：轻量 `qwen2.5:1.5b` / 均衡 `qwen2.5:7b` / 强力 `qwen2.5:14b`
- 按本机内存粗略标注「推荐」档；支持自定义模型名下载
- 下载进度条、取消；完成后刷新模型列表并自动选中
- 无本地模型时顶部提示条引导下载
- Rust 直连 `/api/pull`（与聊天一致，避开系统代理）

### Notes

- 下载需要网络；体积大时可能较久

## [0.2.0] — 2026-07-13

### Added

- 本地 Ollama 真流式对话与模型选择（Liora 内切换）
- 引擎状态机：检测 / 静默启动 serve / 安装引导（日常无需操作 Ollama UI）
- 分层记忆 MVP：自动整理、立即整理、显式「记住」、高敏确认、记忆中心
- 记忆注入增强：L3 全局注入、L4/L5 分层、toast 摘要
- 设置页：语言、记忆开关、默认模型、自动整理频率
- 导出 / 导入备份（合并 / 覆盖）
- IndexedDB 持久化（会话 + 记忆 + 设置）
- Tauri 2 桌面壳；Windows 下避免引擎检测闪控制台
- 思考过程展示、回复风格、回答篇幅、上下文 4K/8K/16K

### Changed

- 浏览器端不以 sql.js 为启动依赖（走 IDB，避免 initSqlJs 失败）
- 聊天/探测改为 Rust 直连，规避系统代理 502/403

### Notes

- 运行时仍依赖本机 Ollama + 至少一个模型

## [0.1.0] — 2026-07-12

### Added

- 初始脚手架：Tauri + React + TS
- 三栏 UI、中英 i18n、会话与角色卡占位
- 早期 mock / Ollama 对接雏形

---

[0.3.0]: https://github.com/example/liora/releases/tag/v0.3.0
[0.2.0]: https://github.com/example/liora/releases/tag/v0.2.0
[0.1.0]: https://github.com/example/liora/releases/tag/v0.1.0
