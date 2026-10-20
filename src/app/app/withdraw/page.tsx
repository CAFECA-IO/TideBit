import Link from "next/link";
import { Plus } from "lucide-react";
import { Alert, ButtonLink, Card, PageHeader } from "@/components/ui";
import { WithdrawTable } from "@/components/member/tables";
import { Pagination } from "@/components/pagination";
import { getI18n } from "@/i18n/server";
import { requireMember } from "@/lib/auth";
import { canWithdraw } from "@/lib/identity";
import { PAGE_SIZE, pageOf } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { currencyMap } from "@/lib/currencies";
import { withdrawRows } from "@/lib/history";

export const metadata = { title: "Withdraw" };

export default async function WithdrawList({ searchParams }: PageProps<"/app/withdraw">) {
  const sp = await searchParams;
  const page = pageOf(sp);
  const { member } = await requireMember();
  const { t, locale } = await getI18n();
  const settings = await getSettings();
  const cm = await currencyMap();
  const rows = await withdrawRows({ memberId: member.id, limit: PAGE_SIZE + 1, offset: (page - 1) * PAGE_SIZE });
  const allowed = canWithdraw(member) && !settings.withdrawPaused;

  return (
    <>
      <PageHeader
        title={t("withdraw.title")}
        action={
          allowed ? (
            <ButtonLink href="/app/withdraw/new">
              <Plus size={16} /> {t("withdraw.new")}
            </ButtonLink>
          ) : undefined
        }
      />
      <div className="mb-6 space-y-3">
        {settings.withdrawPaused && <Alert tone="warning">{t("withdraw.paused")}</Alert>}
        {member.withdrawDisabled && <Alert tone="danger">{t("withdraw.disabled")}</Alert>}
        {!member.withdrawDisabled && member.identityStatus !== "VERIFIED" && (
          <Alert tone="info" title={t("withdraw.needIdentity")}>
            <Link href="/app/verify" className="font-medium underline">
              {t("overview.goBind")} →
            </Link>
          </Alert>
        )}
      </div>
      <Card>
        <WithdrawTable rows={rows.slice(0, PAGE_SIZE)} cm={cm} t={t} locale={locale} />
        <Pagination page={page} hasNext={rows.length > PAGE_SIZE} basePath="/app/withdraw" params={{}} t={t} />
      </Card>
    </>
  );
}
