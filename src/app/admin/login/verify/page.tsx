import { redirect } from "next/navigation";
import { Logo } from "@/components/brand";
import { getAdminSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { CAFECA_ADMIN_PROVIDER, getBinding } from "@/lib/members";
import { adminLogoutAction } from "@/app/actions";
import { AdminVerifyButton } from "./verify-button";

export const metadata = { title: "Admin" };

export default async function AdminVerify() {
  const ctx = await getAdminSession();
  if (!ctx) redirect("/admin/login");
  if (ctx.session.v) redirect("/admin");
  const bound = await getBinding(ctx.admin.id, db, CAFECA_ADMIN_PROVIDER);
  return (
    <div className="flex min-h-screen items-center justify-center bg-navy px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo tone="light" height={28} href="/admin/login" />
        </div>
        <div className="space-y-4 rounded-2xl bg-surface p-6 shadow-xl">
          <h1 className="text-lg font-semibold">第二因素驗證</h1>
          <p className="text-sm text-muted">
            {bound
              ? "請以綁定此管理員帳號的 CAFECA 身分簽署登入。"
              : "首次登入：請以您本人的 CAFECA 身分（需 L2 實名）簽署，系統會將其綁定為此管理員帳號的第二因素。"}
          </p>
          <AdminVerifyButton wallet={env.cafecaWallet} mock={env.cafecaMock} />
          <form action={adminLogoutAction} className="text-center">
            <button className="text-sm text-muted hover:text-text">取消並登出</button>
          </form>
        </div>
      </div>
    </div>
  );
}
