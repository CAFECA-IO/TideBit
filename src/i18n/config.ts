export const LOCALES = ["zh-TW", "zh-HK", "zh-CN", "en", "ja", "ko"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "zh-TW";
export const LOCALE_COOKIE = "tb_locale";

export const LOCALE_LABELS: Record<Locale, string> = {
  "zh-TW": "繁體中文（台灣）",
  "zh-HK": "繁體中文（香港）",
  "zh-CN": "简体中文",
  en: "English",
  ja: "日本語",
  ko: "한국어",
};

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

/** 由 Accept-Language 推測語系（舊系統使用者多為台灣、香港） */
export function matchLocale(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  const prefs = header
    .split(",")
    .map((p) => {
      const [tag, q] = p.trim().split(";q=");
      return { tag: tag.toLowerCase(), q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { tag } of prefs) {
    if (tag === "zh-tw" || tag === "zh-hant-tw" || tag === "zh-hant") return "zh-TW";
    if (tag === "zh-hk" || tag === "zh-mo" || tag === "zh-hant-hk") return "zh-HK";
    if (tag.startsWith("zh")) return "zh-CN";
    if (tag.startsWith("en")) return "en";
    if (tag.startsWith("ja")) return "ja";
    if (tag.startsWith("ko")) return "ko";
  }
  return DEFAULT_LOCALE;
}

export type Vars = Record<string, string | number>;

export function interpolate(s: string, vars?: Vars) {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}
