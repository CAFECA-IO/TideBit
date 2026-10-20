import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { resetAction } from "../../../actions";

export const metadata = { title: "Reset password" };

export default async function ResetPage({ params }: PageProps<"/reset/[token]">) {
  const { token } = await params;
  const { t } = await getI18n();
  return (
    <>
      <h1 className="text-xl font-semibold">{t("auth.resetTitle")}</h1>
      <ActionForm action={resetAction} className="mt-6 space-y-4">
        <input type="hidden" name="token" value={token} />
        <Field label={t("auth.newPassword")} htmlFor="password" hint={t("auth.passwordRule")}>
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
        </Field>
        <Field label={t("auth.confirmPassword")} htmlFor="confirm">
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} />
        </Field>
        <SubmitButton className="w-full" size="lg">
          {t("common.save")}
        </SubmitButton>
      </ActionForm>
      <div className="mt-5 text-center text-sm">
        <Link href="/login" className="text-accent hover:underline">
          {t("auth.backToLogin")}
        </Link>
      </div>
    </>
  );
}
