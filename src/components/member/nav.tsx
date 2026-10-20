"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, History, LayoutDashboard, LifeBuoy, UserRound, Wallet } from "lucide-react";
import clsx from "clsx";
import { useI18n } from "@/i18n/client";
import type { DictKey } from "@/i18n/dict/zh-TW";

const ITEMS: { href: string; key: DictKey; icon: typeof Wallet; exact?: boolean; mobile?: boolean }[] = [
  { href: "/app", key: "nav.overview", icon: LayoutDashboard, exact: true, mobile: true },
  { href: "/app/assets", key: "nav.assets", icon: Wallet, mobile: true },
  { href: "/app/withdraw", key: "nav.withdraw", icon: ArrowUpRight, mobile: true },
  { href: "/app/history", key: "nav.history", icon: History, mobile: true },
  { href: "/app/support", key: "nav.support", icon: LifeBuoy, mobile: true },
  { href: "/app/account", key: "nav.account", icon: UserRound },
];

function useActive() {
  const path = usePathname();
  return (href: string, exact?: boolean) => (exact ? path === href : path === href || path.startsWith(href + "/"));
}

export function SideNav({ badges }: { badges?: Partial<Record<string, number>> }) {
  const { t } = useI18n();
  const isActive = useActive();
  return (
    <nav className="space-y-1">
      {ITEMS.map((it) => {
        const active = isActive(it.href, it.exact);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active ? "bg-white/12 text-white" : "text-white/65 hover:bg-white/6 hover:text-white",
            )}
          >
            <span className={clsx("flex h-7 w-7 items-center justify-center rounded-md", active && "bg-brand-gradient")}>
              <it.icon size={17} aria-hidden />
            </span>
            <span className="flex-1">{t(it.key)}</span>
            {!!badges?.[it.href] && (
              <span className="rounded-full bg-brand-teal px-1.5 text-[11px] font-semibold text-navy">{badges[it.href]}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav() {
  const { t } = useI18n();
  const isActive = useActive();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      {ITEMS.filter((i) => i.mobile).map((it) => {
        const active = isActive(it.href, it.exact);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={clsx("flex flex-col items-center gap-0.5 py-2 text-[11px]", active ? "text-accent" : "text-muted")}
          >
            <it.icon size={20} aria-hidden />
            {t(it.key)}
          </Link>
        );
      })}
    </nav>
  );
}
