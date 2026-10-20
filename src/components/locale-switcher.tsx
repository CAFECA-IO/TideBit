"use client";

import { useTransition } from "react";
import { Globe } from "lucide-react";
import clsx from "clsx";
import { setLocaleAction } from "@/app/actions";
import { LOCALES, LOCALE_LABELS } from "@/i18n/config";
import { useI18n } from "@/i18n/client";

export function LocaleSwitcher({ tone = "default", className }: { tone?: "default" | "onDark"; className?: string }) {
  const { locale, t } = useI18n();
  const [pending, start] = useTransition();
  return (
    <label
      className={clsx(
        "relative inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm",
        tone === "onDark" ? "text-white/80 hover:bg-white/10" : "text-muted hover:bg-surface-2",
        pending && "opacity-60",
        className,
      )}
    >
      <Globe size={16} aria-hidden />
      <span className="sr-only">{t("common.language")}</span>
      <select
        value={locale}
        disabled={pending}
        onChange={(e) => start(() => setLocaleAction(e.target.value))}
        className="cursor-pointer appearance-none bg-transparent pr-1 focus:outline-none [&>option]:text-black"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
