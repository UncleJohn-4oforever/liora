/**
 * Compress images for Ollama vision (`messages[].images` base64).
 * Output is JPEG base64 without the data: URL prefix.
 */

const ALLOWED = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
]);

/** Reject huge files before decode (bytes). */
export const VISION_MAX_INPUT_BYTES = 16 * 1024 * 1024;

/** Longest edge after resize (good balance for VLMs + latency). */
export const VISION_MAX_EDGE = 1280;

export type VisionCompressError =
  | "not_image"
  | "too_large"
  | "load_failed"
  | "empty";

export class VisionCompressException extends Error {
  code: VisionCompressError;
  constructor(code: VisionCompressError, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new VisionCompressException("load_failed"));
    };
    img.src = url;
  });
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new VisionCompressException("load_failed"));
    img.src = dataUrl;
  });
}

function drawScaled(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  maxEdge: number,
): HTMLCanvasElement {
  let w = srcW;
  let h = srcH;
  const long = Math.max(w, h);
  if (long > maxEdge) {
    const scale = maxEdge / long;
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new VisionCompressException("load_failed");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, w, h);
  return canvas;
}

/** Strip `data:image/...;base64,` prefix if present. */
export function stripDataUrlBase64(dataUrlOrB64: string): string {
  const s = dataUrlOrB64.trim();
  const i = s.indexOf("base64,");
  if (i >= 0) return s.slice(i + "base64,".length);
  return s;
}

export function canvasToJpegBase64(
  canvas: HTMLCanvasElement,
  quality = 0.82,
): string {
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  return stripDataUrlBase64(dataUrl);
}

export type CompressedVisionImage = {
  /** Raw base64 JPEG for Ollama `images` */
  base64: string;
  /** data URL for UI preview only (not stored in chat history) */
  previewUrl: string;
  width: number;
  height: number;
  bytesApprox: number;
};

function finalizeCanvas(canvas: HTMLCanvasElement): CompressedVisionImage {
  let quality = 0.82;
  let base64 = canvasToJpegBase64(canvas, quality);
  // Cap ~1.5MB base64 (~1.1MB binary) for faster local VL calls
  if (base64.length > 2_000_000) {
    quality = 0.7;
    base64 = canvasToJpegBase64(canvas, quality);
  }
  if (base64.length > 2_800_000) {
    const smaller = drawScaled(canvas, canvas.width, canvas.height, 960);
    base64 = canvasToJpegBase64(smaller, 0.72);
    return {
      base64,
      previewUrl: `data:image/jpeg;base64,${base64}`,
      width: smaller.width,
      height: smaller.height,
      bytesApprox: Math.round((base64.length * 3) / 4),
    };
  }
  return {
    base64,
    previewUrl: `data:image/jpeg;base64,${base64}`,
    width: canvas.width,
    height: canvas.height,
    bytesApprox: Math.round((base64.length * 3) / 4),
  };
}

function assertImageFile(file: File): void {
  if (!file || file.size <= 0) {
    throw new VisionCompressException("empty");
  }
  if (file.size > VISION_MAX_INPUT_BYTES) {
    throw new VisionCompressException("too_large");
  }
  const type = (file.type || "").toLowerCase();
  const nameOk = /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name);
  if (type && !ALLOWED.has(type) && !nameOk) {
    throw new VisionCompressException("not_image");
  }
  if (type && !type.startsWith("image/") && !nameOk) {
    throw new VisionCompressException("not_image");
  }
}

/** Compress a user File (chat attach / paste). */
export async function compressImageFile(
  file: File,
  maxEdge = VISION_MAX_EDGE,
): Promise<CompressedVisionImage> {
  assertImageFile(file);
  const img = await loadImageFromBlob(file);
  if (!img.naturalWidth || !img.naturalHeight) {
    throw new VisionCompressException("load_failed");
  }
  const canvas = drawScaled(
    img,
    img.naturalWidth,
    img.naturalHeight,
    maxEdge,
  );
  return finalizeCanvas(canvas);
}

/** Compress a data URL (e.g. character portrait already on card). */
export async function compressImageDataUrl(
  dataUrl: string,
  maxEdge = VISION_MAX_EDGE,
): Promise<CompressedVisionImage> {
  const raw = (dataUrl || "").trim();
  if (!raw) throw new VisionCompressException("empty");
  // Approximate size from base64 length
  const b64 = stripDataUrlBase64(raw);
  if (b64.length > (VISION_MAX_INPUT_BYTES * 4) / 3 + 64) {
    throw new VisionCompressException("too_large");
  }
  const img = await loadImageFromDataUrl(
    raw.startsWith("data:") ? raw : `data:image/jpeg;base64,${raw}`,
  );
  if (!img.naturalWidth || !img.naturalHeight) {
    throw new VisionCompressException("load_failed");
  }
  const canvas = drawScaled(
    img,
    img.naturalWidth,
    img.naturalHeight,
    maxEdge,
  );
  return finalizeCanvas(canvas);
}

export function mapVisionCompressError(
  code: string,
  dict: {
    visionErrType: string;
    visionErrSize: string;
    visionErrLoad: string;
    visionFailed: string;
  },
): string {
  switch (code) {
    case "not_image":
    case "empty":
      return dict.visionErrType;
    case "too_large":
      return dict.visionErrSize;
    case "load_failed":
      return dict.visionErrLoad;
    default:
      return dict.visionFailed;
  }
}
