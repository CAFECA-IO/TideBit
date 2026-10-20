import { LogOut } from "lucide-react";
import { Logo } from "@/components/brand";
import { AdminMobileNav, AdminSideNav, type AdminNavItem } from "@/components/admin/nav";
import { can, requireAdmin } from "@/lib/auth";
import { aasmOf } from "@/lib/withdraw";
import { CAFECA_PROVIDER } from "@/lib/members";
import { db } from "@/lib/db";
import { adminLogoutAction } from "@/app/actions";
import { ROLE_LABEL } from "@/components/admin/labels";

export const metadata = { title: { default: "Admin", template: "%s · TideBit Admin" } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { admin } = await requireAdmin();
  const [pendingWithdraws, toProcess, pendingIdentity, openTickets] = await Promise.all([
    db.withdraw.count({ where: { aasmState: { in: aasmOf(["SUBMITTED"]) } } }),
    db.withdraw.count({ where: { aasmState: { in: aasmOf(["APPROVED", "PROCESSING", "FAILED"]) } } }),
    db.authentication.count({ where: { provider: CAFECA_PROVIDER, secret: { contains: '"s":"PENDING_REVIEW"' } } }),
    db.ticketTopic.count({ where: { state: "open" } }),
  ]);
  const r = admin.role;
  const items: AdminNavItem[] = [
    { href: "/admin", label: "儀表板", icon: "dashboard" },
    { href: "/admin/withdrawals", label: "提領審核", icon: "withdrawals", badge: pendingWithdraws + toProcess },
    ...(can(r, "member.view") ? [{ href: "/admin/identity", label: "實名審核", icon: "identity" as const, badge: pendingIdentity }] : []),
    ...(can(r, "member.view") ? [{ href: "/admin/members", label: "會員", icon: "members" as const }] : []),
    ...(can(r, "ticket.reply") || can(r, "audit.view") ? [{ href: "/admin/tickets", label: "客服", icon: "tickets" as const, badge: openTickets }] : []),
    { href: "/admin/currencies", label: "幣種與提領設定", icon: "currencies" },
    ...(can(r, "aml.manage") || can(r, "audit.view") ? [{ href: "/admin/aml", label: "洗錢防制", icon: "aml" as const }] : []),
    ...(can(r, "admin.manage") ? [{ href: "/admin/admins", label: "管理員", icon: "admins" as const }] : []),
    ...(can(r, "settings.edit") ? [{ href: "/admin/settings", label: "系統設定", icon: "settings" as const }] : []),
    ...(can(r, "audit.view") ? [{ href: "/admin/audit", label: "稽核紀錄", icon: "audit" as const }] : []),
  ];

  return (
    <div className="min-h-screen lg:pl-60">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-navy-2 px-3 py-5 lg:flex">
        <div className="flex items-center gap-2 px-3">
          <Logo tone="light" height={22} href="/admin" />
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/70">ADMIN</span>
        </div>
        <div className="mt-7 flex-1 overflow-y-auto">
          <AdminSideNav items={items} />
        </div>
      </aside>
      <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <AdminMobileNav items={items} />
          <div className="flex items-center gap-2 lg:hidden">
            <Logo height={20} href="/admin" />
            <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted">ADMIN</span>
          </div>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-muted sm:inline">
              {admin.name} · {ROLE_LABEL[admin.role]}
            </span>
            <form action={adminLogoutAction}>
              <button className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-muted hover:bg-surface-2 hover:text-text" aria-label="登出">
                <LogOut size={16} /> <span className="hidden sm:inline">登出</span>
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">{children}</main>
    </div>
  );
}
