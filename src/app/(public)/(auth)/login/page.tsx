import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert, Field, Input } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { getCurrentMember } from "@/lib/auth";
import { env } from "@/lib/env";
import { loginAction } from "../../actions";
import { CafecaLoginButton } from "./cafeca-login-button";

export const metadata = { title: "Login" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentMember()) redirect("/app");
  const { t } = await getI18n();
  const sp = await searchParams;
  return (
    <>
      <h1 className="text-xl font-semibold">{t("auth.loginTitle")}</h1>
      <p className="mt-1 text-sm text-muted">{t("auth.loginSubtitle")}</p>
      {sp.reset && <Alert tone="success" className="mt-5">{t("auth.resetDone")}</Alert>}
      {sp.expired && <Alert tone="warning" className="mt-5">{t("auth.sessionInvalid")}</Alert>}
      <ActionForm action={loginAction} className="mt-6 space-y-4">
        <Field label={t("auth.email")} htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
        </Field>
        <Field label={t("auth.password")} htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        <SubmitButton className="w-full" size="lg">
          {t("auth.login")}
        </SubmitButton>
      </ActionForm>
      <div className="my-6 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-border" />
        {t("auth.or")}
        <span className="h-px flex-1 bg-border" />
      </div>
      <CafecaLoginButton wallet={env.cafecaWallet} mock={env.cafecaMock} />
      <p className="mt-2 text-center text-xs text-muted">{t("auth.cafecaLoginHint")}</p>
      <div className="mt-5 text-center text-sm">
        <Link href="/forgot" className="text-accent hover:underline">
          {t("auth.forgot")}
        </Link>
      </div>
    </>
  );
}
