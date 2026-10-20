import Link from "next/link";
import { Download } from "lucide-react";
import clsx from "clsx";
import { Card, PageHeader, buttonClass, inputClass } from "@/components/ui";
import { DepositTable, LedgerTable, OrderTable, TradeTable, WithdrawTable } from "@/components/member/tables";
import { Pagination } from "@/components/pagination";
import { getI18n } from "@/i18n/server";
import { requireMember } from "@/lib/auth";
import { db } from "@/lib/db";
import { currencyMap, marketCodesFor } from "@/lib/currencies";
import { PAGE_SIZE, dateRange, pageOf, str } from "@/lib/queries";
import { depositRows, ledgerRows, orderRows, tradeRows, withdrawRows } from "@/lib/history";
import type { DictKey } from "@/i18n/dict/zh-TW";

export const metadata = { title: "History" };

const TABS = ["ledger", "withdraws", "deposits", "orders", "trades"] as const;
type Tab = (typeof TABS)[number];

export default async function HistoryPage({ searchParams }: PageProps<"/app/history">) {
  const sp = await searchParams;
  const { member } = await requireMember();
  const { t, locale } = await getI18n();
  const tab: Tab = (TABS as readonly string[]).includes(str(sp.tab)) ? (str(sp.tab) as Tab) : "ledger";
  const page = pageOf(sp);
  const code = str(sp.currency).toLowerCase();
  const from = str(sp.from);
  const to = str(sp.to);
  const createdAt = dateRange(from, to);
  const skip = (page - 1) * PAGE_SIZE;
  const take = PAGE_SIZE + 1;

  const cm = await currencyMap();
  // 只列出此會員曾經持有的幣種
  const accounts = await db.account.findMany({ where: { memberId: member.id }, select: { id: true, currency: true } });
  const owned = [...new Set(accounts.map((a) => Number(a.currency)))].map((id) => cm.get(id)).filter((c) => !!c).sort((a, b) => a.code.localeCompare(b.code));
  const cur = cm.byCode.get(code);
  const currencyId = cur ? BigInt(cur.id) : undefined;
  const memberId = member.id;

  let content: React.ReactNode;
  let count = 0;
  if (tab === "ledger") {
    const accIds = accounts.filter((a) => !currencyId || a.currency === currencyId).map((a) => a.id);
    const rows = await ledgerRows({ accountIds: accIds, range: createdAt, limit: take, offset: skip });
    count = rows.length;
    content = <LedgerTable rows={rows.slice(0, PAGE_SIZE)} cm={cm} t={t} locale={locale} />;
  } else if (tab === "withdraws") {
    const rows = await withdrawRows({ memberId, currency: currencyId, range: createdAt, limit: take, offset: skip });
    count = rows.length;
    content = <WithdrawTable rows={rows.slice(0, PAGE_SIZE)} cm={cm} t={t} locale={locale} />;
  } else if (tab === "deposits") {
    const rows = await depositRows({ memberId, currency: currencyId, range: createdAt, limit: take, offset: skip });
    count = rows.length;
    content = <DepositTable rows={rows.slice(0, PAGE_SIZE)} cm={cm} t={t} locale={locale} />;
  } else if (tab === "orders") {
    const markets = code ? marketCodesFor(code).map(BigInt) : null;
    const rows = await orderRows({ memberId, markets, range: createdAt, limit: take, offset: skip });
    count = rows.length;
    content = <OrderTable rows={rows.slice(0, PAGE_SIZE)} t={t} locale={locale} />;
  } else {
    const markets = code ? marketCodesFor(code).map(BigInt) : null;
    const rows = await tradeRows({ memberId, markets, range: createdAt, limit: take, offset: skip });
    count = rows.length;
    content = <TradeTable rows={rows.slice(0, PAGE_SIZE)} t={t} locale={locale} memberId={memberId} />;
  }

  const filters = { tab, currency: code || undefined, from: from || undefined, to: to || undefined };
  const exportQs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <PageHeader title={t("history.title")} desc={t("history.legacyNote")} />
      <Card>
        <div className="flex gap-1 overflow-x-auto border-b border-border px-2">
          {TABS.map((k) => (
            <Link
              key={k}
              href={`/app/history?tab=${k}`}
              aria-current={tab === k ? "page" : undefined}
              className={clsx(
                "-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium",
                tab === k ? "border-brand-teal text-text" : "border-transparent text-muted hover:text-text",
              )}
            >
              {t(`history.tab.${k}` as DictKey)}
            </Link>
          ))}
        </div>
        <form className="flex flex-wrap items-end gap-3 border-b border-border px-4 py-3" action="/app/history">
          <input type="hidden" name="tab" value={tab} />
          <label className="space-y-1 text-xs text-muted">
            <span>{t("common.currency")}</span>
            <select name="currency" defaultValue={code} className={clsx(inputClass, "h-9 w-32")}>
              <option value="">{t("common.all")}</option>
              {owned.map((c) => (
                <option key={c.id} value={c.code}>
                  {c.code.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-muted">
            <span>{t("common.from")}</span>
            <input type="date" name="from" defaultValue={from} className={clsx(inputClass, "h-9 w-40")} />
          </label>
          <label className="space-y-1 text-xs text-muted">
            <span>{t("common.to")}</span>
            <input type="date" name="to" defaultValue={to} className={clsx(inputClass, "h-9 w-40")} />
          </label>
          <button type="submit" className={buttonClass("secondary", "sm", "h-9")}>
            {t("common.apply")}
          </button>
          {(code || from || to) && (
            <Link href={`/app/history?tab=${tab}`} className="h-9 px-2 text-sm leading-9 text-muted hover:text-text">
              {t("common.reset")}
            </Link>
          )}
          <a href={`/api/export/${tab}?${exportQs}`} className={buttonClass("ghost", "sm", "ml-auto h-9")}>
            <Download size={14} /> {t("common.export")}
          </a>
        </form>
        {content}
        <Pagination page={page} hasNext={count > PAGE_SIZE} basePath="/app/history" params={filters} t={t} />
      </Card>
    </>
  );
}
