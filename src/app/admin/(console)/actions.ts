"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getWithdrawConfig, saveWithdrawConfig, type WithdrawConfig } from "@/lib/currencies";
import { IdentityError, reviewIdentity } from "@/lib/identity";
import { loadMember } from "@/lib/members";
import { audit, notifyMember } from "@/lib/notify";
import { clientInfo } from "@/lib/session";
import { listAdmins, removeAdmin, resetAdminCafeca, setAdminRole } from "@/lib/admins";
import { env } from "@/lib/env";
import { isRole } from "@/lib/roles";
import { addBlacklist, getAmlSettings, removeBlacklist, saveAmlSettings, type AmlSettings, type BlacklistType } from "@/lib/aml/config";
import { getSanctions } from "@/lib/aml/sanctions";
import { analyzeWithdraw, forgetRisk } from "@/lib/risk";
import { saveSettings, type Settings } from "@/lib/settings";
import { addComment, createTopic, loadThread, setTopicStatus } from "@/lib/tickets";
import { WithdrawError, addWithdrawComment, transitionWithdraw, type WithdrawAction } from "@/lib/withdraw";
import { tFor } from "@/i18n/server";
import { LOCALES } from "@/i18n/config";
import type { FormState } from "@/components/forms";

const WITHDRAW_ERRORS: Record<string, string> = {
  state: "目前狀態無法執行此操作（可能已被其他管理員處理）",
  four_eyes: "核准與出款必須由不同管理員執行",
  not_processor: "只有開始出款的管理員可以回填 txid",
  txid: "請輸入正確的交易 ID",
  reason: "請填寫退回原因（會顯示給使用者）",
  balance: "會員凍結餘額不足，請檢查帳務",
  fee_account: "此筆舊提領的手續費凍結在另一個資產帳戶，請人工處理帳務",
};

const big = (v: FormDataEntryValue | null) => BigInt(/^\d+$/.test(String(v ?? "")) ? String(v) : "0");

async function log(admin: { id: bigint; email: string }, action: string, targetType: string, targetId: string | bigint, data?: unknown) {
  const { ip } = await clientInfo();
  await audit({ actorType: "ADMIN", actorId: admin.id, actorName: admin.email, action, targetType, targetId: String(targetId), data, ip });
}

async function comment(resourceType: string, resourceId: bigint, body: string, authorId: bigint, namespace = "note") {
  const now = new Date();
  await db.adminComment.create({ data: { namespace, body, resourceType, resourceId: resourceId.toString(), authorId, authorType: "Member", createdAt: now, updatedAt: now } });
}

// ───────────── 提領 ─────────────

export async function withdrawAction(_: FormState, form: FormData): Promise<FormState> {
  const action = String(form.get("action")) as WithdrawAction;
  const perm = action === "approve" || action === "reject" ? "withdraw.review" : "withdraw.process";
  const { admin } = await requireAdmin(perm);
  const id = big(form.get("id"));
  const { ip } = await clientInfo();
  const note = String(form.get("note") ?? "").trim();
  let risk: { verdict: string; score: number; fails: string[] } | undefined;
  if (action === "approve") {
    // 核准前重新分析；建議不放行時必須填寫覆核理由
    const r = await analyzeWithdraw(id, { fresh: true }).catch((e) => {
      console.error("[risk]", e);
      return null;
    });
    if (!r) return { error: "風險分析無法完成，請稍後再試（詳見伺服器 log）" };
    risk = { verdict: r.verdict, score: r.score, fails: r.checks.filter((c) => c.status === "fail").map((c) => c.title) };
    if (r.verdict === "BLOCK" && note.length < 10) {
      return { error: `風險分析建議不放行（${risk.fails.join("；")}）。若仍要核准，請在核准備註填寫至少 10 字的覆核理由。` };
    }
  }
  try {
    await transitionWithdraw(id, action, { type: "ADMIN", id: admin.id, email: admin.email, name: admin.name }, {
      note: (risk && risk.verdict !== "PASS" ? `[風險 ${risk.verdict}/${risk.score}] ` : "") + note || undefined,
      reason: String(form.get("reason") ?? "").trim() || undefined,
      txid: String(form.get("txid") ?? "").trim() || undefined,
      ip,
    });
  } catch (e) {
    if (e instanceof WithdrawError) return { error: WITHDRAW_ERRORS[e.code] ?? e.code };
    console.error(e);
    return { error: "操作失敗" };
  }
  forgetRisk(id);
  revalidatePath(`/admin/withdrawals/${id}`);
  return { ok: "已更新" };
}

export async function withdrawNoteAction(_: FormState, form: FormData): Promise<FormState> {
  const { admin } = await requireAdmin("withdraw.review");
  const id = big(form.get("id"));
  const note = String(form.get("note") ?? "").trim().slice(0, 2000);
  if (!note) return { error: "請輸入內容" };
  await addWithdrawComment(db, id, "note", note, admin.id);
  await log(admin, "withdraw.note", "withdraw", id, { note });
  revalidatePath(`/admin/withdrawals/${id}`);
  return { ok: "已新增備註" };
}

// ───────────── 實名審核 ─────────────

export async function identityReviewAction(_: FormState, form: FormData): Promise<FormState> {
  const { admin } = await requireAdmin("identity.review");
  const memberId = big(form.get("memberId"));
  const decision = String(form.get("decision"));
  const note = String(form.get("note") ?? "").trim().slice(0, 1000) || null;
  const m = await loadMember(memberId);
  if (!m?.binding) return { error: "會員尚未綁定 CAFECA" };

  if (decision === "approve") {
    if (m.binding.level < 2) return { error: "CAFECA 實名等級不足 L2，無法核准" };
  } else if (decision === "reject" || decision === "reset") {
    if (!note) return { error: "請填寫給使用者的說明" };
  } else return { error: "未知操作" };

  const status = decision === "approve" ? "VERIFIED" : decision === "reject" ? "REJECTED" : "UNBOUND";
  try {
    await reviewIdentity(memberId, status, admin.id);
  } catch (e) {
    if (e instanceof IdentityError) return { error: "會員尚未綁定 CAFECA" };
    throw e;
  }
  if (note) await comment("MemberIdentity", memberId, note, admin.id, decision);
  const t = await tFor(null);
  await notifyMember({ memberId, title: t(status === "VERIFIED" ? "notify.identity.VERIFIED" : "notify.identity.REJECTED"), body: note ?? undefined, link: "/app/verify" });
  await log(admin, `identity.${decision}`, "member", memberId, { note, flags: m.binding.flags, legalName: m.binding.legalName, legacyName: m.legacyIdName ?? m.name });
  revalidatePath(`/admin/members/${memberId}`);
  return { ok: "已更新身分狀態" };
}

// ───────────── 會員 ─────────────

export async function memberFlagAction(_: FormState, form: FormData): Promise<FormState> {
  const { admin } = await requireAdmin("member.edit");
  const memberId = big(form.get("memberId"));
  const field = String(form.get("field"));
  const value = form.get("value") === "true";
  const now = new Date();
  if (field === "withdrawDisabled") await db.member.update({ where: { id: memberId }, data: { disableWithdraw: value ? 1 : 0, updatedAt: now } });
  else if (field === "disabled") await db.member.update({ where: { id: memberId }, data: { disabled: value ? 1 : 0, updatedAt: now } });
  else if (field === "unlock") {
    const m = await db.member.findUnique({ where: { id: memberId } });
    if (m?.identityId) await db.identity.update({ where: { id: m.identityId }, data: { isLocked: 0, retryCount: 0n, updatedAt: now } });
  } else return { error: "未知操作" };
  await log(admin, `member.${field}`, "member", memberId, { value });
  revalidatePath(`/admin/members/${memberId}`);
  return { ok: "已更新" };
}

export async function memberNoteAction(_: FormState, form: FormData): Promise<FormState> {
  const { admin } = await requireAdmin("member.note");
  const memberId = big(form.get("memberId"));
  const body = String(form.get("body") ?? "").trim().slice(0, 2000);
  if (!body) return { error: "請輸入內容" };
  await comment("Member", memberId, body, admin.id);
  revalidatePath(`/admin/members/${memberId}`);
  return { ok: "已新增備註" };
}

/** 寄送訊息給會員：建立客服對話並通知（會員可直接回覆） */
export async function messageMemberAction(_: FormState, form: FormData): Promise<FormState> {
  const { admin } = await requireAdmin("member.edit");
  const memberId = big(form.get("memberId"));
  const subject = String(form.get("subject") ?? "").trim().slice(0, 120);
  const body = String(form.get("body") ?? "").trim().slice(0, 5000);
  if (!subject || !body) return { error: "請填寫主旨與內容" };
  const topic = await createTopic(memberId, subject, "", "ANSWERED");
  await addComment(topic.id, admin.id, body, "ANSWERED");
  const t = await tFor(null);
  await notifyMember({ memberId, title: t("notify.message"), body: subject, link: `/app/support/${topic.id}` });
  await log(admin, "member.message", "member", memberId, { ticketId: topic.id, subject });
  revalidatePath(`/admin/members/${memberId}`);
  return { ok: "訊息已送出" };
}

// ───────────── 客服 ─────────────

export async function ticketReplyAction(_: FormState, form: FormData): Promise<FormState> {
  const { admin } = await requireAdmin("ticket.reply");
  const id = big(form.get("ticketId"));
  const body = String(form.get("body") ?? "").trim().slice(0, 5000);
  const close = form.get("close") === "1";
  if (!body) return { error: "請輸入回覆內容" };
  const thread = await loadThread(id);
  if (!thread?.topic.authorId) return { error: "找不到客服單" };
  if (thread.topic.authorId === admin.id) return { error: "不能以客服身分回覆自己的客服單" };
  await addComment(id, admin.id, body, close ? "CLOSED" : "ANSWERED");
  const t = await tFor(null);
  await notifyMember({ memberId: thread.topic.authorId, title: t("notify.ticket.reply", { subject: thread.subject }), link: `/app/support/${id}` });
  await log(admin, "ticket.reply", "ticket", id, { close });
  revalidatePath(`/admin/tickets/${id}`);
  return undefined;
}

export async function ticketStatusAction(id: string, status: "OPEN" | "CLOSED") {
  const { admin } = await requireAdmin("ticket.reply");
  await setTopicStatus(BigInt(id), status);
  await log(admin, "ticket.status", "ticket", id, { status });
  revalidatePath(`/admin/tickets/${id}`);
}

// ───────────── 幣種提領設定 ─────────────

function decStr(v: FormDataEntryValue | null, nullable = false): string | null {
  const s = String(v ?? "").trim();
  if (!s) return nullable ? null : "0";
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error("數值格式錯誤：" + s);
  return s;
}

export async function currencyAction(_: FormState, form: FormData): Promise<FormState> {
  const { admin } = await requireAdmin("currency.edit");
  const code = String(form.get("code") ?? "").toLowerCase();
  if (!/^[a-z0-9_]{1,32}$/.test(code)) return { error: "幣種代碼錯誤" };
  const pattern = String(form.get("addressPattern") ?? "").trim() || null;
  if (pattern) {
    try {
      new RegExp(pattern);
    } catch {
      return { error: "地址 regex 格式錯誤" };
    }
  }
  try {
    const before = await getWithdrawConfig(code);
    const cfg: WithdrawConfig = {
      enabled: form.get("withdrawEnabled") === "on",
      hidden: form.get("visible") !== "on",
      network: String(form.get("network") ?? "").trim() || null,
      fee: decStr(form.get("withdrawFee"))!,
      min: decStr(form.get("withdrawMin"))!,
      max: decStr(form.get("withdrawMax"), true),
      addressPattern: pattern,
      memoRequired: form.get("memoRequired") === "on",
      memoLabel: String(form.get("memoLabel") ?? "").trim() || null,
      notice: String(form.get("withdrawNotice") ?? "").trim() || null,
      explorerTx: String(form.get("explorerTx") ?? "").trim() || null,
      explorerAddr: String(form.get("explorerAddr") ?? "").trim() || null,
      refPriceUsd: decStr(form.get("refPriceUsd"), true),
    };
    await saveWithdrawConfig(code, cfg);
    await log(admin, "currency.update", "currency", code, { before, after: cfg });
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/admin/currencies");
  return { ok: "已儲存" };
}

// ───────────── 系統設定 ─────────────

export async function settingsAction(_: FormState, form: FormData): Promise<FormState> {
  const { admin } = await requireAdmin("settings.edit");
  const announcement: Settings["announcement"] = {};
  for (const l of LOCALES) {
    const v = String(form.get(`announcement.${l}`) ?? "").trim();
    if (v) announcement[l] = v.slice(0, 255);
  }
  const next: Settings = {
    withdrawPaused: form.get("withdrawPaused") === "on",
    identityAutoApprove: form.get("identityAutoApprove") === "on",
    announcement,
    supportEmail: String(form.get("supportEmail") ?? "").trim(),
    cafecaSignupUrl: String(form.get("cafecaSignupUrl") ?? "").trim(),
  };
  await saveSettings(next, admin.id);
  await log(admin, "settings.update", "settings", "0", next);
  revalidatePath("/", "layout");
  return { ok: "已儲存" };
}

// ───────────── 管理員指派（僅超級管理員） ─────────────

async function adminTarget(raw: string) {
  const v = raw.trim().toLowerCase();
  if (/^\d+$/.test(v)) return db.member.findUnique({ where: { id: BigInt(v) } });
  if (v.includes("@")) return db.member.findFirst({ where: { email: { equals: v, mode: "insensitive" } }, orderBy: { id: "asc" } });
  return null;
}

export async function adminAssignAction(_: FormState, form: FormData): Promise<FormState> {
  const { admin } = await requireAdmin("admin.manage");
  const role = String(form.get("role") ?? "");
  if (!isRole(role)) return { error: "請選擇角色" };
  const m = await adminTarget(String(form.get("member") ?? ""));
  if (!m) return { error: "找不到此會員（請輸入會員 Email 或 ID）" };
  if (m.disabled) return { error: "此會員帳號已停權，無法指派為管理員" };
  if (m.id === admin.id) return { error: "不能變更自己的角色" };
  if (env.admins.has((m.email ?? "").toLowerCase())) return { error: "此帳號由環境變數 ADMINS 指定，請修改 .env" };
  const before = (await listAdmins()).find((a) => a.memberId === m.id)?.role ?? null;
  await setAdminRole(m.id, role, admin.email);
  await log(admin, "admin.assign", "member", m.id, { email: m.email, before, after: role });
  revalidatePath("/admin/admins");
  return { ok: `已將 ${m.email} 設為 ${role}` };
}

export async function adminRemoveAction(_: FormState, form: FormData): Promise<FormState> {
  const { admin } = await requireAdmin("admin.manage");
  const memberId = big(form.get("memberId"));
  if (memberId === admin.id) return { error: "不能移除自己" };
  const entry = (await listAdmins()).find((a) => a.memberId === memberId);
  if (!entry) return { error: "此帳號不是管理員" };
  if (entry.source === "env") return { error: "此帳號由環境變數 ADMINS 指定，請修改 .env" };
  await removeAdmin(memberId);
  await log(admin, "admin.remove", "member", memberId, { email: entry.email, role: entry.role });
  revalidatePath("/admin/admins");
  return { ok: `已移除 ${entry.email} 的管理員權限` };
}

export async function adminResetCafecaAction(_: FormState, form: FormData): Promise<FormState> {
  const { admin } = await requireAdmin("admin.manage");
  const memberId = big(form.get("memberId"));
  if (memberId === admin.id) return { error: "不能重設自己的第二因素" };
  const entry = (await listAdmins()).find((a) => a.memberId === memberId);
  if (!entry) return { error: "此帳號不是管理員" };
  const n = await resetAdminCafeca(memberId);
  await log(admin, "admin.reset_cafeca", "member", memberId, { email: entry.email, removed: n });
  revalidatePath("/admin/admins");
  return { ok: n ? `已清除 ${entry.email} 的 CAFECA 綁定，下次登入需重新綁定` : "此管理員尚未綁定 CAFECA" };
}

// ───────────── 洗錢防制 ─────────────

const BL_TYPES: BlacklistType[] = ["address", "member", "email", "name", "cafeca"];

export async function blacklistAddAction(_: FormState, form: FormData): Promise<FormState> {
  const { admin } = await requireAdmin("aml.manage");
  const type = String(form.get("type")) as BlacklistType;
  const value = String(form.get("value") ?? "").trim().slice(0, 200);
  const reason = String(form.get("reason") ?? "").trim().slice(0, 300);
  if (!BL_TYPES.includes(type) || !value) return { error: "請填寫類型與內容" };
  if (!reason) return { error: "請填寫原因" };
  if (type === "member" && !/^#?\d+$/.test(value)) return { error: "會員 ID 格式錯誤" };
  const added = await addBlacklist({ type, value, reason, by: admin.email });
  if (!added) return { error: "已在黑名單中" };
  await log(admin, "aml.blacklist_add", "aml", "0", { type, value, reason });
  const back = String(form.get("back") ?? "");
  const wid = back.match(/^\/admin\/withdrawals\/(\d+)$/)?.[1];
  if (wid) forgetRisk(wid);
  revalidatePath(back.startsWith("/admin/") ? back : "/admin/aml");
  return { ok: "已加入黑名單" };
}

export async function blacklistRemoveAction(_: FormState, form: FormData): Promise<FormState> {
  const { admin } = await requireAdmin("aml.manage");
  const hit = await removeBlacklist(String(form.get("id") ?? ""));
  if (!hit) return { error: "找不到此項目" };
  await log(admin, "aml.blacklist_remove", "aml", "0", hit);
  revalidatePath("/admin/aml");
  return { ok: "已移除" };
}

const codes = (v: FormDataEntryValue | null) =>
  [...new Set(String(v ?? "").toUpperCase().split(/[^A-Z]+/).filter((x) => /^[A-Z]{2}$/.test(x)))];

export async function amlSettingsAction(_: FormState, form: FormData): Promise<FormState> {
  const { admin } = await requireAdmin("aml.manage");
  const num = (k: string, min: number, max: number) => {
    const n = Number(form.get(k));
    if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${k} 數值需介於 ${min}–${max}`);
    return n;
  };
  try {
    const before = await getAmlSettings();
    const next: AmlSettings = {
      highRiskCountries: codes(form.get("highRiskCountries")),
      monitoredCountries: codes(form.get("monitoredCountries")),
      largeWithdrawUsd: num("largeWithdrawUsd", 0, 1e12),
      velocity24h: num("velocity24h", 1, 1000),
      quickTurnaroundHours: num("quickTurnaroundHours", 0, 24 * 365),
      recentChangeHours: num("recentChangeHours", 0, 24 * 365),
      nonTradeShare: num("nonTradeShare", 0, 100) / 100,
      ofacEnabled: form.get("ofacEnabled") === "on",
    };
    await saveAmlSettings(next);
    await log(admin, "aml.settings", "aml", "0", { before, after: next });
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/admin/aml");
  return { ok: "已儲存" };
}

export async function sanctionsRefreshAction(): Promise<FormState> {
  const { admin } = await requireAdmin("aml.manage");
  const s = await getSanctions({ force: true });
  await log(admin, "aml.sanctions_refresh", "aml", "0", { ok: !!s });
  revalidatePath("/admin/aml");
  return s ? { ok: `已更新：${s.entries.size.toLocaleString()} 筆、地址 ${s.addresses.size.toLocaleString()} 個` } : { error: "下載失敗，請查看伺服器 log" };
}
