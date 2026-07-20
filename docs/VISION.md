# Vision → text（看图转文字）

Liora 默认把图片变成**文本描述**再进入对话上下文，**不把原图写入多模态历史**。

## 产品原则

1. **不落历史图**：`Message` 只存字符串；composer 预览仅会话内临时态。
2. **发送时看图**：贴图后点发送 → 本地 vision 模型一次 describe → 注入  
   `【图片内容描述】…` + 用户正文（若有）→ 再走普通文本 chat。
3. **GPU 互斥**：看图与生成同一 `generating` 窗口；与记忆整理一样，生成中不抢 GPU。
4. **成人向友好**：describe 提示词只要求可见内容描述，不道德评判、不无故拒绝。
5. **角色立绘可选**：角色库上传后可「看图生成描述」填入描述草稿，仍可手改。

## 模型选择

`pickVisionModel` 顺序：

1. Ollama `/api/tags` 中 **`capabilities` 含 `vision`** 的模型（权威）
2. 若会话模型本身在 vision 列表中，优先用它
3. 若没有任何 vision 模型 → 直接报错，**不会**把文本模型硬塞 `images[]`（避免 400 multimodal）
4. 仅当能力列表不可用时，才回退名称启发式（llava / qwen\*vl 等）

## 导入 GGUF + mmproj

模型中心「导入本地 GGUF」时：

1. 用户选择**主语言** `.gguf`（不要选 mmproj）
2. Liora 扫描**同文件夹**是否有 `mmproj*.gguf` / `*projector*`
3. 若有：临时目录 hardlink/copy 主文件 + mmproj，`Modelfile` 的 `FROM` 指向该目录（Ollama 多模态打包约定）
4. 若 Ollama 多模态 create 失败：自动回退为纯文本 `FROM` 主 GGUF，并提示用户

导入成功后请用 `/api/tags` 确认 `capabilities` 含 **vision**。

### LM Studio 能看图、Liora 报 400？

常见原因：

- Liora 走的是 **本机 Ollama（11434）**，不是 LM Studio 的 server。
- 同一套「Gemma / 自定义 GGUF」在 LM Studio 可能加载了 **带 mmproj 的多模态组合**；导入 Ollama 后若 `capabilities` 只有 `completion` / `tools`，**不能**收图。
- 解决：在 Ollama 安装官方 vision 标签，例如  
  `ollama pull llava` · `ollama pull qwen2.5vl` · 或带 vision 的官方 gemma 多模态标签；  
  用 `ollama show <name>` / tags 确认 capabilities 含 **vision**。

## 实现入口

| 路径 | 作用 |
|------|------|
| `src/lib/vision/compress.ts` | 压缩为 JPEG base64 |
| `src/lib/vision/describe.ts` | Ollama `/api/chat` + `images[]` |
| `src/lib/vision/models.ts` | 选 vision 模型 |
| `useLioraState.send` | 贴图 → describe → 文本注入 |
| `CharacterHub` | 立绘可选 describe |

## 与引擎状态

顶部活动增加 `vision`（「看图中」），完成后进入 load/generate。
