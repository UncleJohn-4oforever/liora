import { en } from "./locales/en";
import { zh, type Dict } from "./locales/zh";
import type { Locale } from "../types";

const tables: Record<Locale, Dict> = { zh, en };

export function t(locale: Locale): Dict {
  return tables[locale] ?? zh;
}

export type { Dict };
