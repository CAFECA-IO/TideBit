import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { roleOf } from "./admins";
import { loadMember } from "./members";
import { can, type AdminRole, type Permission } from "./roles";
import { passwordFingerprint, readSession } from "./session";

export { can, type Permission, type AdminRole };

async function load(kind: "M" | "A") {
  const s = await readSession(kind);
  if (!s) return null;
  const member = await loadMember(BigInt(s.id));
  if (!member || member.disabled) return null;
  // 密碼變更後舊 session 失效
  if (s.fp !== passwordFingerprint(member.passwordDigest)) return null;
  return { session: s, member };
}

export const getMemberSession = cache(() => load("M"));

export async function getCurrentMember() {
  return (await getMemberSession())?.member ?? null;
}

/** 頁面與 Server Action 共用：未登入就導向登入頁 */
export async function requireMember() {
  const ctx = await getMemberSession();
  if (!ctx) redirect((await readSession("M")) ? "/login?expired=1" : "/login");
  return ctx;
}

// ───────────── 管理員（以會員帳號登入；角色來自 ADMINS 環境變數或超級管理員指派） ─────────────

export const adminRoleOf = roleOf;

export const getAdminSession = cache(async () => {
  const ctx = await load("A");
  if (!ctx) return null;
  const role = await adminRoleOf(ctx.member);
  if (!role) return null;
  const admin = { id: ctx.member.id, email: ctx.member.email, name: ctx.member.nickname || ctx.member.name || ctx.member.email, role };
  return { session: ctx.session, admin, member: ctx.member };
});

/** 管理後台：未登入或未完成第二因素 → 導向登入；權限不足 → 導向無權限頁 */
export async function requireAdmin(permission?: Permission) {
  const ctx = await getAdminSession();
  if (!ctx) redirect("/admin/login");
  if (!ctx.session.v) redirect("/admin/login/verify");
  if (permission && !can(ctx.admin.role, permission)) redirect("/admin/forbidden");
  return ctx;
}

export type AdminUser = NonNullable<Awaited<ReturnType<typeof getAdminSession>>>["admin"];
