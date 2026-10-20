"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { Badge, Card, CoinIcon, EmptyState, buttonClass, inputClass } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import { fmtAmount, isZeroAmount } from "@/lib/format";
import type { Holding } from "@/lib/queries";

export function AssetTable({ holdings, canWithdraw }: { holdings: Holding[]; canWithdraw: boolean }) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [hideZero, setHideZero] = useState(true);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return holdings.filter(
      (h) => (!hideZero || !isZeroAmount(h.total)) && (!s || h.code.includes(s) || (h.name ?? "").toLowerCase().includes(s)),
    );
  }, [holdings, q, hideZero]);

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <label className="relative min-w-48 flex-1 sm:max-w-xs">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <span className="sr-only">{t("assets.search")}</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("assets.search")} className={`${inputClass} pl-9`} />
        </label>
        <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
          {t("assets.hideZero")}
        </label>
      </div>

      {rows.length === 0 ? (
        <EmptyState title={t("assets.empty")} />
      ) : (
        <>
          {/* 桌機：表格 */}
          <div className="hidden overflow-x-auto md:block">
            <table className="tb-table">
              <thead>
                <tr>
                  <th>{t("common.currency")}</th>
                  <th className="r">{t("assets.total")}</th>
                  <th className="r">{t("assets.available")}</th>
                  <th className="r">{t("assets.locked")}</th>
                  <th className="r" />
                </tr>
              </thead>
              <tbody>
                {rows.map((h) => (
                  <tr key={h.code}>
                    <td data-label={t("common.currency")}>
                      <Link href={`/app/assets/${h.code}`} className="flex items-center gap-3">
                        <CoinIcon code={h.code} size={30} />
                        <span>
                          <span className="block font-medium">{h.code.toUpperCase()}</span>
                          <span className="block text-xs text-muted">{h.name}</span>
                        </span>
                      </Link>
                    </td>
                    <td data-label={t("assets.total")} className="r num font-medium">{fmtAmount(h.total, 8)}</td>
                    <td data-label={t("assets.available")} className="r num">{fmtAmount(h.balance, 8)}</td>
                    <td data-label={t("assets.locked")} className="r num text-muted">{fmtAmount(h.locked, 8)}</td>
                    <td data-label="" className="r">
                      <div className="flex items-center justify-end gap-2">
                        {h.withdrawEnabled ? (
                          canWithdraw && !isZeroAmount(h.balance) ? (
                            <Link href={`/app/withdraw/new?currency=${h.code}`} className={buttonClass("secondary", "sm")}>
                              {t("assets.withdraw")}
                            </Link>
                          ) : null
                        ) : (
                          <span title={h.isFiat ? t("assets.fiatNote") : undefined}>
                            <Badge>{t("assets.notWithdrawable")}</Badge>
                          </span>
                        )}
                        <Link href={`/app/assets/${h.code}`} className={buttonClass("ghost", "sm")} aria-label={t("assets.ledger")}>
                          <ChevronRight size={16} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 手機：卡片列表 */}
          <ul className="divide-y divide-border md:hidden">
            {rows.map((h) => (
              <li key={h.code}>
                <Link href={`/app/assets/${h.code}`} className="flex items-center gap-3 px-4 py-3">
                  <CoinIcon code={h.code} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{h.code.toUpperCase()}</p>
                    <p className="num text-xs text-muted">
                      {t("assets.available")} {fmtAmount(h.balance, 8)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="num font-medium">{fmtAmount(h.total, 8)}</p>
                    {!isZeroAmount(h.locked) && (
                      <p className="num text-xs text-muted">
                        {t("assets.locked")} {fmtAmount(h.locked, 8)}
                      </p>
                    )}
                  </div>
                  <ChevronRight size={16} className="text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
