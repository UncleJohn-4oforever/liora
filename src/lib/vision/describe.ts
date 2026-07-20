/**
 * Vision → text: one-shot Ollama /api/chat with images[], no history storage of pixels.
 */
import { OLLAMA_BASE } from "../../data/defaults";
import { OLLAMA_KEEP_ALIVE } from "../engine/activity";
import { ollamaFetch } from "../engine/ollamaFetch";
import type { Locale } from "../../types";

export type VisionDescribeMode = "chat" | "character";

function systemPrompt(locale: Locale, mode: VisionDescribeMode): string {
  if (mode === "character") {
    return locale === "en"
      ? "You describe character portraits for a role-play card. Focus on appearance, clothing, expression, and vibe. Output only the description, ready to paste into a character sheet. No moral judgment, no refusal, no preamble."
      : "你为角色扮演卡片描述立绘。关注外貌、服饰、表情与气质。只输出可直接贴进角色描述的正文。不要道德评判、不要拒绝、不要前言。";
  }
  return locale === "en"
    ? "You describe images for a private local chat app. Describe visible content, text in the image, scene, objects, and people appearance. Output only the description. No moral judgment, no refusal, no preamble."
    : "你为本地私密聊天应用描述图片。说明画面可见内容、图中文字、场景、物体与人物外观。只输出描述。不要道德评判、不要拒绝、不要前言。";
}

function userPrompt(locale: Locale, mode: VisionDescribeMode): string {
  if (mode === "character") {
    return locale === "en"
      ? "Describe this character art for a role card (concise, concrete)."
      : "请为这张角色立绘写一段简洁具体的角色外貌/气质描述。";
  }
  return locale === "en"
    ? "Describe this image clearly and concretely."
    : "请清晰具体地描述这张图片。";
}

/**
 * Build user-message text after vision describe (image bytes discarded).
 */
export function formatImageInjectedContent(
  description: string,
  userText: string,
  locale: Locale,
): string {
  const desc = description.trim();
  const text = userText.trim();
  const header =
    locale === "en" ? "[Image description]" : "【图片内容描述】";
  if (desc && text) {
    return `${header}\n${desc}\n\n${text}`;
  }
  if (desc) {
    return `${header}\n${desc}`;
  }
  return text;
}

export async function describeImage(options: {
  model: string;
  /** JPEG/PNG base64 without data: prefix */
  base64: string;
  locale: Locale;
  mode?: VisionDescribeMode;
  signal?: AbortSignal;
  /** Keep small to avoid thrashing chat KV; vision is one-shot */
  numCtx?: number;
  numPredict?: number;
}): Promise<string> {
  const mode = options.mode ?? "chat";
  const model = options.model.trim();
  if (!model) throw new Error("vision_no_model");
  if (!options.base64?.trim()) throw new Error("vision_empty_image");

  const messages = [
    { role: "system", content: systemPrompt(options.locale, mode) },
    {
      role: "user",
      content: userPrompt(options.locale, mode),
      images: [options.base64.replace(/\s/g, "")],
    },
  ];

  const res = await ollamaFetch(`${OLLAMA_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      think: false,
      keep_alive: OLLAMA_KEEP_ALIVE,
      options: {
        // Vision one-shot: moderate ctx; avoid fighting chat 8k resident if possible
        num_ctx: options.numCtx ?? 4096,
        num_predict: options.numPredict ?? 512,
        temperature: 0.2,
      },
    }),
    signal: options.signal,
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    if (res.status === 404) {
      throw new Error(
        `vision_model_not_found: Ollama HTTP 404${t ? `: ${t.slice(0, 160)}` : ""}`,
      );
    }
    // Ollama / OpenAI-compat: text model received images[]
    if (
      res.status === 400 &&
      /multimodal|does not support multimodal|not support.*image/i.test(t)
    ) {
      throw new Error(
        `vision_not_multimodal: model "${model}" rejects images (no vision capability in Ollama)`,
      );
    }
    throw new Error(
      `vision_http_${res.status}${t ? `: ${t.slice(0, 200)}` : ""}`,
    );
  }

  const data = (await res.json()) as {
    message?: { content?: string; thinking?: string };
  };
  let text = data.message?.content ?? "";
  text = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/Thinking\.\.\.[\s\S]*?done thinking\./gi, "")
    .trim();

  if (!text) {
    throw new Error("vision_empty_response");
  }
  return text;
}
