import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { DEFAULT_LOCALE, LOCALE_COOKIE, interpolate, isLocale, matchLocale, type Locale, type Vars } from "./config";
import type { Dict, DictKey } from "./dict/zh-TW";

const loaders: Record<Locale, () => Promise<{ default: Dict }>> = {
  "zh-TW": () => import("./dict/zh-TW"),
  "zh-HK": () => import("./dict/zh-HK"),
  "zh-CN": () => import("./dict/zh-CN"),
  en: () => import("./dict/en"),
  ja: () => import("./dict/ja"),
  ko: () => import("./dict/ko"),
};

export async function loadDict(locale: Locale): Promise<Dict> {
  return (await loaders[locale]()).default;
}

export const getLocale = cache(async (): Promise<Locale> => {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(c)) return c;
  return matchLocale((await headers()).get("accept-language"));
});

export type T = (key: DictKey, vars?: Vars) => string;

export function makeT(dict: Dict): T {
  return (key, vars) => interpolate(dict[key] ?? key, vars);
}

export const getI18n = cache(async () => {
  const locale = await getLocale();
  const dict = await loadDict(locale);
  return { locale, dict, t: makeT(dict) };
});

/** 以會員偏好語系產生文字（站內通知、Email） */
export async function tFor(locale: string | null | undefined) {
  return makeT(await loadDict(isLocale(locale) ? locale : DEFAULT_LOCALE));
}
