import { Info } from "lucide-react";
import { Logo } from "@/components/brand";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { BottomNav, SideNav } from "@/components/member/nav";
import { UserMenu } from "@/components/member/topbar";
import { getI18n } from "@/i18n/server";
import { requireMember } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function MemberLayout({ children }: LayoutProps<"/app">) {
  const { member } = await requireMember();
  const { t } = await getI18n();
  const openTickets = await db.ticketTopic.count({ where: { authorId: member.id, state: "replied" } });

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-navy px-4 py-6 lg:flex">
        <div className="px-2">
          <Logo tone="light" height={26} href="/app" />
        </div>
        <div className="mt-8 flex-1">
          <SideNav badges={{ "/app/support": openTickets }} />
        </div>
        <div className="rounded-lg bg-white/5 p-3 text-xs leading-relaxed text-white/60">{t("nav.closedBanner")}</div>
      </aside>

      <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur">
        <div className="flex h-14 items-center gap-2 px-4 sm:px-6">
          <div className="lg:hidden">
            <Logo height={22} href="/app" />
          </div>
          <div className="hidden min-w-0 flex-1 items-center gap-2 text-xs text-muted lg:flex">
            <Info size={14} className="shrink-0" aria-hidden />
            <span className="truncate">{t("nav.closedBanner")}</span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <div className="hidden sm:block">
              <LocaleSwitcher />
            </div>
            <UserMenu email={member.email} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:pb-12 lg:pt-8">{children}</main>
      <BottomNav />
    </div>
  );
}
