import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, ExternalLink, MessageCircle } from "lucide-react";
import clsx from "clsx";
import { Alert, Card, CardHeader, CoinIcon, DefinitionList, buttonClass } from "@/components/ui";
import { WithdrawBadge } from "@/components/member/status";
import { getI18n } from "@/i18n/server";
import { requireMember } from "@/lib/auth";
import { db } from "@/lib/db";
import { currencyMap, unknownCurrency } from "@/lib/currencies";
import { explorerUrl, fmtAmount, fmtDateTime } from "@/lib/format";
import { idParam } from "@/lib/queries";
import { stateOf } from "@/lib/withdraw";
import { CancelWithdrawButton } from "./cancel-button";
import type { DictKey } from "@/i18n/dict/zh-TW";

export default async function WithdrawDetail({ params, searchParams }: PageProps<"/app/withdraw/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const { member } = await requireMember();
  const { t, locale } = await getI18n();
  const w = await db.withdraw.findFirst({ where: { id: idParam(id), memberId: member.id } });
  if (!w) notFound();
  const [cm, logs, reject] = await Promise.all([
    currencyMap(),
    db.auditLog.findMany({ where: { auditableType: "Withdraw", auditableId: w.id }, orderBy: { id: "asc" } }),
    db.adminComment.findFirst({ where: { resourceType: "Withdraw", resourceId: w.id.toString(), namespace: "reject" }, orderBy: { id: "desc" } }),
  ]);
  const c = cm.get(w.currency) ?? unknownCurrency(w.currency);
  const up = c.code.toUpperCase();
  const state = stateOf(w.aasmState);
  const txUrl = explorerUrl(c.explorerTx, "txid", w.txid);
  const addrUrl = explorerUrl(c.explorerAddr, "address", w.fundUid);
  const timeline = logs.map((l) => ({ id: String(l.id), state: stateOf(l.targetState), raw: l.targetState, at: l.createdAt }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/app/withdraw" className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft size={14} /> {t("withdraw.list")}
      </Link>

      {sp.created && (
        <Alert tone="success" title={t("withdraw.submitted")}>
          {t("withdraw.submittedDesc")}
        </Alert>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-4">
            <CoinIcon code={c.code} size={44} />
            <div>
              <p className="text-xs text-muted">{t("withdraw.detail")}</p>
              <p className="num text-2xl font-semibold">
                {fmtAmount(w.amount ?? 0, 8)} <span className="text-base font-normal text-muted">{up}</span>
              </p>
            </div>
          </div>
          <WithdrawBadge aasm={w.aasmState} t={t} />
        </div>
        {state === "REJECTED" && reject?.body && (
          <div className="px-6 pb-4">
            <Alert tone="danger" title={t("withdraw.rejectReason")}>
              {reject.body}
            </Alert>
          </div>
        )}
        <div className="border-t border-border px-6">
          <DefinitionList
            items={[
              { label: t("withdraw.sn"), value: <span className="font-mono text-xs">{w.sn ?? String(w.id)}</span> },
              { label: t("common.time"), value: fmtDateTime(w.createdAt, locale) },
              ...(c.network ? [{ label: t("withdraw.network"), value: c.network }] : []),
              {
                label: t("common.address"),
                value: addrUrl ? (
                  <a href={addrUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-accent hover:underline">
                    {w.fundUid}
                  </a>
                ) : (
                  <span className="font-mono text-xs">{w.fundUid ?? "—"}</span>
                ),
              },
              ...(w.memo || w.destinationTag
                ? [{ label: c.memoLabel || t("common.memo"), value: <span className="font-mono text-xs">{w.memo ?? String(w.destinationTag)}</span> }]
                : []),
              { label: t("withdraw.receive"), value: <span className="num">{fmtAmount(w.amount ?? 0, 8)} {up}</span> },
              { label: t("common.fee"), value: <span className="num">{fmtAmount(w.fee ?? 0, 8)} {up}</span> },
              { label: t("withdraw.deduct"), value: <span className="num">{fmtAmount(w.sum, 8)} {up}</span> },
              {
                label: t("common.txid"),
                value: w.txid ? (
                  txUrl ? (
                    <a href={txUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-accent hover:underline">
                      {w.txid} <ExternalLink size={12} className="shrink-0" />
                    </a>
                  ) : (
                    <span className="font-mono text-xs">{w.txid}</span>
                  )
                ) : (
                  "—"
                ),
              },
            ]}
          />
        </div>
      </Card>

      {timeline.length > 0 && (
        <Card>
          <CardHeader title={t("withdraw.timeline")} />
          <ol className="px-6 py-5">
            {timeline.map((e, i) => {
              const last = i === timeline.length - 1;
              return (
                <li key={e.id} className="relative flex gap-4 pb-6 last:pb-0">
                  {!last && <span className="absolute left-[9px] top-6 h-[calc(100%-1rem)] w-px bg-border" aria-hidden />}
                  <span className={clsx("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full", last ? "bg-brand-gradient text-white" : "bg-surface-2 text-muted")}>
                    <CheckCircle2 size={14} />
                  </span>
                  <div>
                    <p className="text-sm font-medium">{e.state === "OTHER" ? e.raw : t(`withdraw.state.${e.state}` as DictKey)}</p>
                    <p className="text-xs text-muted">{fmtDateTime(e.at, locale)}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      <div className="flex flex-wrap gap-3">
        {state === "SUBMITTED" && <CancelWithdrawButton id={String(w.id)} />}
        <Link href={`/app/support/new?subject=${encodeURIComponent(`${t("withdraw.title")} ${w.sn ?? w.id}`)}`} className={buttonClass("secondary")}>
          <MessageCircle size={16} /> {t("withdraw.contactSupport")}
        </Link>
      </div>
    </div>
  );
}
