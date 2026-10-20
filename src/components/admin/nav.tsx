"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
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
  return (
    <div className="lg:hidden">
      <button type="button" onClick={() => setOpen(true)} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-surface-2" aria-label="menu">
        <Menu size={20} />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative w-64 bg-navy p-4">
            <button type="button" onClick={() => setOpen(false)} className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg text-white hover:bg-white/10" aria-label="close">
              <X size={20} />
            </button>
            <Items items={items} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
