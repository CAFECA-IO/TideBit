"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, BadgeCheck, Coins, LayoutDashboard, LifeBuoy, Menu, ScrollText, Settings, ShieldAlert, ShieldUser, Users, X } from "lucide-react";
import clsx from "clsx";

const ICONS = { dashboard: LayoutDashboard, withdrawals: ArrowUpRight, identity: BadgeCheck, members: Users, tickets: LifeBuoy, currencies: Coins, settings: Settings, admins: ShieldUser, audit: ScrollText, aml: ShieldAlert };
export type AdminNavItem = { href: string; label: string; icon: keyof typeof ICONS; badge?: number };

function Items({ items, onNavigate }: { items: AdminNavItem[]; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav className="space-y-0.5">
      {items.map((it) => {
        const active = it.href === "/admin" ? path === "/admin" : path.startsWith(it.href);
        const Icon = ICONS[it.icon];
        return (
          <Link
            key={it.href}
            href={it.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              active ? "bg-white/12 font-medium text-white" : "text-white/65 hover:bg-white/6 hover:text-white",
            )}
          >
            <Icon size={17} aria-hidden />
            <span className="flex-1">{it.label}</span>
            {!!it.badge && <span className="rounded-full bg-brand-teal px-1.5 text-[11px] font-semibold text-navy">{it.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminSideNav({ items }: { items: AdminNavItem[] }) {
  return <Items items={items} />;
}

export function AdminMobileNav({ items }: { items: AdminNavItem[] }) {
  const [open, setOpen] = useState(false);

  // 開啟時鎖住背景捲動，Esc 關閉
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button type="button" onClick={() => setOpen(true)} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-surface-2" aria-label="開啟選單" aria-expanded={open}>
        <Menu size={20} />
      </button>
      {/* 以 portal 掛到 body：頁首有 backdrop-blur，會讓 fixed 子元素只覆蓋頁首範圍 */}
      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="選單">
            <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
            <div className="relative flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto bg-navy-2 px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] shadow-xl">
              <div className="mb-5 flex items-center justify-between px-1">
                <span className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/brand/wordmark-white.png" alt="TideBit" style={{ height: 20, width: "auto" }} />
                  <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/70">ADMIN</span>
                </span>
                <button type="button" onClick={() => setOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-lg text-white hover:bg-white/10" aria-label="關閉選單">
                  <X size={20} />
                </button>
              </div>
              <Items items={items} onNavigate={() => setOpen(false)} />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
