"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import { interpolate, type Locale, type Vars } from "./config";
import type { Dict, DictKey } from "./dict/zh-TW";

const Ctx = createContext<{ locale: Locale; dict: Dict } | null>(null);

export function I18nProvider({ locale, dict, children }: { locale: Locale; dict: Dict; children: ReactNode }) {
  return <Ctx value={{ locale, dict }}>{children}</Ctx>;
}

export function useI18n() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  const { locale, dict } = ctx;
  const t = useCallback((key: DictKey, vars?: Vars) => interpolate(dict[key] ?? key, vars), [dict]);
  return { locale, t };
}
