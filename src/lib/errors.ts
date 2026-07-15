/**
 * Map raw engine / Ollama errors to short, actionable Chinese/English copy.
 */

export function humanizeError(
  raw: string | null | undefined,
  locale: "zh" | "en",
): string {
  if (!raw) return "";
  const s = raw.trim();
  const lower = s.toLowerCase();

  const zh = locale !== "en";

  if (
    lower.includes("502") ||
    lower.includes("403") ||
    lower.includes("proxy") ||
    lower.includes("bad gateway")
  ) {
    return zh
      ? "无法连接本地引擎（可能被系统代理拦截）。请把 127.0.0.1 设为直连，或暂时关闭 Clash/V2Ray 后重试；并确认 Liora 为最新桌面版。"
      : "Cannot reach the local engine (often blocked by a system proxy). Bypass 127.0.0.1 in Clash/V2Ray, or use the latest Liora desktop build.";
  }

  if (
    lower.includes("connect_failed") ||
    lower.includes("cannot reach") ||
    lower.includes("econnrefused") ||
    lower.includes("failed to fetch")
  ) {
    return zh
      ? "本地引擎未响应。请点击顶部「启动引擎」，或确认本机 Ollama 已安装。"
      : "Local engine is not responding. Use Start engine, or install Ollama on this PC.";
  }

  if (lower.includes("ollama_not_found") || lower.includes("not_installed")) {
    return zh
      ? "未检测到 Ollama。请先安装本地引擎（安装引导），装好后回到 Liora 启动即可。"
      : "Ollama was not found. Install the local engine, then return to Liora and start it.";
  }

  if (
    lower.includes("timeout_waiting") ||
    lower.includes("timeout_after") ||
    lower.includes("timed out")
  ) {
    return zh
      ? "引擎启动超时。请稍等再点「重新检测」，或在任务管理器中结束残留 ollama 进程后重试。"
      : "Engine start timed out. Retry, or end leftover ollama processes and try again.";
  }

  if (lower.includes("done_reason") && lower.includes("length")) {
    return zh
      ? "回答因长度上限被截断。请加大上下文（8K/16K），或关闭「显示思考」、改用「正常」篇幅。"
      : "Reply hit the length limit. Raise Context (8K/16K), turn off Show thinking, or use Normal length.";
  }

  if (lower.includes("empty_model") || lower.includes("no models")) {
    return zh
      ? "还没有可用模型。请打开「获取模型」下载或导入 GGUF。"
      : "No models yet. Open Get models to download or import a GGUF.";
  }

  if (
    lower.includes("not found") ||
    (lower.includes("model") && lower.includes("404")) ||
    lower.includes('"error":"model')
  ) {
    const named = s.match(/model ['"]([^'"]+)['"]/i)?.[1];
    return zh
      ? `找不到模型${named ? `「${named}」` : ""}。请在顶部模型列表中选择已安装的模型，或到「获取模型」下载/导入。当前会话可能仍绑定着旧名称。`
      : `Model${named ? ` “${named}”` : ""} not found. Pick an installed model in the top bar, or use Get models. This chat may still reference an old name.`;
  }

  if (lower.includes("aborted") || lower.includes("stopped")) {
    return zh ? "已停止生成。" : "Generation stopped.";
  }

  // Keep short technical tail for support, but lead with friendly text if HTTP
  if (/ollama http \d+/i.test(s)) {
    const code = s.match(/ollama http (\d+)/i)?.[1];
    if (code === "404" && lower.includes("model")) {
      const named = s.match(/model ['"]([^'"]+)['"]/i)?.[1];
      return zh
        ? `找不到模型${named ? `「${named}」` : ""}。请在顶部切换为已安装模型，或重新导入/下载。`
        : `Model${named ? ` “${named}”` : ""} not found. Switch to an installed model in the top bar, or re-import/download.`;
    }
    return zh
      ? `引擎返回错误（HTTP ${code ?? "?"}）。请确认 Ollama 正在运行且模型名称正确。\n${s.slice(0, 160)}`
      : `Engine returned HTTP ${code ?? "?"}. Check that Ollama is running and the model name is correct.\n${s.slice(0, 160)}`;
  }

  return s.length > 280 ? `${s.slice(0, 280)}…` : s;
}

export function emptyChatHint(options: {
  locale: "zh" | "en";
  engineOnline: boolean;
  modelCount: number;
  memoryEnabled: boolean;
}): string {
  const zh = options.locale !== "en";
  if (!options.engineOnline) {
    return zh
      ? "本地引擎未就绪。请先「启动引擎」，再选择模型开始对话。长聊时 Liora 会自动压缩早期内容，保持上下文不爆。"
      : "Local engine is offline. Start the engine, pick a model, then chat. Liora compresses older turns so long chats stay within context.";
  }
  if (options.modelCount === 0) {
    return zh
      ? "引擎已就绪，但还没有模型。点顶部「获取模型」下载推荐模型，或导入本机 GGUF。"
      : "Engine is ready, but no models are installed. Open Get models to download or import a GGUF.";
  }
  return zh
    ? "开始对话吧。多聊几轮后会自动摘要并写入可审计记忆；冷区只保留摘要，方便长聊。"
    : "Start chatting. After a few turns Liora summarizes older messages into memory so long chats stay within budget.";
}
