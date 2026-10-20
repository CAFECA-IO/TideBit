import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Download } from "lucide-react";
import { Prisma } from "@/generated/prisma/client";
import { Alert, ButtonLink, Card, CardHeader, CoinIcon, buttonClass } from "@/components/ui";
import { LedgerTable } from "@/components/member/tables";
import { Pagination } from "@/components/pagination";
import { getI18n } from "@/i18n/server";
import { requireMember } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtAmount } from "@/lib/format";
import { canWithdraw } from "@/lib/identity";
import { PAGE_SIZE, pageOf } from "@/lib/queries";
import { currencyMap } from "@/lib/currencies";
import { ledgerRows } from "@/lib/history";

export default async function AssetDetail({ params, searchParams }: PageProps<"/app/assets/[code]">) {
  const { code } = await params;
  const sp = await searchParams;
  const page = pageOf(sp);
  const { member } = await requireMember();
  const { t, locale } = await getI18n();
  const cm = await currencyMap();
  const currency = cm.byCode.get(code.toLowerCase());
  if (!currency) notFound();
  const accounts = await db.account.findMany({ where: { memberId: member.id, currency: BigInt(currency.id) } });
  const rows = await ledgerRows({ accountIds: accounts.map((a) => a.id), limit: PAGE_SIZE + 1, offset: (page - 1) * PAGE_SIZE });

  const balance = accounts.reduce((a, x) => a.plus(x.balance ?? 0), new Prisma.Decimal(0));
  const locked = accounts.reduce((a, x) => a.plus(x.locked ?? 0), new Prisma.Decimal(0));
  const withdrawable = currency.withdrawEnabled;
  const up = currency.code.toUpperCase();

  return (
    <div className="space-y-6">
      <Link href="/app/assets" className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft size={14} /> {t("assets.title")}
      </Link>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-4">
            <CoinIcon code={currency.code} size={48} />
            <div>
              <h1 className="text-2xl font-semibold">{up}</h1>
              <p className="text-sm text-muted">
                {currency.name}
                {currency.network ? ` · ${currency.network}` : ""}
              </p>
            </div>
          </div>
          {withdrawable && canWithdraw(member) && !balance.isZero() && (
            <ButtonLink href={`/app/withdraw/new?currency=${currency.code}`}>
              <ArrowUpRight size={16} /> {t("assets.withdraw")}
            </ButtonLink>
          )}
        </div>
        <div className="grid grid-cols-1 divide-y divide-border border-t border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {[
            { label: t("assets.total"), value: balance.plus(locked) },
            { label: t("assets.available"), value: balance },
            { label: t("assets.locked"), value: locked },
          ].map((x) => (
            <div key={x.label} className="px-6 py-4">
              <p className="text-xs text-muted">{x.label}</p>
              <p className="num mt-1 text-xl font-semibold">
                {fmtAmount(x.value, 8)} <span className="text-sm font-normal text-muted">{up}</span>
              </p>
            </div>
          ))}
        </div>
      </Card>

      {!withdrawable && <Alert tone="neutral">{currency.isFiat ? t("assets.fiatNote") : t("assets.notWithdrawable")}</Alert>}
      {!locked.isZero() && <p className="text-xs text-muted">{t("assets.lockedHint")}</p>}

      <Card>
        <CardHeader
          title={t("assets.ledger")}
          action={
            <a href={`/api/export/ledger?currency=${currency.code}`} className={buttonClass("secondary", "sm")}>
              <Download size={14} /> {t("common.export")}
            </a>
          }
        />
        <LedgerTable rows={rows.slice(0, PAGE_SIZE)} cm={cm} t={t} locale={locale} showCurrency={false} />
        <Pagination page={page} hasNext={rows.length > PAGE_SIZE} basePath={`/app/assets/${currency.code}`} params={{}} t={t} />
      </Card>
    </div>
  );
}
