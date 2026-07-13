export type Dict = {
  appName: string;
  appTagline: string;
  sessions: string;
  newSession: string;
  noSessions: string;
  rename: string;
  delete: string;
  chat: string;
  emptyChat: string;
  placeholder: string;
  send: string;
  stop: string;
  character: string;
  characterPanel: string;
  model: string;
  settings: string;
  language: string;
  memory: string;
  memoryOn: string;
  memoryOff: string;
  memoryHint: string;
  memoryUpdated: string;
  ollamaStatus: string;
  ollamaOnline: string;
  ollamaOffline: string;
  ollamaUnknown: string;
  ollamaOfflineHint: string;
  defaultSessionTitle: string;
  confirmDeleteSession: string;
  untitled: string;
  statusReady: string;
  statusGenerating: string;
  visualPlaceholder: string;
  visualLater: string;
  generateFailed: string;
  stopped: string;
  usingModel: string;
  memoryCenter: string;
  memoryPanelHint: string;
  memoryStats: string;
  memoryWorking: string;
  noMemories: string;
  layerL3: string;
  layerL4: string;
  layerL5: string;
  edit: string;
  editMemory: string;
  clearMemories: string;
  confirmClearMemories: string;
  close: string;
  openMemory: string;
  runMemoryNow: string;
  rememberThis: string;
  rememberInput: string;
  rememberWorking: string;
  sensitiveTitle: string;
  sensitiveHint: string;
  sensitiveTags: string;
  confirmSaveMemory: string;
  cancel: string;
  openSettings: string;
  settingsTitle: string;
  settingsGeneral: string;
  settingsBackup: string;
  defaultModel: string;
  defaultModelHint: string;
  exportBackup: string;
  exportBackupHint: string;
  importBackup: string;
  importModeReplace: string;
  importModeMerge: string;
  importBackupHint: string;
  importSuccess: string;
  importFailed: string;
  storageNote: string;
  settingsData: string;
  storageDataDir: string;
  storageDataDirHint: string;
  storageChoose: string;
  storageOpen: string;
  storageOpenConfig: string;
  storageResetDefault: string;
  storageMigrateAsk: string;
  storageMigrated: string;
  storageChanged: string;
  storageBrowserOnly: string;
  storageDefault: string;
  storageCustom: string;
  apply: string;
  summaryEveryN: string;
  summaryEveryNHint: string;
  engineLabel: string;
  engineOnline: string;
  engineOffline: string;
  engineChecking: string;
  engineStarting: string;
  engineNotInstalled: string;
  engineError: string;
  engineStart: string;
  engineRetry: string;
  engineInstallGuide: string;
  engineGuideTitle: string;
  engineGuideIntro: string;
  engineGuideStep1: string;
  engineGuideStep2: string;
  engineGuideStep3: string;
  engineGuideNote: string;
  engineOpenDownload: string;
  modelSelectHint: string;
  modelNone: string;
  /** Chat / reply prefs */
  settingsChat: string;
  showThinking: string;
  showThinkingHint: string;
  thinkingLabel: string;
  thinkingStreaming: string;
  replyStyle: string;
  replyStyleHint: string;
  replyStyleBalanced: string;
  replyStyleWork: string;
  replyStyleCompanion: string;
  answerLength: string;
  answerLengthHint: string;
  answerLengthConcise: string;
  answerLengthNormal: string;
  contextSize: string;
  contextSizeHint: string;
  contextSize4k: string;
  contextSize8k: string;
  contextSize16k: string;
  contextUsageLabel: string;
  contextUsageLimit: string;
  contextUsagePrompt: string;
  contextUsageGen: string;
  contextUsageTotal: string;
  contextUsageWaiting: string;
  contextUsageHint: string;
  contextPacked: string;
  contextHot: string;
  contextCold: string;
  contextTrimmed: string;
  /** Model hub / pull */
  modelHub: string;
  modelHubTitle: string;
  modelHubIntro: string;
  modelHubRamHint: string;
  modelHubRecommended: string;
  modelHubCustom: string;
  modelHubCustomHint: string;
  modelHubPull: string;
  modelHubPulling: string;
  modelHubPullingShort: string;
  modelHubProgress: string;
  modelHubStarting: string;
  modelHubCancel: string;
  modelHubCancelled: string;
  modelHubSuccess: string;
  modelHubFailed: string;
  modelHubNeedEngine: string;
  modelHubInstalled: string;
  modelHubInstalledBadge: string;
  modelHubForYou: string;
  modelNoneHint: string;
  modelImportTitle: string;
  modelImportHint: string;
  modelImportPick: string;
  modelImportPath: string;
  modelImportName: string;
  modelImportNameHint: string;
  modelImportSystem: string;
  modelImportSystemHint: string;
  modelImportRun: string;
  modelImportWorking: string;
  modelImportSuccess: string;
  modelImportFailed: string;
  modelImportErrNotFound: string;
  modelImportErrNotGguf: string;
  modelImportErrName: string;
  modelImportErrOllama: string;
  modelImportErrDesktop: string;
  modelImportNeedEngine: string;
  modelSwitchAsk: string;
  modelSwitchYes: string;
  modelSwitchNo: string;
  modelPreAskTitlePull: string;
  modelPreAskTitleImport: string;
  modelPreAskBody: string;
  modelPreAskCancel: string;
  modelPreAskNoSwitch: string;
  modelPreAskSwitch: string;
};

export const zh: Dict = {
  appName: "Liora",
  appTagline: "本地私密助手",
  sessions: "会话",
  newSession: "新建会话",
  noSessions: "暂无会话",
  rename: "重命名",
  delete: "删除",
  chat: "对话",
  emptyChat:
    "开始对话吧。本地 Ollama 真模型已接入。多聊几轮后会自动摘要并写入可审计记忆（可在记忆中心查看）。",
  placeholder: "输入消息…（Enter 发送，Shift+Enter 换行）",
  send: "发送",
  stop: "停止",
  character: "角色",
  characterPanel: "角色卡",
  model: "模型",
  settings: "设置",
  language: "语言",
  memory: "记忆",
  memoryOn: "已开启",
  memoryOff: "已关闭",
  memoryHint:
    "开启后，系统会在后台滚动摘要并抽取具体事实。重要写入会提示「记忆已更新」。",
  memoryUpdated: "记忆已更新",
  ollamaStatus: "Ollama",
  ollamaOnline: "在线",
  ollamaOffline: "未连接",
  ollamaUnknown: "检测中…",
  ollamaOfflineHint:
    "本地引擎未就绪。请使用顶部「启动引擎」或「安装引导」；日常无需打开 Ollama 界面。",
  defaultSessionTitle: "新对话",
  confirmDeleteSession: "删除该会话？此操作不可撤销。",
  untitled: "未命名",
  statusReady: "就绪",
  statusGenerating: "生成中…",
  visualPlaceholder: "视觉窗口 · 角色卡",
  visualLater: "后续将支持立绘与点击互动",
  generateFailed: "生成失败：",
  stopped: "（已停止）",
  usingModel: "当前模型",
  memoryCenter: "记忆中心",
  memoryPanelHint:
    "仅显示通过具体性校验的长期条目。含糊内容只会留在摘要/检索层，不会升格为画像。",
  memoryStats: "长期 {n} · 摘要 {e} · 细节块 {c}",
  memoryWorking: "整理记忆中…",
  noMemories: "暂无",
  layerL3: "用户画像",
  layerL4: "交互策略",
  layerL5: "事件/项目",
  edit: "编辑",
  editMemory: "编辑记忆内容",
  clearMemories: "清空全部记忆",
  confirmClearMemories: "清空全部长期记忆、摘要与细节块？此操作不可撤销。",
  close: "关闭",
  openMemory: "打开记忆中心",
  runMemoryNow: "立即整理记忆",
  rememberThis: "记住这句",
  rememberInput: "记住输入框",
  rememberWorking: "正在写入记忆…",
  sensitiveTitle: "可能含敏感信息",
  sensitiveHint:
    "检测到可能的敏感内容（联系方式/地址/健康/财务等）。确认后才会写入本地记忆；可取消。",
  sensitiveTags: "类别",
  confirmSaveMemory: "确认写入",
  cancel: "取消",
  openSettings: "设置",
  settingsTitle: "设置与备份",
  settingsGeneral: "通用",
  settingsBackup: "备份",
  defaultModel: "默认模型",
  defaultModelHint: "新建会话使用的 Ollama 模型名（需已在 ollama list 中）。",
  exportBackup: "导出备份",
  exportBackupHint: "导出会话、记忆与设置为 JSON 文件，可搬家或备份。",
  importBackup: "导入备份",
  importModeReplace: "覆盖导入",
  importModeMerge: "合并导入",
  importBackupHint:
    "覆盖：用备份替换本地数据。合并：按 ID 合并，较新的优先。",
  importSuccess: "导入成功",
  importFailed: "导入失败",
  storageNote:
    "记忆与会话默认保存在本机应用数据目录（不会上传）。可自定义文件夹以便备份或使用其他磁盘。",
  settingsData: "数据位置",
  storageDataDir: "记忆与会话目录",
  storageDataDirHint:
    "该文件夹内含 memory.json / sessions.json / settings.json。配置指针固定在 %APPDATA%\\Liora。",
  storageChoose: "选择文件夹…",
  storageOpen: "打开数据文件夹",
  storageOpenConfig: "打开配置目录",
  storageResetDefault: "恢复默认位置",
  storageMigrateAsk:
    "是否把当前记忆/会话复制到新位置？\n\n确定 = 迁移数据\n取消 = 仅改路径（新位置若为空则从空开始）",
  storageMigrated: "已迁移数据到新目录。",
  storageChanged: "数据目录已更新。",
  storageBrowserOnly: "浏览器预览版仍使用本机 IndexedDB；请使用桌面安装包以选择目录。",
  storageDefault: "默认",
  storageCustom: "自定义",
  apply: "应用",
  summaryEveryN: "自动整理频率",
  summaryEveryNHint:
    "每累计多少条新消息后自动摘要/抽记忆（2–30，默认 6）。越小越勤、越吃算力。",
  engineLabel: "本地引擎",
  engineOnline: "就绪",
  engineOffline: "未运行",
  engineChecking: "检测中…",
  engineStarting: "启动中…",
  engineNotInstalled: "未安装",
  engineError: "启动失败",
  engineStart: "启动引擎",
  engineRetry: "重新检测",
  engineInstallGuide: "安装引导",
  engineGuideTitle: "安装本地引擎（一次即可）",
  engineGuideIntro:
    "Liora 使用本机 Ollama 运行模型。安装只需一次；之后日常只需打开 Liora，在 Liora 内选模型与聊天，不必再操作 Ollama 界面。",
  engineGuideStep1: "点击下方「打开下载页」，安装官方 Ollama（Windows）。",
  engineGuideStep2: "安装完成后回到 Liora，点击「启动引擎 / 重新检测」。",
  engineGuideStep3: "在顶部模型列表中选择或稍后下载模型，即可开始对话。",
  engineGuideNote:
    "说明文档会写明依赖 Ollama；日常不需要打开 Ollama 应用窗口。",
  engineOpenDownload: "打开下载页",
  modelSelectHint: "在 Liora 内切换当前模型（无需打开 Ollama）",
  modelNone: "无可用模型",
  settingsChat: "对话与风格",
  showThinking: "显示思考过程",
  showThinkingHint:
    "思考型模型会单独展示推理过程（折叠块）；关闭后只显示最终回答。",
  thinkingLabel: "思考过程",
  thinkingStreaming: "思考中…",
  replyStyle: "回复风格",
  replyStyleHint: "影响语气与结构，不改变记忆策略。",
  replyStyleBalanced: "均衡",
  replyStyleWork: "工作助手",
  replyStyleCompanion: "陪伴者",
  answerLength: "回答篇幅",
  answerLengthHint:
    "精简：短答、省 token。正常：更完整（默认；可缓解「比 Ollama 更短」）。",
  answerLengthConcise: "精简",
  answerLengthNormal: "正常",
  contextSize: "上下文",
  contextSizeHint:
    "模型上下文窗口（num_ctx）。越大越能记更长对话、写更长回答，但更吃显存/内存。推荐：日常 8K，长文 16K。",
  contextSize4k: "4K",
  contextSize8k: "8K",
  contextSize16k: "16K",
  contextUsageLabel: "上下文用量",
  contextUsageLimit: "上限",
  contextUsagePrompt: "提示",
  contextUsageGen: "生成",
  contextUsageTotal: "合计",
  contextUsageWaiting: "生成中…",
  contextUsageHint:
    "上限为 num_ctx。发送前显示组装估算（热区原文+记忆摘要）；回复后显示 Ollama 实测（含思考 token）。冷区只进摘要，保证长聊不爆。",
  contextPacked: "组装",
  contextHot: "热区",
  contextCold: "冷区",
  contextTrimmed: "已裁剪",
  modelHub: "获取模型",
  modelHubTitle: "模型中心",
  modelHubIntro:
    "可在线下载推荐模型，或导入本机已有的 .gguf 文件。请先启动本地引擎；在线下载需网络。",
  modelHubRamHint: "检测到本机内存约 {n} GB，已为你标出更合适的一档。",
  modelHubRecommended: "推荐模型",
  modelHubCustom: "自定义名称",
  modelHubCustomHint:
    "可填写 Ollama 库中的任意模型名（如 llama3.2:3b）。下载大小视模型而定。",
  modelHubPull: "下载",
  modelHubPulling: "正在下载 {m}…",
  modelHubPullingShort: "下载中…",
  modelHubProgress: "下载进度",
  modelHubStarting: "开始下载…",
  modelHubCancel: "取消下载",
  modelHubCancelled: "已取消下载",
  modelHubSuccess: "已安装 {m}，可在顶部模型列表中选择。",
  modelHubFailed: "下载失败",
  modelHubNeedEngine: "请先启动本地引擎，再下载模型。",
  modelHubInstalled: "已安装",
  modelHubInstalledBadge: "已安装",
  modelHubForYou: "推荐",
  modelNoneHint: "暂无本地模型，点「获取模型」下载一个即可开始对话。",
  modelImportTitle: "导入本地 GGUF",
  modelImportHint:
    "若你从 Hugging Face 等下载了 .gguf 文件，可在此导入到 Ollama。导入后会出现在模型列表（无需 Ollama 界面）。",
  modelImportPick: "选择文件…",
  modelImportPath: "文件路径",
  modelImportName: "导入后的名称",
  modelImportNameHint: "仅字母数字、点、下划线、短横线；可选 :tag，如 my-gemma:q5",
  modelImportSystem: "系统提示（可选）",
  modelImportSystemHint: "写入该模型的默认 system；可留空。",
  modelImportRun: "开始导入",
  modelImportWorking: "正在导入（大文件可能需几分钟）…",
  modelImportSuccess: "已导入 {m}，可在顶部列表中选择。",
  modelImportFailed: "导入失败",
  modelImportErrNotFound: "找不到该文件，请重新选择。",
  modelImportErrNotGguf: "请选择 .gguf 文件。",
  modelImportErrName: "名称不合法：请用英文/数字等简单名字。",
  modelImportErrOllama: "未找到 Ollama，请先安装并启动本地引擎。",
  modelImportErrDesktop: "导入本地 GGUF 仅支持桌面版 Liora。",
  modelImportNeedEngine: "建议先启动本地引擎，再导入模型。",
  modelSwitchAsk: "完成后是否切换为该模型？",
  modelSwitchYes: "已切换为 {m}。",
  modelSwitchNo: "已安装 {m}（未切换当前模型）。",
  modelPreAskTitlePull: "准备下载模型",
  modelPreAskTitleImport: "准备导入模型",
  modelPreAskBody:
    "请先选择完成后是否切换为该模型。确认后才会开始下载/导入，避免完成后突然打断你。",
  modelPreAskCancel: "取消",
  modelPreAskNoSwitch: "开始，不切换",
  modelPreAskSwitch: "开始，并切换",
};
