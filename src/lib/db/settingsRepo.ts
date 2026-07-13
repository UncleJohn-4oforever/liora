import type { AppSettings } from "../../types";
import { kvGetJson, kvSetJson } from "./kv";

const KEY = "settings" as const;

export async function loadSettingsFromDb(
  defaults: AppSettings,
): Promise<AppSettings> {
  const data = await kvGetJson<Partial<AppSettings>>(KEY);
  if (!data) return defaults;
  return { ...defaults, ...data };
}

export async function saveSettingsToDb(settings: AppSettings): Promise<void> {
  await kvSetJson(KEY, settings);
}
