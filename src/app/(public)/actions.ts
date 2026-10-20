"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { db } from "@/lib/db";
import { audit, sendMail } from "@/lib/notify";
import { hashPassword, isStrongPassword, verifyPassword } from "@/lib/password";
import { rateLimit } from "@/lib/ratelimit";
import { clientInfo, createSession, passwordFingerprint, sign, siteOrigin, unsign } from "@/lib/session";
import { getI18n } from "@/i18n/server";
import { LOCK_MINUTES, MAX_FAILS, findLogin, lockedMinutes } from "@/lib/login";

export type FormState = { error?: string; ok?: string } | undefined;


export async function loginAction(state: FormState, form: FormData): Promise<FormState> {
  try {
    return await doLogin(state, form);
  } catch (e) {
    unstable_rethrow(e); // 讓 redirect() 正常運作
    console.error("[login]", e);
    const { t } = await getI18n();
    return { error: t("common.error") };
  }
}

async function doLogin(_: FormState, form: FormData): Promise<FormState> {
  const { t } = await getI18n();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const { ip } = await clientInfo();

  if (!rateLimit(`login:ip:${ip}`, 20, 10 * 60_000) || !rateLimit(`login:email:${email}`, 10, 10 * 60_000)) {
    return { error: t("auth.rateLimited") };
  }
  if (!email || !password) return { error: t("auth.invalid") };

  const found = await findLogin(email, password);
  if (!found) {
    await verifyPassword(password, null);
    return { error: t("auth.invalid") };
  }
  const { identity, member } = found;
  const minutes = lockedMinutes(identity);
  if (minutes > 0) return { error: t("auth.locked", { minutes }) };
  if (member.disabled) return { error: t("auth.disabled") };
  if (!identity.passwordDigest) return { error: t("auth.noPassword") };

  const ok = await verifyPassword(password, identity.passwordDigest);
  const now = new Date();
  if (!ok) {
    const fails = Number(identity.retryCount ?? 0) + 1;
    const lock = fails >= MAX_FAILS;
    await db.identity.update({
      where: { id: identity.id },
      data: { retryCount: lock ? 0n : BigInt(fails), isLocked: lock ? 1 : 0, lockedAt: lock ? now : identity.lockedAt, updatedAt: now },
    });
    await audit({ actorType: "MEMBER", actorId: member.id, actorName: email, action: "auth.login_failed", targetType: "member", targetId: member.id, ip });
    if (lock) return { error: t("auth.locked", { minutes: LOCK_MINUTES }) };
    return { error: t("auth.invalid") };
  }

  await db.identity.update({ where: { id: identity.id }, data: { retryCount: 0n, isLocked: 0, lastVerifyAt: now, updatedAt: now } });
  await createSession("M", member.id, identity.passwordDigest);
  await audit({ actorType: "MEMBER", actorId: member.id, actorName: email, action: "auth.login", targetType: "member", targetId: member.id, ip });
  redirect("/login/continue");
}

type ResetToken = { m: string; fp: string; exp: number };

export async function forgotAction(_: FormState, form: FormData): Promise<FormState> {
  const { t } = await getI18n();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const { ip } = await clientInfo();
  if (!rateLimit(`forgot:ip:${ip}`, 5, 30 * 60_000) || !rateLimit(`forgot:email:${email}`, 3, 30 * 60_000)) {
    return { error: t("auth.rateLimited") };
  }
  const found = email ? await findLogin(email) : null;
  if (found && !found.member.disabled) {
    // 無狀態重設連結：綁定目前的密碼雜湊，密碼一旦變更連結即失效
    const token = sign({ m: found.member.id.toString(), fp: passwordFingerprint(found.identity.passwordDigest), exp: Date.now() + 30 * 60_000 } satisfies ResetToken);
    await sendMail(email, `[TideBit] ${t("auth.resetTitle")}`, `${t("auth.forgotDesc")}\n\n${await siteOrigin()}/reset/${token}`).catch((e) => console.error("[mail]", e));
    await audit({ actorType: "MEMBER", actorId: found.member.id, actorName: email, action: "auth.reset_requested", targetType: "member", targetId: found.member.id, ip });
  }
  // 不透露 Email 是否存在
  return { ok: t("auth.resetSent") };
}

export async function resetAction(_: FormState, form: FormData): Promise<FormState> {
  const { t } = await getI18n();
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (password !== confirm) return { error: t("auth.passwordMismatch") };
  if (!isStrongPassword(password)) return { error: t("auth.passwordWeak") };

  const r = unsign<ResetToken>(token);
  if (!r || r.exp < Date.now()) return { error: t("auth.resetInvalid") };
  const member = await db.member.findUnique({ where: { id: BigInt(r.m) }, include: { identity: true } });
  if (!member?.identity || passwordFingerprint(member.identity.passwordDigest) !== r.fp) return { error: t("auth.resetInvalid") };

  const { ip } = await clientInfo();
  await db.identity.update({
    where: { id: member.identity.id },
    data: { passwordDigest: await hashPassword(password), retryCount: 0n, isLocked: 0, updatedAt: new Date() },
  });
  await audit({ actorType: "MEMBER", actorId: member.id, action: "auth.password_reset", targetType: "member", targetId: member.id, ip });
  redirect("/login?reset=1");
}
