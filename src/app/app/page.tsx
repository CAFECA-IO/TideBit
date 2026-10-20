import Link from "next/link";
import { ArrowRight, ArrowUpRight, Megaphone, ShieldCheck } from "lucide-react";
import { ButtonLink, Card, CardHeader, CoinIcon, EmptyState } from "@/components/ui";
import { IdentityBadge, IdentityProgress, WithdrawBadge } from "@/components/member/status";
import { getI18n } from "@/i18n/server";
import { requireMember } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtAmount, fmtDateTime } from "@/lib/format";
import { getHoldings, sumUsd } from "@/lib/queries";
import { reasonKey } from "@/lib/reasons";
import { getSettings } from "@/lib/settings";
import { OPEN_AASM } from "@/lib/withdraw";
import { currencyMap, unknownCurrency } from "@/lib/currencies";
import { ledgerRows } from "@/lib/history";
import { displayName } from "@/lib/members";

export const metadata = { title: "Overview" };

export default async function Overview() {
  const { member } = await requireMember();
  const { t, locale } = await getI18n();
  const [holdings, settings, openWithdraws, recent, cm] = await Promise.all([
    getHoldings(member.id),
    getSettings(),
    db.withdraw.findMany({ where: { memberId: member.id, aasmState: { in: OPEN_AASM } }, orderBy: { id: "desc" } }),
    db.account.findMany({ where: { memberId: member.id }, select: { id: true } }).then((a) => ledgerRows({ accountIds: a.map((x) => x.id), limit: 6 })),
    currencyMap(),
  ]);
  const total = sumUsd(holdings);
  const announcement = settings.announcement[locale] || settings.announcement["zh-TW"];
  const name = displayName(member);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("overview.hello", { name })}</h1>
      </div>

      {announcement && (
        <div className="flex gap-3 rounded-xl border border-info/20 bg-info-soft px-5 py-4 text-sm text-text">
          <Megaphone size={18} className="mt-0.5 shrink-0 text-info" aria-hidden />
          <div className="whitespace-pre-line leading-relaxed">{announcement}</div>
        </div>
      )}

      {/* 提領進度 */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent">
              <ShieldCheck size={20} aria-hidden />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold">{t("overview.progress")}</h2>
                <IdentityBadge status={member.identityStatus} t={t} />
              </div>
              <p className="mt-0.5 text-sm text-muted">
                {member.identityStatus === "VERIFIED"
                  ? t("identity.verifiedDesc")
                  : member.identityStatus === "PENDING_REVIEW"
                    ? t("identity.pendingDesc")
                    : member.identityStatus === "REJECTED"
                      ? t("identity.rejectedDesc")
                      : t("identity.gateDesc")}
              </p>
            </div>
          </div>
          {member.identityStatus === "VERIFIED" ? (
            <ButtonLink href="/app/withdraw/new">
              {t("overview.goWithdraw")} <ArrowUpRight size={16} />
            </ButtonLink>
          ) : member.identityStatus !== "PENDING_REVIEW" ? (
            <ButtonLink href="/app/verify">
              {t("overview.goBind")} <ArrowRight size={16} />
            </ButtonLink>
          ) : null}
        </div>
        <div className="border-t border-border bg-surface-2 px-5 py-4">
          <IdentityProgress status={member.identityStatus} t={t} />
        </div>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* 持有資產 */}
        <Card>
          <CardHeader
            title={t("overview.holdings")}
            desc={t("overview.holdingsCount", { count: holdings.length })}
            action={
              <Link href="/app/assets" className="text-sm text-accent hover:underline">
                {t("common.viewAll")}
              </Link>
            }
          />
          {total && (
            <div className="border-b border-border px-5 py-4">
              <p className="text-xs text-muted">{t("overview.estValue")}</p>
              <p className="num mt-1 text-2xl font-semibold">≈ ${fmtAmount(total, 2, { trim: false })}</p>
              <p className="mt-1 text-[11px] text-muted">{t("overview.estValueNote")}</p>
            </div>
          )}
          {holdings.length === 0 ? (
            <EmptyState title={t("assets.empty")} />
          ) : (
            <ul className="divide-y divide-border">
              {holdings.slice(0, 6).map((h) => (
                <li key={h.code}>
                  <Link href={`/app/assets/${h.code}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2">
                    <CoinIcon code={h.code} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{h.code.toUpperCase()}</p>
                      <p className="truncate text-xs text-muted">{h.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="num font-medium">{fmtAmount(h.total, h.viewPrecision > 4 ? h.viewPrecision : 8)}</p>
                      {h.locked !== "0" && (
                        <p className="num text-xs text-muted">
                          {t("assets.locked")} {fmtAmount(h.locked, 8)}
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          {/* 處理中的提領 */}
          <Card>
            <CardHeader
              title={t("overview.openWithdrawals")}
              action={
                <Link href="/app/withdraw" className="text-sm text-accent hover:underline">
                  {t("common.viewAll")}
                </Link>
              }
            />
            {openWithdraws.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">{t("overview.noOpenWithdrawals")}</p>
            ) : (
              <ul className="divide-y divide-border">
                {openWithdraws.map((w) => {
                  const c = cm.get(w.currency) ?? unknownCurrency(w.currency);
                  return (
                  <li key={String(w.id)}>
                    <Link href={`/app/withdraw/${w.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2">
                      <CoinIcon code={c.code} size={28} />
                      <div className="min-w-0 flex-1">
                        <p className="num text-sm font-medium">
                          {fmtAmount(w.amount ?? 0, 8)} {c.code.toUpperCase()}
                        </p>
                        <p className="text-xs text-muted">{fmtDateTime(w.createdAt, locale)}</p>
                      </div>
                      <WithdrawBadge aasm={w.aasmState} t={t} />
                    </Link>
                  </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* 最近帳務異動 */}
          <Card>
            <CardHeader
              title={t("overview.recentActivity")}
              action={
                <Link href="/app/history" className="text-sm text-accent hover:underline">
                  {t("common.viewAll")}
                </Link>
              }
            />
            {recent.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">{t("common.none")}</p>
            ) : (
              <ul className="divide-y divide-border">
                {recent.map((v) => {
                  const delta = Number(v.balance ?? 0) !== 0 ? (v.balance ?? 0) : (v.locked ?? 0);
                  const c = cm.get(v.currency) ?? unknownCurrency(v.currency);
                  return (
                    <li key={String(v.id)} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium">{t(reasonKey(v.reason))}</p>
                        <p className="text-xs text-muted">{fmtDateTime(v.createdAt, locale)}</p>
                      </div>
                      <p className={`num shrink-0 text-right ${Number(delta) > 0 ? "text-success" : Number(delta) < 0 ? "text-danger" : ""}`}>
                        {fmtAmount(delta, 8, { sign: true })} {c.code.toUpperCase()}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
