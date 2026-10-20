import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { Prisma } from "@/generated/prisma/client";
import { Badge, Card, CardHeader, CoinIcon } from "@/components/ui";
import { IBadge } from "@/components/admin/labels";
import { DepositTable, LedgerTable, OrderTable, TradeTable, WithdrawTable } from "@/components/member/tables";
import { Pagination } from "@/components/pagination";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { currencyMap, marketCodesFor } from "@/lib/currencies";
import { fmtAmount, fmtDateTime } from "@/lib/format";
import { depositRows, ledgerRows, orderRows, tradeRows, withdrawRows } from "@/lib/history";
import { flowByReason, isTimeout, reconcileAccounts } from "@/lib/holders";
import { loadMember } from "@/lib/members";
import { PAGE_SIZE, idParam, pageOf, str } from "@/lib/queries";
import { reasonKey } from "@/lib/reasons";
import { tFor } from "@/i18n/server";
import type { DictKey } from "@/i18n/dict/zh-TW";

export const metadata = { title: "會員幣種紀錄" };

const TABS = ["ledger", "withdraws", "deposits", "orders", "trades"] as const;
type Tab = (typeof TABS)[number];

export default async function HolderDetail({ params, searchParams }: PageProps<"/admin/currencies/[code]/holders/[memberId]">) {
  await requireAdmin("member.view");
  const { code, memberId: rawId } = await params;
  const sp = await searchParams;
  const cm = await currencyMap();
  const c = cm.byCode.get(code.toLowerCase());
  if (!c) notFound();
  const memberId = idParam(rawId);
  const m = await loadMember(memberId);
  if (!m) notFound();
  const t = await tFor("zh-TW");
  const locale = "zh-TW";
  const tab: Tab = (TABS as readonly string[]).includes(str(sp.tab)) ? (str(sp.tab) as Tab) : "ledger";
  const page = pageOf(sp);
  const skip = (page - 1) * PAGE_SIZE;
  const take = PAGE_SIZE + 1;
  const currencyId = BigInt(c.id);
  const up = c.code.toUpperCase();
  const dp = Math.max(c.precision, 8);

  const accounts = await db.account.findMany({ where: { memberId, currency: currencyId }, orderBy: { id: "asc" } });
  const accIds = accounts.map((a) => a.id);
  const balance = accounts.reduce((s, a) => s.plus(a.balance ?? 0), new Prisma.Decimal(0));
  const locked = accounts.reduce((s, a) => s.plus(a.locked ?? 0), new Prisma.Decimal(0));
  const [checks, flows] = await Promise.all([
    reconcileAccounts(accounts).catch((e) => (isTimeout(e) ? "timeout" as const : Promise.reject(e))),
    flowByReason(accIds).catch((e) => (isTimeout(e) ? "timeout" as const : Promise.reject(e))),
  ]);

  let content: React.ReactNode;
  let count = 0;
  const markets = marketCodesFor(c.code).map(BigInt);
  if (tab === "ledger") {
    const rows = await ledgerRows({ accountIds: accIds, limit: take, offset: skip });
    count = rows.length;
    content = <LedgerTable rows={rows.slice(0, PAGE_SIZE)} cm={cm} t={t} locale={locale} showCurrency={false} withdrawBase="/admin/withdrawals" />;
  } else if (tab === "withdraws") {
    const rows = await withdrawRows({ memberId, currency: currencyId, limit: take, offset: skip });
    count = rows.length;
    content = <WithdrawTable rows={rows.slice(0, PAGE_SIZE)} cm={cm} t={t} locale={locale} withdrawBase="/admin/withdrawals" />;
  } else if (tab === "deposits") {
    const rows = await depositRows({ memberId, currency: currencyId, limit: take, offset: skip });
    count = rows.length;
    content = <DepositTable rows={rows.slice(0, PAGE_SIZE)} cm={cm} t={t} locale={locale} />;
  } else if (tab === "orders") {
    const rows = await orderRows({ memberId, markets, limit: take, offset: skip });
    count = rows.length;
    content = <OrderTable rows={rows.slice(0, PAGE_SIZE)} t={t} locale={locale} />;
  } else {
    const rows = await tradeRows({ memberId, markets, limit: take, offset: skip });
    count = rows.length;
    content = <TradeTable rows={rows.slice(0, PAGE_SIZE)} t={t} locale={locale} memberId={memberId} />;
  }

  const reconciled = checks === "timeout" ? null : checks.every((x) => x.ok);
  const base = `/admin/currencies/${c.code}/holders/${memberId}`;

  return (
    <div className="space-y-6">
      <Link href={`/admin/currencies/${c.code}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft size={14} /> {up} 持有用戶
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <CoinIcon code={c.code} size={40} />
          <div>
            <h1 className="text-xl font-semibold">
              {m.email} <span className="text-sm font-normal text-muted">#{String(m.id)}</span>
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
              <IBadge status={m.identityStatus} />
              {m.disabled && <Badge tone="danger">停權</Badge>}
              {m.withdrawDisabled && <Badge tone="warning">禁止提領</Badge>}
              <span>註冊 {fmtDateTime(m.createdAt)}</span>
            </p>
          </div>
        </div>
        <Link href={`/admin/members/${m.id}`} className="text-sm text-accent hover:underline">
          會員頁面 →
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: `可用 ${up}`, value: fmtAmount(balance, dp) },
          { label: `凍結 ${up}`, value: fmtAmount(locked, dp) },
          { label: `合計 ${up}`, value: fmtAmount(balance.plus(locked), dp) },
        ].map((x) => (
          <Card key={x.label} className="px-4 py-3">
            <p className="text-xs text-muted">{x.label}</p>
            <p className="num mt-1 text-lg font-semibold">{x.value}</p>
          </Card>
        ))}
        <Card className="px-4 py-3">
          <p className="text-xs text-muted">帳本對帳</p>
          <p className={clsx("mt-1 flex items-center gap-1.5 font-semibold", reconciled === true && "text-success", reconciled === false && "text-danger", reconciled === null && "text-warning")}>
            {reconciled === true ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
            {reconciled === null ? "查詢逾時" : reconciled ? "帳本與餘額相符" : "帳本與餘額不符"}
          </p>
          {checks !== "timeout" && checks.some((x) => !x.ok) && (
            <p className="num mt-1 text-xs text-muted">
              帳本加總 {fmtAmount(checks.reduce((s, x) => s.plus(x.ledgerBalance), new Prisma.Decimal(0)), dp)} / {fmtAmount(checks.reduce((s, x) => s.plus(x.ledgerLocked), new Prisma.Decimal(0)), dp)}
            </p>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="資金來源與去向" desc="依帳本原因彙總（可用＋凍結的變動量）" />
        {flows === "timeout" ? (
          <p className="px-5 py-4 text-sm text-warning">帳本筆數過多，彙總查詢逾時</p>
        ) : flows.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">無帳本紀錄</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tb-table">
              <thead>
                <tr>
                  <th>原因</th>
                  <th className="r">筆數</th>
                  <th className="r">流入</th>
                  <th className="r">流出</th>
                  <th className="r">淨額</th>
                  <th>最後一筆</th>
                </tr>
              </thead>
              <tbody>
                {flows.map((f) => (
                  <tr key={f.reason}>
                    <td data-label="原因">
                      {t(reasonKey(f.reason))} <span className="text-xs text-muted">({f.reason})</span>
                    </td>
                    <td data-label="筆數" className="r num">{f.count.toLocaleString()}</td>
                    <td data-label="流入" className="r num text-success">{f.inflow.isZero() ? "—" : fmtAmount(f.inflow, dp)}</td>
                    <td data-label="流出" className="r num text-danger">{f.outflow.isZero() ? "—" : fmtAmount(f.outflow, dp)}</td>
                    <td data-label="淨額" className="r num font-medium">{fmtAmount(f.net, dp, { sign: true })}</td>
                    <td data-label="最後一筆" className="whitespace-nowrap text-muted">{fmtDateTime(f.lastAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <div className="flex gap-1 overflow-x-auto border-b border-border px-2">
          {TABS.map((k) => (
            <Link
              key={k}
              href={`${base}?tab=${k}`}
              aria-current={tab === k ? "page" : undefined}
              className={clsx("-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium", tab === k ? "border-brand-teal text-text" : "border-transparent text-muted hover:text-text")}
            >
              {t(`history.tab.${k}` as DictKey)}
            </Link>
          ))}
          <span className="ml-auto flex items-center px-2 text-xs text-muted">
            {tab === "orders" || tab === "trades" ? (markets.length ? `含 ${up} 的市場` : `無 ${up} 市場`) : `僅 ${up}`}
          </span>
        </div>
        {content}
        <Pagination page={page} hasNext={count > PAGE_SIZE} basePath={base} params={{ tab }} t={t} />
      </Card>
    </div>
  );
}
