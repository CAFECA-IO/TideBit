import Link from "next/link";
import clsx from "clsx";
import { Search } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { Card, CoinIcon, EmptyState, inputClass } from "@/components/ui";
import { IBadge, W_LABEL, WBadge } from "@/components/admin/labels";
import { Pagination } from "@/components/pagination";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { currencyMap, unknownCurrency } from "@/lib/currencies";
import { fmtAmount, fmtDateTime, shortAddr } from "@/lib/format";
import { getBindings } from "@/lib/members";
import { PAGE_SIZE, pageOf, str } from "@/lib/queries";
import { aasmOf, type WithdrawState } from "@/lib/withdraw";
import { getI18n } from "@/i18n/server";

export const metadata = { title: "提領審核" };

const TABS: (WithdrawState | "ALL")[] = ["SUBMITTED", "APPROVED", "PROCESSING", "FAILED", "DONE", "REJECTED", "CANCELED", "ALL"];

export default async function AdminWithdrawals({ searchParams }: PageProps<"/admin/withdrawals">) {
  await requireAdmin();
  const { t } = await getI18n();
  const sp = await searchParams;
  const state = (TABS as string[]).includes(str(sp.state)) ? (str(sp.state) as WithdrawState | "ALL") : "SUBMITTED";
  const q = str(sp.q).trim();
  const page = pageOf(sp);
  const open = ["SUBMITTED", "APPROVED", "PROCESSING", "FAILED"].includes(state);

  const where: Prisma.WithdrawWhereInput = {
    ...(state === "ALL" ? {} : { aasmState: { in: aasmOf([state]) } }),
    ...(q
      ? {
          OR: [
            { sn: { contains: q, mode: "insensitive" } },
            { fundUid: { contains: q, mode: "insensitive" } },
            { txid: { contains: q, mode: "insensitive" } },
            { member: { email: { contains: q, mode: "insensitive" } } },
            ...(/^\d{1,18}$/.test(q) ? [{ id: BigInt(q) }, { memberId: BigInt(q) }] : []),
          ],
        }
      : {}),
  };
  const [rows, counts, cm] = await Promise.all([
    db.withdraw.findMany({
      where,
      include: { member: true },
      // 待處理的依時間先後（先進先出），其餘新到舊
      orderBy: { id: open ? "asc" : "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE + 1,
    }),
    db.withdraw.groupBy({ by: ["aasmState"], _count: { _all: true } }),
    currencyMap(),
  ]);
  const bindings = await getBindings(rows.map((r) => r.memberId).filter((x): x is bigint => !!x));
  const countOf = (s: WithdrawState | "ALL") => {
    if (s === "ALL") return counts.reduce((a, c) => a + c._count._all, 0);
    const set = aasmOf([s]);
    return counts.filter((c) => c.aasmState && set.includes(c.aasmState)).reduce((a, c) => a + c._count._all, 0);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">提領審核</h1>
      <Card>
        <div className="flex gap-1 overflow-x-auto border-b border-border px-2">
          {TABS.map((s) => (
            <Link
              key={s}
              href={`/admin/withdrawals?state=${s}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={clsx(
                "-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-sm",
                state === s ? "border-brand-teal font-medium" : "border-transparent text-muted hover:text-text",
              )}
            >
              {s === "ALL" ? "全部" : W_LABEL[s]}
              <span className="num rounded-full bg-surface-2 px-1.5 text-[11px] text-muted">{countOf(s)}</span>
            </Link>
          ))}
        </div>
        <form className="flex gap-2 border-b border-border px-4 py-3" action="/admin/withdrawals">
          <input type="hidden" name="state" value={state} />
          <label className="relative flex-1 sm:max-w-md">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input name="q" defaultValue={q} placeholder="編號、Email、地址、txid、會員 ID" className={clsx(inputClass, "h-9 pl-9")} />
          </label>
        </form>
        {rows.length === 0 ? (
          <EmptyState title="沒有符合的提領" />
        ) : (
          <div className="overflow-x-auto">
            <table className="tb-table">
              <thead>
                <tr>
                  <th>申請時間</th>
                  <th>編號</th>
                  <th>會員</th>
                  <th>實名</th>
                  <th>幣種</th>
                  <th className="r">到帳數量</th>
                  <th>地址</th>
                  <th>狀態</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, PAGE_SIZE).map((w) => {
                  const c = cm.get(w.currency) ?? unknownCurrency(w.currency);
                  const b = w.memberId ? bindings.get(w.memberId.toString()) : undefined;
                  return (
                    <tr key={String(w.id)}>
                      <td data-label="申請時間" className="whitespace-nowrap text-muted">{fmtDateTime(w.createdAt)}</td>
                      <td data-label="編號">
                        <Link href={`/admin/withdrawals/${w.id}`} className="font-mono text-xs text-accent hover:underline">
                          {w.sn || `#${w.id}`}
                        </Link>
                      </td>
                      <td data-label="會員" className="max-w-48 truncate">
                        <Link href={`/admin/members/${w.memberId}`} className="hover:text-accent">
                          {w.member?.email ?? `#${w.memberId}`}
                        </Link>
                      </td>
                      <td data-label="實名">
                        <IBadge status={b?.status ?? "UNBOUND"} />
                      </td>
                      <td data-label="幣種">
                        <span className="flex items-center gap-1.5 font-medium">
                          <CoinIcon code={c.code} size={18} />
                          {c.code.toUpperCase()}
                        </span>
                      </td>
                      <td data-label="到帳數量" className="r num font-medium">{fmtAmount(w.amount ?? 0, 8)}</td>
                      <td data-label="地址" className="font-mono text-xs" title={w.fundUid ?? ""}>
                        {shortAddr(w.fundUid)}
                      </td>
                      <td data-label="狀態">
                        <Link href={`/admin/withdrawals/${w.id}`}>
                          <WBadge aasm={w.aasmState} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} hasNext={rows.length > PAGE_SIZE} basePath="/admin/withdrawals" params={{ state, q: q || undefined }} t={t} />
      </Card>
    </div>
  );
}
