# Changelog

本文件遵循 [Keep a Changelog](https://keepachangelog.com/) 风格，版本号遵循 `docs/VERSIONING.md`。

## [Unreleased]

## [0.10.2] — 2026-07-20

### Changed

- New installations and last-resort recovery mode now default to English; existing users keep their saved language choice

## [0.10.1] — 2026-07-18

### Fixed

- Windows 桌面存储临时文件使用可写句柄执行 `sync_all`，修复保存 characters / memory 时出现 `sync tmp: 拒绝访问 (os error 5)` 并错误进入 fallback mode
- 新增实际临时文件写入与磁盘同步回归测试

## [0.10.0] — 2026-07-18

### Changed

- **角色舞台优先**：保留并加宽常驻角色区域，建立可替换为 Live2D Canvas 的稳定舞台容器
- 角色区聚焦立绘、身份与角色记忆；移除重复的模型信息和通用记忆开关
- 对话输入区默认只显示当前配置摘要，回答长度、上下文、思考显示与记忆开关改为一键展开
- 上下文用量仅在展开对话设置或接近容量时显示
- 顶栏移除重复语言切换入口（语言仍可在设置中直接切换）
- 模型信息集中到顶栏，聊天标题和角色舞台不再重复展示

### Removed

- 自动敏感内容判断、确认弹窗和自动可见性限制
- `shared` / `meta-summary` / `meta-full` / `character-only` 记忆可见性层；保留直观的主档、角色、无主归属

### Notes

- 产品默认尊重本地开源模型用户的自主选择，不根据记忆内容进行道德或敏感性判断
- 未来如增加可见性控制，应直接放在每条记忆旁边，而不是隐藏在设置深处

## [0.9.0] — 2026-07-18

### Added

- **Meta 记忆管理员 R4**：Meta 明确认知自己是本地 AI，并拥有角色记忆目录、相关跨角色摘要检索和无主记忆审查能力
- `orphan` 无主记忆域与 `shared` / `meta-summary` / `meta-full` / `character-only` 可见性策略
- Meta 记忆中心可将记忆认领到用户主档，或重新分配给任一角色
- 普通角色可读取允许共享的用户主档，同时继续隔离其他角色的私有经历
- scope v2 自动迁移与 Meta 权限测试

### Changed

- 敏感记忆默认不会跨角色共享：Meta 主档使用 `meta-full`，角色敏感记忆使用 `character-only`
- Meta 默认只接收角色目录摘要；仅在用户问题相关时检索允许访问的角色记忆详情
- 无明确 `characterId` 的旧记忆进入无主池，不再自动归给默认角色

### Fixed

- 备份重复合并保持幂等，并保留记忆作用域迁移版本
- 桌面存储失败提示、JSON 校验与 `.bak` 恢复
- Tauri 开发端口、权限收敛、前端分包和持续集成检查

## [0.8.0] — 2026-07-16

### Added

- **看图转文字（默认）**：聊天贴图 / 粘贴截图 → 本地 vision 描述 → 仅文本注入上下文（`【图片内容描述】`）；原图不进历史
- Composer「贴图」预览与移除；发送中顶栏显示「看图中」
- 角色库立绘可选「看图生成描述」填入描述草稿
- **导入 GGUF 自动附带 mmproj**：同目录检测视觉投影模块，与主模型一并 `ollama create`（失败则回退纯文本并提示）
- 看图模型按 Ollama `capabilities: vision` 选择，避免把文本模型当多模态用
- [docs/VISION.md](./docs/VISION.md)

### Notes

- Windows 安装包：`Liora_0.8.0_x64-setup.exe`
- 已导入的纯文本 GGUF 需**重新导入**（主模型 + 同目录 mmproj）后才会带 vision
- LM Studio 能看图 ≠ 旧 Ollama 导入结果；本版导入路径对齐双 GGUF 打包

## [0.7.1] — 2026-07-15

### Fixed

- **模型常驻与首 token 过慢**：
  - 聊天/记忆统一 `keep_alive: -1`（进程内常驻，对齐裸 Ollama / LM Studio）
  - **生成中**中止/暂缓记忆整理（打字期间仍可整理）；生成结束后再跑 pipeline
  - 记忆/预热 `num_ctx` 与主对话一致，避免 KV cache 反复重建
  - 顶部仅在换模/冷启动显示「加载」；同模型连续聊显示「生成中」
- 失效模型 id 自动纠正；模型 404 文案更清晰

### Changed

- **顶部引擎状态**：下载模型 / 切换模型预热 / 发送时显示文案 + 进度条

### Notes

- Windows 安装包：`Liora_0.7.1_x64-setup.exe`

## [0.7.0] — 2026-07-15

### Added

- **记忆 R3 作用域**：`master`（用户主档，仅 Meta 注入）/ `character`（角色私有）
- 内置 Liora 为 **Meta（本机 AI）**；扮演角色 `kind: persona`
- 旧记忆一次性迁移：L3 身份类 → master，其余 → 默认角色
- [docs/MEMORY_SCOPE.md](./docs/MEMORY_SCOPE.md)
- **角色视觉框 3:4**：主舞台 + 角色库缩略；`avatarUrl`；Meta 虚影占位
- **角色立绘上传**：自动裁切 3:4、JPEG 写入角色卡
- [docs/CHARACTER_VISUAL.md](./docs/CHARACTER_VISUAL.md)
- **会话文件夹**：新建文件夹；拖拽 / 右键移动会话；删文件夹不删会话
- 聊天 **Markdown（GFM）**（自 0.6.1 延续，本版一并发布）
- 角色库独立页 + 角色 JSON 导入导出（自 0.6.1）

### Changed

- **引擎生命周期**：仅静默 `ollama serve`（不拉 Ollama 托盘 GUI）；本会话由 Liora 拉起则**退出时关闭 Ollama**；启动前已在线则不杀
- 失效模型名自动纠正到已安装列表；404「模型不存在」文案更清晰
- 右侧角色区去掉重复的「打开角色库」按钮，保留标题「角色库」+ 点击立绘

### Notes

- 日常只需打开 Liora；Ollama 作为底层引擎安装一次即可
- Windows 安装包：`Liora_0.7.0_x64-setup.exe`

## [0.6.1] — 2026-07-15

### Added

- **聊天 Markdown**：助手/用户气泡渲染 GFM（标题、列表、代码块、表格、链接）；无 raw HTML
- 角色 JSON 单卡/整库导入导出（角色库内）

### Changed

- **角色管理独立页**：右侧仅展示醒目的当前会话角色卡；新建 / 切换 / 导入导出等移至「角色库」抽屉

## [0.6.0] — 2026-07-15

### Added

- **角色库（会话级）**：新建 / 编辑 / 删除角色卡；内置 Liora 不可删
- **默认角色**：仅影响「新建会话」；切换角色只改**当前会话**
- 角色描述 / 系统指令注入对话 system
- 每条助手消息标注**当时回复角色**
- 桌面数据目录新增 `characters.json`
- 备份 / 恢复包含角色库
- [docs/QA_CHARACTER.md](./docs/QA_CHARACTER.md)

### Removed

- Reply style 芯片；模型导入 System prompt；系统提示中的说教性限制

## [0.5.1] — 2026-07-15

### Added

- 首启三步向导、统一错误文案、空会话引导、压缩 toast、长聊 QA 清单

## [0.5.0] — 2026-07-13

### Added

- 可选本机数据目录、设置改路径、storage-config 指针

## [0.4.x] — earlier

- R1 滚动压缩 + 预算组装；R2 记忆质量

## [0.3.x] — earlier

- 模型中心 / GGUF / 引擎状态机
