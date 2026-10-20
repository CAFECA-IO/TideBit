import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { forgotAction } from "../../actions";

export const metadata = { title: "Reset password" };

export default async function ForgotPage() {
  const { t } = await getI18n();
  return (
    <>
      <h1 className="text-xl font-semibold">{t("auth.forgotTitle")}</h1>
      <p className="mt-1 text-sm text-muted">{t("auth.forgotDesc")}</p>
      <ActionForm action={forgotAction} className="mt-6 space-y-4">
        <Field label={t("auth.email")} htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
        </Field>
        <SubmitButton className="w-full" size="lg">
          {t("auth.sendReset")}
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
