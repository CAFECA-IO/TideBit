import Link from "next/link";
import clsx from "clsx";
import { ExternalLink } from "lucide-react";
import { Prisma } from "@/generated/prisma/client";
import { CoinIcon, EmptyState } from "@/components/ui";
import { WithdrawBadge } from "@/components/member/status";
import { marketOf, unknownCurrency, type Currency } from "@/lib/currencies";
import { explorerUrl, fmtAmount, fmtDateTime, shortAddr } from "@/lib/format";
import { reasonKey } from "@/lib/reasons";
import type { T } from "@/i18n/server";
import type { AccountVersion, Deposit, Order, Trade, Withdraw } from "@/generated/prisma/client";

type CM = { get(id: bigint | number | null | undefined): Currency | undefined };
const cur = (cm: CM, id: bigint | null) => cm.get(id) ?? unknownCurrency(id);
const dec = (v: Prisma.Decimal | null | undefined) => new Prisma.Decimal(v ?? 0);

function Delta({ v }: { v: Prisma.Decimal | null }) {
  const n = Number(v ?? 0);
  return <span className={clsx("num", n > 0 && "text-success", n < 0 && "text-danger")}>{fmtAmount(v ?? 0, 8, { sign: true })}</span>;
}

function TxLink({ txid, template }: { txid: string | null; template: string | null }) {
  if (!txid) return <span className="text-muted">—</span>;
  const url = explorerUrl(template, "txid", txid);
  const label = <span className="font-mono text-xs">{shortAddr(txid, 8, 6)}</span>;
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
      {label} <ExternalLink size={12} />
    </a>
  ) : (
    <span title={txid}>{label}</span>
  );
}

function Coin({ c }: { c: Currency }) {
  return (
    <span className="flex items-center gap-2 font-medium">
      <CoinIcon code={c.code} size={20} />
      {c.code.toUpperCase()}
    </span>
  );
}

export function LedgerTable({ rows, cm, t, locale, showCurrency = true, withdrawBase = "/app/withdraw" }: { rows: AccountVersion[]; cm: CM; t: T; locale: string; showCurrency?: boolean; withdrawBase?: string }) {
  if (rows.length === 0) return <EmptyState title={t("common.none")} />;
  return (
    <div className="overflow-x-auto">
      <table className="tb-table">
        <thead>
          <tr>
            <th>{t("common.time")}</th>
            {showCurrency && <th>{t("common.currency")}</th>}
            <th>{t("history.reason")}</th>
            <th className="r">{t("assets.available")}</th>
            <th className="r">{t("assets.locked")}</th>
            <th className="r">{t("history.balanceAfter")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => (
            <tr key={String(v.id)}>
              <td data-label={t("common.time")} className="whitespace-nowrap text-muted">{fmtDateTime(v.createdAt, locale)}</td>
              {showCurrency && (
                <td data-label={t("common.currency")}>
                  <Coin c={cur(cm, v.currency)} />
                </td>
              )}
              <td data-label={t("history.reason")} className="whitespace-nowrap">
                {t(reasonKey(v.reason))}
                {v.modifiableType === "Withdraw" && v.modifiableId && (
                  <Link href={`${withdrawBase}/${v.modifiableId}`} className="ml-1 text-xs text-accent hover:underline">
                    #{String(v.modifiableId)}
                  </Link>
                )}
              </td>
              <td data-label={t("assets.available")} className="r">
                <Delta v={v.balance} />
              </td>
              <td data-label={t("assets.locked")} className="r">
                <Delta v={v.locked} />
              </td>
              <td data-label={t("history.balanceAfter")} className="r num">{fmtAmount(v.amount ?? 0, 8)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WithdrawTable({ rows, cm, t, locale, withdrawBase = "/app/withdraw" }: { rows: Withdraw[]; cm: CM; t: T; locale: string; withdrawBase?: string }) {
  if (rows.length === 0) return <EmptyState title={t("withdraw.empty")} />;
  return (
    <div className="overflow-x-auto">
      <table className="tb-table">
        <thead>
          <tr>
            <th>{t("common.time")}</th>
            <th>{t("common.currency")}</th>
            <th className="r">{t("common.amount")}</th>
            <th className="r">{t("common.fee")}</th>
            <th>{t("common.address")}</th>
            <th>{t("common.txid")}</th>
            <th>{t("common.status")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((w) => {
            const c = cur(cm, w.currency);
            return (
              <tr key={String(w.id)}>
                <td data-label={t("common.time")} className="whitespace-nowrap text-muted">
                  <Link href={`${withdrawBase}/${w.id}`} className="hover:text-accent hover:underline">
                    {fmtDateTime(w.createdAt, locale)}
                  </Link>
                </td>
                <td data-label={t("common.currency")}>
                  <Coin c={c} />
                </td>
                <td data-label={t("common.amount")} className="r num font-medium">{fmtAmount(w.amount ?? 0, 8)}</td>
                <td data-label={t("common.fee")} className="r num text-muted">{fmtAmount(w.fee ?? 0, 8)}</td>
                <td data-label={t("common.address")} className="font-mono text-xs" title={w.fundUid ?? undefined}>
                  {shortAddr(w.fundUid)}
                </td>
                <td data-label={t("common.txid")}>
                  <TxLink txid={w.txid} template={c.explorerTx} />
                </td>
                <td data-label={t("common.status")}>
                  <Link href={`${withdrawBase}/${w.id}`}>
                    <WithdrawBadge aasm={w.aasmState} t={t} />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function depositStateKey(s: string | null) {
  if (s === "accepted" || s === "done" || s === "checked") return "history.depositState.accepted" as const;
  if (s === "rejected" || s === "cancelled" || s === "canceled") return "history.depositState.rejected" as const;
  if (s === "submitting" || s === "submitted" || s === "warning") return "history.depositState.submitted" as const;
  return "history.depositState.other" as const;
}

export function DepositTable({ rows, cm, t, locale }: { rows: Deposit[]; cm: CM; t: T; locale: string }) {
  if (rows.length === 0) return <EmptyState title={t("common.none")} />;
  return (
    <div className="overflow-x-auto">
      <table className="tb-table">
        <thead>
          <tr>
            <th>{t("common.time")}</th>
            <th>{t("common.currency")}</th>
            <th className="r">{t("common.amount")}</th>
            <th>{t("common.txid")}</th>
            <th>{t("common.status")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => {
            const c = cur(cm, d.currency);
            return (
              <tr key={String(d.id)}>
                <td data-label={t("common.time")} className="whitespace-nowrap text-muted">{fmtDateTime(d.createdAt, locale)}</td>
                <td data-label={t("common.currency")}>
                  <Coin c={c} />
                </td>
                <td data-label={t("common.amount")} className="r num font-medium">{fmtAmount(d.amount ?? 0, 8)}</td>
                <td data-label={t("common.txid")}>
                  <TxLink txid={d.txid} template={c.explorerTx} />
                </td>
                <td data-label={t("common.status")} className="text-sm">{t(depositStateKey(d.aasmState))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function orderStateKey(state: bigint | null) {
  const s = Number(state);
  return s === 100 ? ("history.orderState.wait" as const) : s === 200 ? ("history.orderState.done" as const) : ("history.orderState.cancel" as const);
}

export function OrderTable({ rows, t, locale }: { rows: Order[]; t: T; locale: string }) {
  if (rows.length === 0) return <EmptyState title={t("common.none")} />;
  return (
    <div className="overflow-x-auto">
      <table className="tb-table">
        <thead>
          <tr>
            <th>{t("common.time")}</th>
            <th>{t("history.market")}</th>
            <th>{t("history.side")}</th>
            <th>{t("history.ordType")}</th>
            <th className="r">{t("history.price")}</th>
            <th className="r">{t("history.volume")}</th>
            <th className="r">{t("history.filled")}</th>
            <th>{t("common.status")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => {
            const m = marketOf(o.currency);
            const bid = o.type === "OrderBid";
            return (
              <tr key={String(o.id)}>
                <td data-label={t("common.time")} className="whitespace-nowrap text-muted">{fmtDateTime(o.createdAt, locale)}</td>
                <td data-label={t("history.market")} className="font-medium">{m.name}</td>
                <td data-label={t("history.side")} className={bid ? "text-success" : "text-danger"}>{t(bid ? "history.side.bid" : "history.side.ask")}</td>
                <td data-label={t("history.ordType")}>{o.ordType === "market" ? t("history.ordType.market") : t("history.ordType.limit")}</td>
                <td data-label={t("history.price")} className="r num">{o.price ? fmtAmount(o.price, m.quoteFixed) : "—"}</td>
                <td data-label={t("history.volume")} className="r num">{fmtAmount(o.originVolume ?? 0, 8)}</td>
                <td data-label={t("history.filled")} className="r num">{fmtAmount(dec(o.originVolume).minus(dec(o.volume)), 8)}</td>
                <td data-label={t("common.status")} className="whitespace-nowrap text-sm">{t(orderStateKey(o.state))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function TradeTable({ rows, t, locale, memberId }: { rows: Trade[]; t: T; locale: string; memberId: bigint }) {
  if (rows.length === 0) return <EmptyState title={t("common.none")} />;
  return (
    <div className="overflow-x-auto">
      <table className="tb-table">
        <thead>
          <tr>
            <th>{t("common.time")}</th>
            <th>{t("history.market")}</th>
            <th>{t("history.side")}</th>
            <th className="r">{t("history.price")}</th>
            <th className="r">{t("history.volume")}</th>
            <th className="r">{t("history.total")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((tr) => {
            const m = marketOf(tr.currency);
            const bid = tr.bidMemberId === memberId;
            return (
              <tr key={String(tr.id)}>
                <td data-label={t("common.time")} className="whitespace-nowrap text-muted">{fmtDateTime(tr.createdAt, locale)}</td>
                <td data-label={t("history.market")} className="font-medium">{m.name}</td>
                <td data-label={t("history.side")} className={bid ? "text-success" : "text-danger"}>{t(bid ? "history.side.bid" : "history.side.ask")}</td>
                <td data-label={t("history.price")} className="r num">{fmtAmount(tr.price ?? 0, m.quoteFixed)}</td>
                <td data-label={t("history.volume")} className="r num">{fmtAmount(tr.volume ?? 0, 8)}</td>
                <td data-label={t("history.total")} className="r num">{fmtAmount(tr.funds ?? dec(tr.price).times(dec(tr.volume)), m.quoteFixed)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
