"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { adminRoleOf, getAdminSession } from "@/lib/auth";
import { CafecaVerifyError, consumeNonce, issueNonce, responseNonce, verifyCafecaResponse } from "@/lib/cafeca/server";
import { findLogin, lockedMinutes } from "@/lib/login";
import { CAFECA_ADMIN_PROVIDER, getBinding } from "@/lib/members";
import { audit } from "@/lib/notify";
import { verifyPassword } from "@/lib/password";
import { rateLimit } from "@/lib/ratelimit";
import { clientInfo, createSession } from "@/lib/session";
import type { FormState } from "@/components/forms";
import type { CafecaRequest } from "@/app/app/actions";

/** 管理員以自己的 TideBit 會員帳密登入，且 Email 必須在 ADMINS 名單中 */
export async function adminLoginAction(state: FormState, form: FormData): Promise<FormState> {
  try {
    return await doAdminLogin(state, form);
  } catch (e) {
    unstable_rethrow(e);
    console.error("[admin-login]", e);
    return { error: "系統錯誤，請稍後再試（詳見伺服器 log）" };
  }
}

async function doAdminLogin(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const { ip } = await clientInfo();
  if (!rateLimit(`admin-login:${ip}`, 10, 15 * 60_000)) return { error: "嘗試次數過多，請稍後再試" };
  const found = await findLogin(email, password);
  const ok = await verifyPassword(password, found?.identity.passwordDigest);
  const role = found ? await adminRoleOf({ id: found.member.id, email: found.member.email ?? email }) : null;
  if (!found || !ok || !role || found.member.disabled || lockedMinutes(found.identity) > 0) {
    await audit({ actorType: "ADMIN", actorId: found?.member.id, actorName: email, action: "admin.login_failed", ip });
    return { error: "帳號或密碼錯誤，或此帳號不是管理員" };
  }
  const needCafeca = env.adminRequireCafeca;
  await createSession("A", found.member.id, found.identity.passwordDigest, !needCafeca);
  await audit({ actorType: "ADMIN", actorId: found.member.id, actorName: email, action: needCafeca ? "admin.login_password" : "admin.login", ip });
  redirect(needCafeca ? "/admin/login/verify" : "/admin");
}

function mock(email: string, account: string | null) {
  if (!env.cafecaMock) return undefined;
  const hex = Buffer.from("admin:" + email).toString("hex").padEnd(40, "0").slice(0, 40);
  return { account: account ?? `0x${hex}`, claims: { kyc_level: 2, legal_name: "Admin" } };
}

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export async function startAdminVerifyAction(): Promise<Result<{ request: CafecaRequest }>> {
  const ctx = await getAdminSession();
  if (!ctx) return { ok: false, error: "請重新登入" };
  const bound = await getBinding(ctx.admin.id, db, CAFECA_ADMIN_PROVIDER);
  const { nonce } = await issueNonce({ purpose: "ADMIN_LOGIN", sid: ctx.session.sid });
  return { ok: true, request: { nonce, statement: `TideBit Admin ${ctx.admin.email}`, claims: ["kyc_level"], mock: mock(ctx.admin.email, bound?.account ?? null) } };
}

export async function completeAdminVerifyAction(response: unknown): Promise<Result> {
  const ctx = await getAdminSession();
  if (!ctx) return { ok: false, error: "請重新登入" };
  const { ip } = await clientInfo();
  try {
    const { nonce } = await consumeNonce(responseNonce(response), ctx.session.sid, "ADMIN_LOGIN");
    const v = await verifyCafecaResponse(response, nonce);
    const level = v.claims.kyc?.effectiveLevel ?? v.claims.kyc_level ?? 0;
    if (level < 2) return { ok: false, error: "CAFECA 身分尚未完成實名（L2）" };
    const account = v.account.toLowerCase();
    const bound = await getBinding(ctx.admin.id, db, CAFECA_ADMIN_PROVIDER);
    if (bound && bound.account !== account) {
      await audit({ actorType: "ADMIN", actorId: ctx.admin.id, actorName: ctx.admin.email, action: "admin.cafeca_mismatch", data: { account }, ip });
      return { ok: false, error: "此 CAFECA 身分與管理員帳號綁定的不一致" };
    }
    if (!bound) {
      // 首次登入：綁定為第二因素（存於 authentications，provider = cafeca-admin）
      const now = new Date();
      await db.authentication.create({
        data: { provider: CAFECA_ADMIN_PROVIDER, uid: account, memberId: ctx.admin.id, secret: JSON.stringify({ s: "VERIFIED", l: level }), createdAt: now, updatedAt: now },
      });
    }
    await createSession("A", ctx.admin.id, ctx.member.passwordDigest, true);
    await audit({ actorType: "ADMIN", actorId: ctx.admin.id, actorName: ctx.admin.email, action: bound ? "admin.login" : "admin.cafeca_bound", data: { account }, ip });
    return { ok: true };
  } catch (e) {
    console.warn("[admin-cafeca]", e instanceof CafecaVerifyError ? `${e.code}: ${e.message}` : e);
    if (e instanceof CafecaVerifyError && e.code === "domain_mismatch") {
      return { ok: false, error: `網址設定不一致：${e.message}。請把目前瀏覽器網址的 origin 加入 .env 的 APP_ORIGINS（逗號分隔），重新啟動後再試。` };
    }
    return { ok: false, error: e instanceof CafecaVerifyError ? `CAFECA 驗證失敗（${e.code}）：${e.message}` : "CAFECA 驗證失敗（詳見伺服器 log）" };
  }
}
