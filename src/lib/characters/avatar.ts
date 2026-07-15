/**
 * Process user-uploaded portraits into the locked 3:4 character frame.
 * Output: JPEG data URL for CharacterCard.avatarUrl.
 */
import {
  CHARACTER_ASSET_HEIGHT,
  CHARACTER_ASSET_WIDTH,
  CHARACTER_FRAME_RATIO,
} from "./visual";

const ALLOWED = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/** Reject huge files before decode (bytes). */
export const AVATAR_MAX_INPUT_BYTES = 12 * 1024 * 1024;

export type AvatarProcessError =
  | "not_image"
  | "too_large"
  | "load_failed"
  | "empty";

export class AvatarProcessException extends Error {
  code: AvatarProcessError;
  constructor(code: AvatarProcessError, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new AvatarProcessException("load_failed"));
    };
    img.src = url;
  });
}

/**
 * Cover-crop to 3:4, bias toward top (bust / face).
 * Output max 768×1024; never upscale above source crop.
 */
export function cropToCharacterFrame(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
): { canvas: HTMLCanvasElement; width: number; height: number } {
  const targetRatio = CHARACTER_FRAME_RATIO; // 0.75
  let cropW: number;
  let cropH: number;
  let sx: number;
  let sy: number;

  const srcRatio = srcW / Math.max(1, srcH);
  if (srcRatio > targetRatio) {
    cropH = srcH;
    cropW = Math.round(srcH * targetRatio);
    sx = Math.round((srcW - cropW) / 2);
    sy = 0;
  } else {
    cropW = srcW;
    cropH = Math.round(srcW / targetRatio);
    sx = 0;
    const leftover = Math.max(0, srcH - cropH);
    sy = Math.round(leftover * 0.2);
  }

  let outW = CHARACTER_ASSET_WIDTH;
  let outH = CHARACTER_ASSET_HEIGHT;
  if (cropW < CHARACTER_ASSET_WIDTH || cropH < CHARACTER_ASSET_HEIGHT) {
    const scale = Math.min(
      CHARACTER_ASSET_WIDTH / cropW,
      CHARACTER_ASSET_HEIGHT / cropH,
      1,
    );
    outW = Math.max(64, Math.round(cropW * scale));
    outH = Math.round(outW / targetRatio);
  }

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new AvatarProcessException("load_failed");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, sx, sy, cropW, cropH, 0, 0, outW, outH);
  return { canvas, width: outW, height: outH };
}

export function canvasToAvatarDataUrl(
  canvas: HTMLCanvasElement,
  quality = 0.86,
): string {
  return canvas.toDataURL("image/jpeg", quality);
}

export async function processCharacterAvatarFile(
  file: File,
): Promise<{ dataUrl: string; width: number; height: number }> {
  if (!file || file.size <= 0) {
    throw new AvatarProcessException("empty");
  }
  if (file.size > AVATAR_MAX_INPUT_BYTES) {
    throw new AvatarProcessException("too_large");
  }
  const type = (file.type || "").toLowerCase();
  const nameOk = /\.(jpe?g|png|webp|gif)$/i.test(file.name);
  if (type && !ALLOWED.has(type) && !nameOk) {
    throw new AvatarProcessException("not_image");
  }
  if (!type.startsWith("image/") && !nameOk) {
    throw new AvatarProcessException("not_image");
  }

  const img = await loadImageFromFile(file);
  if (!img.naturalWidth || !img.naturalHeight) {
    throw new AvatarProcessException("load_failed");
  }

  const { canvas, width, height } = cropToCharacterFrame(
    img,
    img.naturalWidth,
    img.naturalHeight,
  );
  let dataUrl = canvasToAvatarDataUrl(canvas, 0.86);
  if (dataUrl.length > 900_000) {
    dataUrl = canvasToAvatarDataUrl(canvas, 0.72);
  }
  if (dataUrl.length > 1_200_000) {
    const small = document.createElement("canvas");
    const sw = Math.round(CHARACTER_ASSET_WIDTH * 0.75);
    const sh = Math.round(sw / CHARACTER_FRAME_RATIO);
    small.width = sw;
    small.height = sh;
    const sctx = small.getContext("2d");
    if (sctx) {
      sctx.drawImage(canvas, 0, 0, sw, sh);
      dataUrl = canvasToAvatarDataUrl(small, 0.75);
    }
  }
  return { dataUrl, width, height };
}

export function mapAvatarError(
  code: string,
  dict: {
    characterAvatarErrType: string;
    characterAvatarErrSize: string;
    characterAvatarErrLoad: string;
    characterAvatarFailed: string;
  },
): string {
  switch (code) {
    case "not_image":
    case "empty":
      return dict.characterAvatarErrType;
    case "too_large":
      return dict.characterAvatarErrSize;
    case "load_failed":
      return dict.characterAvatarErrLoad;
    default:
      return dict.characterAvatarFailed;
  }
}
