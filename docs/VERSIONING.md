# Liora 版本号规范

采用 **Semantic Versioning 2.0**（语义化版本）：`MAJOR.MINOR.PATCH`  
当前产品未到 1.0：**0.x** 表示公测/快速迭代，允许破坏性变更，但须写进 CHANGELOG。

## 1. 格式

```text
MAJOR.MINOR.PATCH[-prerelease]

例：0.2.0、0.2.1、0.3.0-beta.1、1.0.0
```

| 位 | 何时 +1 | 同时清零 |
|----|---------|----------|
| **MAJOR** | 不兼容的架构/数据格式变更，或正式 1.0 对外承诺稳定 | MINOR、PATCH → 0 |
| **MINOR** | 向后兼容的**功能**：新模块、新设置、新 UI 能力 | PATCH → 0 |
| **PATCH** | 向后兼容的**修复**：崩修、文案、性能、小优化 | — |

预发布后缀（可选）：`-alpha.N` / `-beta.N` / `-rc.N`，仅用于安装包试发，**默认不要**推到主分支 package 的长期版本。

## 2. 0.x 阶段约定（当前）

- **0.1.x**：脚手架、真对话雏形  
- **0.2.x**：记忆 + 备份 + 引擎状态机 + 桌面壳可用  
- **0.3.x**：模型推荐 / 应用内 pull 下载 / GGUF 导入  
- **0.4.x**：滚动压缩 + 预算组装 + 记忆质量 R2  
- **0.5.x**：可选本机数据目录、首启向导、错误文案  
- **0.6.x**：角色库、Markdown、角色库独立页  
- **0.7.x**：记忆 R3（Meta/主档 vs 角色）、立绘上传、会话文件夹、引擎无感生命周期  
- **0.8.x**：看图转文字、GGUF+mmproj 导入、vision 能力探测（**当前基线**）  
- **0.9.x+**：向量检索、2D 动作 / L6、分发签名等  
- **1.0.0**：安装体验闭环、文档齐全、核心路径稳定后再升  

0.x 的 MINOR 可以包含「有感的产品变化」；若仅修闪退/文案，只动 PATCH。

## 3. 必须同步的文件（单一事实源）

改版本时**三处保持一致**（以 `package.json` 为入口）：

| 文件 | 字段 |
|------|------|
| `package.json` | `"version"` |
| `src-tauri/tauri.conf.json` | `"version"` |
| `src-tauri/Cargo.toml` | `version = "..."` |

辅助：

| 文件 | 作用 |
|------|------|
| `CHANGELOG.md` | 每个发布版本一节 |
| Git tag | `v0.2.0`（与 package 一致） |

**不要**只改 UI 标题而不改上述三处。

## 4. 推荐工作流

### 4.1 开发中

- 日常 commit **不必**每次改版本号  
- 准备发安装包 / 打 GitHub Release / 给他人试用时再 bump  

### 4.2 发版步骤

1. 确定类型：fix → PATCH；feature → MINOR；break → MAJOR（或 0.x 下的大 MINOR + 文档说明）  
2. 运行：

```bash
npm run version:sync -- 0.2.1
```

3. 更新 `CHANGELOG.md` 顶部  
4. `npm run build` 与（可选）`npm run tauri build`  
5. `git commit -am "chore: release v0.2.1"`  
6. `git tag v0.2.1` 并 push tag  
7. 上传 Release 产物（若有）  

### 4.3 打包与版本

- 安装包文件名由 Tauri 使用 `tauri.conf.json` 的 version  
- 用户反馈问题时**先问版本号**（设置页或关于信息后续可展示）  

## 5. 变更类型速查

| 变更 | 版本 |
|------|------|
| 修 PowerShell 闪窗、崩修 | PATCH |
| 引擎状态机、记忆注入、设置备份 | MINOR（已体现在 0.2.0） |
| 模型推荐 + pull | 下一 MINOR（如 0.3.0） |
| 存储格式不兼容、必须清库 | 0.x 下至少 MINOR + CHANGELOG 醒目说明；1.0 后优先 MAJOR |
| 仅文档 / CI | 可不改版本，或 PATCH |

## 6. 与「文档版本」区别

| 名称 | 含义 |
|------|------|
| **产品版本**（本文件） | 用户安装的 Liora，`0.2.0` |
| **开发手册文档版本** | `local-ai-desktop/开发手册.md` 的 v0.x，可独立递增 |

二者不必相同，但发产品版时建议在手册「最后更新」里记一笔产品版本。
