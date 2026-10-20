import { redirect } from "next/navigation";
import { Logo } from "@/components/brand";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input } from "@/components/ui";
import { getAdminSession } from "@/lib/auth";
import { adminLoginAction } from "./actions";

export const metadata = { title: "Admin" };

export default async function AdminLogin() {
  const ctx = await getAdminSession();
  if (ctx?.session.v) redirect("/admin");
  return (
    <div className="flex min-h-screen items-center justify-center bg-navy px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-3">
          <Logo tone="light" height={28} href="/admin/login" />
          <span className="rounded bg-white/10 px-2 py-0.5 text-xs font-medium text-white/80">Admin</span>
        </div>
        <div className="rounded-2xl bg-surface p-6 shadow-xl">
          <h1 className="text-lg font-semibold">管理後台登入</h1>
          <p className="mt-1 text-xs text-muted">請使用列於 ADMINS 設定中的 TideBit 會員帳號</p>
          <ActionForm action={adminLoginAction} className="mt-5 space-y-4">
            <Field label="Email" htmlFor="email">
              <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
            </Field>
            <Field label="密碼" htmlFor="password">
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </Field>
            <SubmitButton className="w-full">登入</SubmitButton>
          </ActionForm>
        </div>
      </div>
    </div>
  );
}
