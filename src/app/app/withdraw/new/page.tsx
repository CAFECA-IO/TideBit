import { redirect } from "next/navigation";
import { Alert, PageHeader } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { requireMember } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { canWithdraw } from "@/lib/identity";
import { getHoldings, str } from "@/lib/queries";
import { currencyMap } from "@/lib/currencies";
import { getSettings } from "@/lib/settings";
import { WithdrawWizard, type WithdrawAsset } from "./wizard";

export const metadata = { title: "Withdraw" };

export default async function NewWithdraw({ searchParams }: PageProps<"/app/withdraw/new">) {
  const sp = await searchParams;
  const { member } = await requireMember();
  const { t } = await getI18n();
  if (!canWithdraw(member)) redirect(member.identityStatus === "VERIFIED" ? "/app/withdraw" : "/app/verify");
  const settings = await getSettings();

  const cm = await currencyMap();
  const holdings = (await getHoldings(member.id)).filter((h) => h.withdrawEnabled && Number(h.balance) > 0);
  const ids = holdings.map((h) => cm.byCode.get(h.code)!.id);
  const sources = await db.fundSource.findMany({
    where: { memberId: member.id, deletedAt: null, currency: { in: ids.map(BigInt) } },
    orderBy: { id: "desc" },
  });

  const assets: WithdrawAsset[] = holdings.map((h) => {
    const c = cm.byCode.get(h.code)!;
    return {
      code: c.code,
      name: c.name,
      balance: h.balance,
      precision: Math.min(c.precision, 8),
      fee: c.withdrawFee,
      min: c.withdrawMin,
      max: c.withdrawMax,
      network: c.network,
      memoRequired: c.memoRequired,
      memoLabel: c.memoLabel,
      notice: c.withdrawNotice,
      addressPattern: c.addressPattern,
      sources: sources
        .filter((s) => Number(s.currency) === c.id && s.uid)
        .map((s) => ({ id: String(s.id), label: s.extra, address: s.uid!, memo: s.destinationTag ? String(s.destinationTag) : null })),
    };
  });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("withdraw.new")} />
      {settings.withdrawPaused ? (
        <Alert tone="warning">{t("withdraw.paused")}</Alert>
      ) : (
        <WithdrawWizard assets={assets} initial={str(sp.currency)} wallet={env.cafecaWallet} mock={env.cafecaMock} />
      )}
    </div>
  );
}
