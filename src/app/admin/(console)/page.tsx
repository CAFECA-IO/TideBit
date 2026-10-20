import Link from "next/link";
import { Prisma } from "@/generated/prisma/client";
import { Alert, Card, CardHeader, CoinIcon } from "@/components/ui";
import { WBadge } from "@/components/admin/labels";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { currencyMap, unknownCurrency } from "@/lib/currencies";
import { fmtAmount, fmtDateTime } from "@/lib/format";
import { CAFECA_PROVIDER } from "@/lib/members";
import { getSettings } from "@/lib/settings";
import { OPEN_AASM, aasmOf } from "@/lib/withdraw";

export const metadata = { title: "儀表板" };

export default async function AdminDashboard() {
  await requireAdmin();
  const count = (s: Parameters<typeof aasmOf>[0]) => db.withdraw.count({ where: { aasmState: { in: aasmOf(s) } } });
  const [submitted, approved, processing, failed, identity, tickets, settings, openByCurrency, recent, members, verified, cm] = await Promise.all([
    count(["SUBMITTED"]),
    count(["APPROVED"]),
    count(["PROCESSING"]),
    count(["FAILED"]),
    db.authentication.count({ where: { provider: CAFECA_PROVIDER, secret: { contains: '"s":"PENDING_REVIEW"' } } }),
    db.ticketTopic.count({ where: { state: "open" } }),
    getSettings(),
    db.withdraw.groupBy({ by: ["currency"], where: { aasmState: { in: OPEN_AASM } }, _sum: { amount: true }, _count: { _all: true } }),
    db.withdraw.findMany({ where: { aasmState: { in: OPEN_AASM } }, include: { member: true }, orderBy: { updatedAt: "desc" }, take: 8 }),
    db.member.count(),
    db.authentication.count({ where: { provider: CAFECA_PROVIDER, secret: { contains: '"s":"VERIFIED"' } } }),
    currencyMap(),
  ]);

  const tiles = [
    { label: "待審核提領", value: submitted, href: "/admin/withdrawals?state=SUBMITTED", tone: "text-warning" },
    { label: "待出款", value: approved, href: "/admin/withdrawals?state=APPROVED", tone: "text-info" },
    { label: "出款中", value: processing, href: "/admin/withdrawals?state=PROCESSING", tone: "text-info" },
    { label: "出款異常", value: failed, href: "/admin/withdrawals?state=FAILED", tone: "text-danger" },
    { label: "待實名審核", value: identity, href: "/admin/identity", tone: "text-warning" },
    { label: "待回覆客服", value: tickets, href: "/admin/tickets", tone: "text-accent" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">儀表板</h1>
      {settings.withdrawPaused && <Alert tone="warning">目前已暫停受理新的提領申請（系統設定）。</Alert>}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map((x) => (
          <Link key={x.label} href={x.href} className="rounded-xl border border-border bg-surface px-4 py-4 hover:border-brand-blue">
            <p className="text-xs text-muted">{x.label}</p>
            <p className={`num mt-1 text-3xl font-semibold ${x.value ? x.tone : "text-muted"}`}>{x.value}</p>
          </Link>
        ))}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.5fr]">
        <Card>
          <CardHeader title="處理中提領總額" desc="各幣種待審核＋待出款＋出款中＋異常" />
          {openByCurrency.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">目前沒有處理中的提領</p>
          ) : (
            <ul className="divide-y divide-border">
              {openByCurrency.map((o) => {
                const c = cm.get(o.currency) ?? unknownCurrency(o.currency);
                return (
                  <li key={String(o.currency)} className="flex items-center gap-3 px-5 py-3">
                    <CoinIcon code={c.code} size={26} />
                    <span className="flex-1 font-medium">{c.code.toUpperCase()}</span>
                    <span className="text-xs text-muted">{o._count._all} 筆</span>
                    <span className="num font-medium">{fmtAmount(o._sum.amount ?? new Prisma.Decimal(0), 8)}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="grid grid-cols-2 border-t border-border text-sm">
            <div className="px-5 py-3">
              <p className="text-xs text-muted">會員總數</p>
              <p className="num font-semibold">{members.toLocaleString()}</p>
            </div>
            <div className="border-l border-border px-5 py-3">
              <p className="text-xs text-muted">已完成 CAFECA 實名</p>
              <p className="num font-semibold">{verified.toLocaleString()}</p>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="處理中的提領" action={<Link href="/admin/withdrawals?state=ALL" className="text-sm text-accent hover:underline">全部</Link>} />
          <div className="overflow-x-auto">
            <table className="tb-table">
              <tbody>
                {recent.map((w) => {
                  const c = cm.get(w.currency) ?? unknownCurrency(w.currency);
                  return (
                    <tr key={String(w.id)}>
                      <td data-label="更新時間" className="whitespace-nowrap text-muted">{fmtDateTime(w.updatedAt)}</td>
                      <td data-label="會員">
                        <Link href={`/admin/withdrawals/${w.id}`} className="font-medium hover:text-accent">
                          {w.member?.email ?? `#${w.memberId}`}
                        </Link>
                      </td>
                      <td data-label="數量" className="r num whitespace-nowrap">
                        {fmtAmount(w.amount ?? 0, 8)} {c.code.toUpperCase()}
                      </td>
                      <td data-label="狀態" className="r">
                        <WBadge aasm={w.aasmState} />
                      </td>
                    </tr>
                  );
                })}
                {recent.length === 0 && (
                  <tr>
                    <td className="text-muted">目前沒有處理中的提領</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
