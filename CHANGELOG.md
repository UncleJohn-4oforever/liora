# Changelog

本文件遵循 [Keep a Changelog](https://keepachangelog.com/) 风格，版本号遵循 `docs/VERSIONING.md`。

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
