"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { requireMember } from "@/lib/auth";
import { CafecaVerifyError, consumeNonce, issueNonce, responseNonce, verifyCafecaResponse } from "@/lib/cafeca/server";
import { IdentityError, bindIdentity, canWithdraw } from "@/lib/identity";
import { loadMember, legacyName } from "@/lib/members";
import { audit } from "@/lib/notify";
import { hashPassword, isStrongPassword, verifyPassword } from "@/lib/password";
import { clientInfo, createSession } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { addComment, createTopic, setTopicStatus } from "@/lib/tickets";
import { WithdrawError, buildDraft, createWithdraw, snFromNonce, transitionWithdraw, type WithdrawDraft } from "@/lib/withdraw";
import { getCurrencies } from "@/lib/currencies";
import { fmtAmount, shortAddr } from "@/lib/format";
import { getI18n } from "@/i18n/server";
import type { DictKey } from "@/i18n/dict/zh-TW";
import type { FormState } from "@/components/forms";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export type CafecaRequest = {
  nonce: string;
  statement?: string;
  claims: string[];
  mock?: { account: string; claims: Record<string, unknown> };
};

/** 開發模式下的模擬簽署資料 */
function mockFor(m: { email: string; legacyIdName: string | null; name: string | null; binding: { account: string } | null }) {
  if (!env.cafecaMock) return undefined;
  const hex = Buffer.from(m.email).toString("hex").padEnd(40, "0").slice(0, 40);
  return { account: m.binding?.account ?? `0x${hex}`, claims: { kyc_level: 2, legal_name: legacyName(m) ?? "Mock User" } };
}

async function cafecaErrorText(e: unknown) {
  const { t } = await getI18n();
  const code = e instanceof CafecaVerifyError || e instanceof IdentityError ? e.code : "verify_failed";
  if (e instanceof CafecaVerifyError && (e.code === "verify_failed" || e.code === "domain_mismatch")) console.warn(`[cafeca] ${e.code}:`, e.message);
  if (!(e instanceof CafecaVerifyError) && !(e instanceof IdentityError)) console.error(e);
  const key = `identity.err.${code}` as DictKey;
  const text = t(key);
  return text === key ? t("identity.err.verify_failed") : text;
}

// ───────────── CAFECA 綁定 ─────────────

export async function startBindAction(): Promise<Result<{ request: CafecaRequest }>> {
  const { member, session } = await requireMember();
  const { t } = await getI18n();
  if (member.identityStatus === "VERIFIED") return { ok: false, error: t("identity.err.already_verified") };
  const { nonce } = await issueNonce({ purpose: "BIND", sid: session.sid });
  return {
    ok: true,
    request: {
      nonce,
      statement: `TideBit #${member.id} ${t("identity.gateTitle")}`.slice(0, 200),
      claims: ["kyc_level", "legal_name", "doc_type", "nationality", "pairwise_id"],
      mock: mockFor(member),
    },
  };
}

export async function completeBindAction(response: unknown): Promise<Result<{ status: string }>> {
  const { member, session } = await requireMember();
  const { ip } = await clientInfo();
  try {
    const { nonce } = await consumeNonce(responseNonce(response), session.sid, "BIND");
    const verified = await verifyCafecaResponse(response, nonce);
    const { status } = await bindIdentity(member, verified, ip);
    revalidatePath("/app", "layout");
    return { ok: true, status };
  } catch (e) {
    return { ok: false, error: await cafecaErrorText(e) };
  }
}

// ───────────── 提領 ─────────────

async function withdrawErrorText(e: unknown) {
  const { t } = await getI18n();
  if (e instanceof WithdrawError) {
    const key = `withdraw.err.${e.code}` as DictKey;
    const text = t(key, e.vars);
    return text === key ? t("common.error") : text;
  }
  console.error(e);
  return t("common.error");
}

export type WithdrawInput = { currencyCode: string; address: string; memo?: string; amount: string; saveAddress?: boolean; label?: string };

/** 檢查草稿並產生 CAFECA 簽署請求（尚未扣款） */
export async function prepareWithdrawAction(input: WithdrawInput): Promise<Result<{ request: CafecaRequest; draft: WithdrawDraft }>> {
  const { member, session } = await requireMember();
  const { t } = await getI18n();
  if ((await getSettings()).withdrawPaused) return { ok: false, error: t("withdraw.paused") };
  if (!canWithdraw(member)) return { ok: false, error: t(member.withdrawDisabled ? "withdraw.disabled" : "withdraw.needIdentity") };
  try {
    const { draft, currency } = await buildDraft(member.id, input);
    const code = currency.code.toUpperCase();
    const statement = `TideBit ${t("withdraw.title")} ${fmtAmount(draft.amount, 8)} ${code} → ${shortAddr(draft.address, 10, 8)} (${t("common.fee")} ${fmtAmount(draft.fee, 8)})`.slice(0, 200);
    const { nonce } = await issueNonce({ purpose: "WITHDRAW", sid: session.sid, payload: draft });
    return { ok: true, draft, request: { nonce, statement, claims: ["kyc_level"], mock: mockFor(member) } };
  } catch (e) {
    return { ok: false, error: await withdrawErrorText(e) };
  }
}

export async function completeWithdrawAction(response: unknown): Promise<Result<{ id: string }>> {
  const { member, session } = await requireMember();
  const { t } = await getI18n();
  const { ip } = await clientInfo();
  try {
    const { nonce, payload } = await consumeNonce<WithdrawDraft>(responseNonce(response), session.sid, "WITHDRAW");
    const verified = await verifyCafecaResponse(response, nonce);
    if (verified.account.toLowerCase() !== member.binding?.account) throw new IdentityError("account_mismatch");
    const level = verified.claims.kyc?.effectiveLevel ?? verified.claims.kyc_level ?? 0;
    if (level < 2) throw new IdentityError("kyc_level");
    if (verified.recoveryPending) throw new IdentityError("recovery_pending");

    // 以伺服器簽發的草稿為準，並重新檢查（餘額、設定可能已變動）
    if (!payload) return { ok: false, error: t("withdraw.err.draft") };
    const fresh = await loadMember(member.id);
    if (!fresh) return { ok: false, error: t("common.error") };
    if ((await getSettings()).withdrawPaused) return { ok: false, error: t("withdraw.paused") };
    if (!canWithdraw(fresh)) return { ok: false, error: t("withdraw.needIdentity") };
    const currency = (await getCurrencies(true)).find((c) => c.id === payload.currencyId);
    if (!currency) return { ok: false, error: t("withdraw.err.currency") };
    const { draft } = await buildDraft(fresh.id, {
      currencyCode: currency.code,
      address: payload.address,
      memo: payload.memo,
      amount: payload.amount,
      saveAddress: payload.saveAddress,
      label: payload.label,
    });
    if (draft.fee !== payload.fee) return { ok: false, error: t("withdraw.err.draft") };

    const w = await createWithdraw(fresh, draft, snFromNonce(nonce), verified.account.toLowerCase(), ip);
    revalidatePath("/app", "layout");
    return { ok: true, id: w.id.toString() };
  } catch (e) {
    if (e instanceof WithdrawError) return { ok: false, error: await withdrawErrorText(e) };
    return { ok: false, error: await cafecaErrorText(e) };
  }
}

export async function cancelWithdrawAction(id: string): Promise<Result> {
  const { member } = await requireMember();
  const { ip } = await clientInfo();
  try {
    await transitionWithdraw(BigInt(id), "cancel", { type: "MEMBER", id: member.id, email: member.email }, { ip });
    revalidatePath("/app", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: await withdrawErrorText(e) };
  }
}

export async function deleteFundSourceAction(id: string) {
  const { member } = await requireMember();
  await db.fundSource.updateMany({ where: { id: BigInt(id), memberId: member.id }, data: { deletedAt: new Date() } });
  revalidatePath("/app/withdraw/new");
}

// ───────────── 客服 ─────────────

export async function createTicketAction(_: FormState, form: FormData): Promise<FormState> {
  const { member } = await requireMember();
  const { t } = await getI18n();
  const subject = String(form.get("subject") ?? "").trim().slice(0, 120);
  const body = String(form.get("body") ?? "").trim().slice(0, 5000);
  if (!subject || !body) return { error: t("common.error") };
  const topic = await createTopic(member.id, subject, body);
  redirect(`/app/support/${topic.id}`);
}

export async function replyTicketAction(_: FormState, form: FormData): Promise<FormState> {
  const { member } = await requireMember();
  const { t } = await getI18n();
  const id = BigInt(String(form.get("ticketId") ?? "0"));
  const body = String(form.get("body") ?? "").trim().slice(0, 5000);
  const topic = await db.ticketTopic.findFirst({ where: { id, authorId: member.id } });
  if (!topic || !body) return { error: t("common.error") };
  if (topic.state === "closed") return { error: t("support.closed") };
  await addComment(id, member.id, body, "OPEN");
  revalidatePath(`/app/support/${id}`);
  return undefined;
}

export async function closeTicketAction(id: string) {
  const { member } = await requireMember();
  const topic = await db.ticketTopic.findFirst({ where: { id: BigInt(id), authorId: member.id } });
  if (topic) await setTopicStatus(topic.id, "CLOSED");
  revalidatePath(`/app/support/${id}`);
}

// ───────────── 帳戶 ─────────────

export async function changePasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const { member } = await requireMember();
  const { t } = await getI18n();
  const current = String(form.get("current") ?? "");
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (!member.identityRow || !(await verifyPassword(current, member.passwordDigest))) return { error: t("account.wrongPassword") };
  if (password !== confirm) return { error: t("auth.passwordMismatch") };
  if (!isStrongPassword(password)) return { error: t("auth.passwordWeak") };
  const { ip } = await clientInfo();
  const digest = await hashPassword(password);
  await db.identity.update({ where: { id: member.identityRow.id }, data: { passwordDigest: digest, updatedAt: new Date() } });
  // 其他裝置的 session 因密碼指紋改變而失效；目前裝置重新簽發
  await createSession("M", member.id, digest);
  await audit({ actorType: "MEMBER", actorId: member.id, actorName: member.email, action: "auth.password_changed", targetType: "member", targetId: member.id, ip });
  return { ok: t("account.passwordChanged") };
}
