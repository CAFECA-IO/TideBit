"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogOut, UserRound } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { logoutAction } from "@/app/actions";

function useClickOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const k = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k);
    };
  }, [open, close]);
  return ref;
}

export function UserMenu({ email }: { email: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 items-center gap-2 rounded-lg pl-1 pr-2 text-sm hover:bg-surface-2"
        aria-expanded={open}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-gradient text-xs font-semibold uppercase text-white">
          {email.slice(0, 1)}
        </span>
        <span className="hidden max-w-44 truncate text-muted sm:inline">{email}</span>
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg">
          <div className="truncate px-4 py-2 text-xs text-muted">{email}</div>
          <Link href="/app/account" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-surface-2">
            <UserRound size={16} /> {t("nav.account")}
          </Link>
          <form action={logoutAction}>
            <button type="submit" className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-danger hover:bg-surface-2">
              <LogOut size={16} /> {t("auth.logout")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
