import { PageHeader } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { requireMember } from "@/lib/auth";
import { getHoldings, sumUsd } from "@/lib/queries";
import { canWithdraw } from "@/lib/identity";
import { fmtAmount } from "@/lib/format";
import { AssetTable } from "./asset-table";

export const metadata = { title: "Assets" };

export default async function AssetsPage() {
  const { member } = await requireMember();
  const { t } = await getI18n();
  const holdings = await getHoldings(member.id, { includeZero: true });
  const total = sumUsd(holdings);
  return (
    <>
      <PageHeader
        title={t("assets.title")}
        desc={total ? `${t("overview.estValue")} ≈ $${fmtAmount(total, 2, { trim: false })}` : undefined}
      />
      <AssetTable holdings={holdings} canWithdraw={canWithdraw(member)} />
    </>
  );
}
