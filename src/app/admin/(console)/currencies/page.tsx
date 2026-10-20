import Link from "next/link";
import { Prisma } from "@/generated/prisma/client";
import { Badge, Card } from "@/components/ui";
import { CoinIcon } from "@/components/ui";
import { can, requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtAmount } from "@/lib/format";
import { getCurrencies } from "@/lib/currencies";

export const metadata = { title: "幣種與提領設定" };

export default async function CurrenciesPage() {
  const { admin } = await requireAdmin();
  const [all, totals] = await Promise.all([
    getCurrencies(true),
    db.account.groupBy({ by: ["currency"], _sum: { balance: true, locked: true }, _count: { _all: true }, where: { OR: [{ balance: { gt: 0 } }, { locked: { gt: 0 } }] } }),
  ]);
  const totalOf = (id: number) => totals.find((x) => Number(x.currency) === id);
  // 開放提領的在前，其次依會員總餘額人數
  const currencies = [...all].sort((a, b) => Number(b.withdrawEnabled) - Number(a.withdrawEnabled) || (totalOf(b.id)?._count._all ?? 0) - (totalOf(a.id)?._count._all ?? 0) || a.id - b.id);
  const editable = can(admin.role, "currency.edit");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">幣種與提領設定</h1>
      <p className="text-sm text-muted">幣種資料來自舊系統 asset_bases；提領設定存於 system_configs。「會員總餘額」為所有會員可用＋凍結總和，即平台需備妥的出款資產。</p>
      <Card>
        <div className="overflow-x-auto">
          <table className="tb-table">
            <thead>
              <tr>
                <th>幣種</th>
                <th>網路</th>
                <th>提領</th>
                <th className="r">手續費</th>
                <th className="r">最低</th>
                <th className="r">持有人數</th>
                <th className="r">會員總餘額</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {currencies.map((c) => {
                const tt = totalOf(c.id);
                const sum = tt ? new Prisma.Decimal(tt._sum.balance ?? 0).plus(tt._sum.locked ?? 0) : null;
                return (
                  <tr key={c.id}>
                    <td data-label="幣種">
                      <span className="flex items-center gap-2">
                        <CoinIcon code={c.code} size={24} />
                        <span>
                          <span className="block font-medium">{c.code.toUpperCase()}</span>
                          <span className="block text-xs text-muted">{c.name}</span>
                        </span>
                      </span>
                    </td>
                    <td data-label="網路" className="text-sm">{c.network ?? "—"}</td>
                    <td data-label="提領">{c.isFiat ? <Badge>法幣</Badge> : c.withdrawEnabled ? <Badge tone="success">開放</Badge> : <Badge>關閉</Badge>}</td>
                    <td data-label="手續費" className="r num">{fmtAmount(c.withdrawFee, 8)}</td>
                    <td data-label="最低" className="r num">{fmtAmount(c.withdrawMin, 8)}</td>
                    <td data-label="持有人數" className="r num">{tt?._count._all ?? 0}</td>
                    <td data-label="會員總餘額" className="r num font-medium">{sum ? fmtAmount(sum, 8) : "—"}</td>
                    <td data-label="" className="r">
                      <Link href={`/admin/currencies/${c.code}`} className="text-sm text-accent hover:underline">
                        {editable ? "設定" : "檢視"}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
