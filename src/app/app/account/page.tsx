import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, CardHeader, DefinitionList, Field, Input } from "@/components/ui";
import { IdentityBadge } from "@/components/member/status";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { getI18n } from "@/i18n/server";
import { requireMember } from "@/lib/auth";
import { legacyName } from "@/lib/members";
import { fmtDate, shortAddr } from "@/lib/format";
import { changePasswordAction } from "../actions";

export const metadata = { title: "Account" };

function maskName(n: string | null) {
  if (!n) return "—";
  const chars = [...n];
  if (chars.length <= 1) return n;
  if (chars.length === 2) return chars[0] + "＊";
  return chars[0] + "＊".repeat(chars.length - 2) + chars[chars.length - 1];
}

export default async function AccountPage() {
  const { member } = await requireMember();
  const { t, locale } = await getI18n();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("account.title")}</h1>

      <Card>
        <CardHeader title={t("account.profile")} />
        <div className="px-5">
          <DefinitionList
            items={[
              { label: t("auth.email"), value: member.email },
              { label: t("account.memberId"), value: <span className="font-mono text-xs">{member.sn ?? String(member.id)}</span> },
              { label: t("account.legacyName"), value: maskName(legacyName(member)) },
              { label: t("account.registeredAt"), value: fmtDate(member.createdAt, locale) },
            ]}
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title={t("identity.title")}
          action={
            <Link href="/app/verify" className="text-sm text-accent hover:underline">
              {t("common.view")}
            </Link>
          }
        />
        <div className="px-5">
          <DefinitionList
            items={[
              { label: t("common.status"), value: <IdentityBadge status={member.identityStatus} t={t} /> },
              { label: t("identity.boundAccount"), value: member.binding ? <span className="font-mono text-xs">{shortAddr(member.binding.account, 10, 8)}</span> : "—" },
              { label: t("identity.legalName"), value: member.binding?.legalName ?? "—" },
            ]}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title={t("account.preferences")} />
        <div className="flex items-center justify-between px-5 py-4">
          <span className="text-sm text-muted">{t("common.language")}</span>
          <LocaleSwitcher className="border border-border" />
        </div>
      </Card>

      <Card>
        <CardHeader title={t("account.changePassword")} />
        <ActionForm action={changePasswordAction} className="space-y-4 px-5 py-5">
          <Field label={t("account.currentPassword")} htmlFor="current">
            <Input id="current" name="current" type="password" autoComplete="current-password" required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("auth.newPassword")} htmlFor="password" hint={t("auth.passwordRule")}>
              <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
            </Field>
            <Field label={t("auth.confirmPassword")} htmlFor="confirm">
              <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} />
            </Field>
          </div>
          <div className="flex justify-end">
            <SubmitButton>{t("common.save")}</SubmitButton>
          </div>
        </ActionForm>
      </Card>

    </div>
  );
}
