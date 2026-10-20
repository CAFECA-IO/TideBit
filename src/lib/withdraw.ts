import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "./db";
import { env } from "./env";
import { getCurrencies, type Currency } from "./currencies";
import { audit, notifyMember } from "./notify";
import { REASON } from "./reasons";
import { fmtAmount } from "./format";
import { tFor } from "@/i18n/server";
import type { DictKey } from "@/i18n/dict/zh-TW";

const D = Prisma.Decimal;
type Decimal = Prisma.Decimal;

// ───────────── 狀態：沿用舊系統 aasm_state ─────────────

export type WithdrawState = "SUBMITTED" | "APPROVED" | "PROCESSING" | "DONE" | "REJECTED" | "CANCELED" | "FAILED" | "OTHER";

const TO_AASM: Record<Exclude<WithdrawState, "OTHER">, string> = {
  SUBMITTED: "submitted",
  APPROVED: "accepted",
  PROCESSING: "processing",
  DONE: "done",
  REJECTED: "rejected",
  CANCELED: "canceled",
  FAILED: "failed",
};

/** 舊系統狀態 → 新介面狀態（submitting / almost_done 等不在新流程內的狀態歸為 OTHER） */
export function stateOf(aasm: string | null | undefined): WithdrawState {
  switch (aasm) {
    case "submitted":
    case "suspect":
      return "SUBMITTED";
    case "accepted":
      return "APPROVED";
    case "processing":
      return "PROCESSING";
    case "done":
      return "DONE";
    case "rejected":
      return "REJECTED";
    case "canceled":
    case "cancelled":
      return "CANCELED";
    case "failed":
      return "FAILED";
    default:
      return "OTHER";
  }
}

export function aasmOf(states: WithdrawState[]) {
  const out: string[] = [];
  for (const s of states) {
    if (s === "SUBMITTED") out.push("submitted", "suspect");
    else if (s === "CANCELED") out.push("canceled", "cancelled");
    else if (s !== "OTHER") out.push(TO_AASM[s]);
  }
  return out;
}

export const OPEN_STATES: WithdrawState[] = ["SUBMITTED", "APPROVED", "PROCESSING", "FAILED"];
export const OPEN_AASM = aasmOf(OPEN_STATES);

export class WithdrawError extends Error {
  constructor(public code: string, public vars?: Record<string, string | number>) {
    super(code);
  }
}

// ───────────── 申請 ─────────────

export type WithdrawDraft = {
  currencyId: number;
  address: string;
  memo: string | null;
  amount: string; // 實際到帳
  fee: string;
  sum: string;
  saveAddress: boolean;
  label: string | null;
};

function parseAmount(s: string, precision: number): Decimal {
  const v = s.trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(v)) throw new WithdrawError("amount");
  const d = new D(v);
  if (d.lte(0)) throw new WithdrawError("amount");
  if (d.decimalPlaces() > precision) throw new WithdrawError("precision", { dp: precision });
  return d;
}

export function validateAddress(c: Currency, address: string) {
  const a = address.trim();
  if (a.length < 10 || a.length > 128 || /\s/.test(a)) return false;
  if (c.addressPattern) {
    try {
      return new RegExp(c.addressPattern).test(a);
    } catch {
      return true;
    }
  }
  return true;
}

export async function findAccount(memberId: bigint, currencyId: number, tx: Tx | typeof db = db) {
  return tx.account.findFirst({ where: { memberId, currency: BigInt(currencyId) }, orderBy: { id: "asc" } });
}

/** 檢查並計算提領草稿（尚未扣款） */
export async function buildDraft(
  memberId: bigint,
  input: { currencyCode: string; address: string; memo?: string | null; amount: string; saveAddress?: boolean; label?: string | null },
): Promise<{ draft: WithdrawDraft; currency: Currency }> {
  const currency = (await getCurrencies()).find((c) => c.code === input.currencyCode);
  if (!currency || !currency.withdrawEnabled || currency.isFiat) throw new WithdrawError("currency");
  const address = input.address.trim();
  if (!validateAddress(currency, address)) throw new WithdrawError("address");
  const memo = input.memo?.trim().slice(0, 100) || null;
  if (currency.memoRequired && !memo) throw new WithdrawError("memo", { label: currency.memoLabel || "Memo" });

  const amount = parseAmount(input.amount, Math.min(currency.precision, 8));
  if (amount.lt(currency.withdrawMin)) throw new WithdrawError("min");
  if (currency.withdrawMax && amount.gt(currency.withdrawMax)) throw new WithdrawError("max");
  const fee = new D(currency.withdrawFee);
  const sum = amount.plus(fee);

  const account = await findAccount(memberId, currency.id);
  if (!account || new D(account.balance ?? 0).lt(sum)) throw new WithdrawError("balance");

  return {
    currency,
    draft: {
      currencyId: currency.id,
      address,
      memo,
      amount: amount.toFixed(),
      fee: fee.toFixed(),
      sum: sum.toFixed(),
      saveAddress: !!input.saveAddress,
      label: input.label?.trim().slice(0, 40) || null,
    },
  };
}

const FUN = { unlock_funds: 1n, lock_funds: 2n, plus_funds: 3n, sub_funds: 4n, unlock_and_sub_funds: 5n };

/** 帳戶異動並寫入帳本（account_versions），與舊系統相同的欄位語意 */
async function moveFunds(
  tx: Tx,
  p: { accountId: bigint; balance: Decimal; locked: Decimal; fee?: Decimal; reason: number; fun: bigint; withdrawId: bigint },
) {
  // 鎖定帳戶列，並以條件式更新避免可用或凍結變成負數
  await tx.$queryRaw`SELECT id FROM accounts WHERE id = ${p.accountId} FOR UPDATE`;
  const acc = await tx.account.findUnique({ where: { id: p.accountId } });
  if (!acc) throw new WithdrawError("balance");
  const balance = new D(acc.balance ?? 0).plus(p.balance);
  const locked = new D(acc.locked ?? 0).plus(p.locked);
  if (balance.isNegative() || locked.isNegative()) throw new WithdrawError("balance");
  const now = new Date();
  await tx.account.update({ where: { id: acc.id }, data: { balance, locked, updatedAt: now } });
  await tx.accountVersion.create({
    data: {
      memberId: acc.memberId,
      accountId: acc.id,
      currency: acc.currency,
      reason: BigInt(p.reason),
      fun: p.fun,
      balance: p.balance,
      locked: p.locked,
      fee: p.fee ?? new D(0),
      amount: balance.plus(locked),
      modifiableType: "Withdraw",
      modifiableId: p.withdrawId,
      createdAt: now,
      updatedAt: now,
    },
  });
}

async function logTransition(tx: Tx, withdrawId: bigint, from: string | null, to: string, operatorId: bigint | null) {
  const now = new Date();
  await tx.auditLog.create({
    data: { type: "Audit::TransferAuditLog", operatorId, auditableId: withdrawId, auditableType: "Withdraw", sourceState: from, targetState: to, createdAt: now, updatedAt: now },
  });
}

export async function addWithdrawComment(tx: Tx | typeof db, withdrawId: bigint, namespace: "reject" | "note", body: string, authorId: bigint | null) {
  const now = new Date();
  await tx.adminComment.create({
    data: { namespace, body, resourceId: withdrawId.toString(), resourceType: "Withdraw", authorId, authorType: "Member", createdAt: now, updatedAt: now },
  });
}

async function notifyWithdraw(w: { id: bigint; memberId: bigint | null; amount: Prisma.Decimal | null; currency: bigint | null }, state: WithdrawState) {
  if (!w.memberId || state === "OTHER") return;
  const c = (await getCurrencies()).find((x) => x.id === Number(w.currency));
  const t = await tFor(null);
  await notifyMember({
    memberId: w.memberId,
    title: t(`notify.withdraw.${state}` as DictKey, { amount: fmtAmount(w.amount ?? 0, 8), code: (c?.code ?? "").toUpperCase() }),
    link: `/app/withdraw/${w.id}`,
  });
}

function withdrawType(c: Currency) {
  const ref = c.reference || c.code;
  return `Withdraws::${ref.charAt(0).toUpperCase()}${ref.slice(1).replace(/_(\w)/g, (_, x: string) => x.toUpperCase())}`;
}

/** 由 nonce 推導提領編號：同一次 CAFECA 簽署不會產生兩筆提領 */
export function snFromNonce(nonce: string) {
  return "TBW" + createHash("sha256").update(nonce).digest("hex").slice(0, 16).toUpperCase();
}

/** 會員以 CAFECA 簽署後建立提領：凍結資金 */
export async function createWithdraw(member: { id: bigint; email: string }, draft: WithdrawDraft, sn: string, cafecaAccount: string, ip?: string | null) {
  const currency = (await getCurrencies()).find((c) => c.id === draft.currencyId);
  if (!currency) throw new WithdrawError("currency");
  const sum = new D(draft.sum);
  const w = await db.$transaction(async (tx) => {
    if (await tx.withdraw.findFirst({ where: { sn }, select: { id: true } })) throw new WithdrawError("draft");
    const account = await findAccount(member.id, draft.currencyId, tx);
    if (!account) throw new WithdrawError("balance");
    const now = new Date();
    const w = await tx.withdraw.create({
      data: {
        sn,
        memberId: member.id,
        currency: BigInt(draft.currencyId),
        accountId: account.id,
        feeAccountId: account.id,
        amount: draft.amount,
        fee: draft.fee,
        sum: draft.sum,
        fundUid: draft.address,
        fundExtra: draft.label,
        memo: draft.memo,
        aasmState: "submitted",
        type: withdrawType(currency),
        createdAt: now,
        updatedAt: now,
      },
    });
    await moveFunds(tx, { accountId: account.id, balance: sum.neg(), locked: sum, reason: REASON.WITHDRAW_LOCK, fun: FUN.lock_funds, withdrawId: w.id });
    await logTransition(tx, w.id, null, "submitted", member.id);
    if (draft.saveAddress) {
      const exists = await tx.fundSource.findFirst({ where: { memberId: member.id, currency: BigInt(draft.currencyId), uid: draft.address, deletedAt: null } });
      if (!exists) {
        await tx.fundSource.create({
          data: {
            memberId: member.id,
            currency: BigInt(draft.currencyId),
            uid: draft.address,
            extra: draft.label,
            // 舊表只有數字型的 destination_tag，非數字 memo 不保存
            destinationTag: draft.memo && /^\d{1,18}$/.test(draft.memo) ? BigInt(draft.memo) : null,
            createdAt: now,
            updatedAt: now,
          },
        });
      }
    }
    await audit(
      { actorType: "MEMBER", actorId: member.id, actorName: member.email, action: "withdraw.create", targetType: "withdraw", targetId: w.id, data: { ...draft, cafecaAccount }, ip },
      tx,
    );
    return w;
  });
  await notifyWithdraw(w, "SUBMITTED");
  return w;
}

// ───────────── 狀態機 ─────────────

type Actor = { type: "MEMBER"; id: bigint; email: string } | { type: "ADMIN"; id: bigint; email: string; name: string };

const TRANSITIONS: Record<string, { from: WithdrawState[]; to: Exclude<WithdrawState, "OTHER"> }> = {
  cancel: { from: ["SUBMITTED"], to: "CANCELED" },
  approve: { from: ["SUBMITTED"], to: "APPROVED" },
  reject: { from: ["SUBMITTED", "APPROVED", "FAILED"], to: "REJECTED" },
  process: { from: ["APPROVED"], to: "PROCESSING" },
  complete: { from: ["PROCESSING"], to: "DONE" },
  fail: { from: ["PROCESSING"], to: "FAILED" },
  retry: { from: ["FAILED"], to: "APPROVED" },
};
export type WithdrawAction = keyof typeof TRANSITIONS;

/** 最近一次進入某狀態的操作者（由 audit_logs 推得） */
export async function lastOperator(withdrawId: bigint, aasm: string, tx: Tx | typeof db = db) {
  const r = await tx.auditLog.findFirst({ where: { auditableType: "Withdraw", auditableId: withdrawId, targetState: aasm }, orderBy: { id: "desc" } });
  return r ? { operatorId: r.operatorId, at: r.createdAt } : null;
}

/** 提領狀態機：所有狀態變更都經過這裡 */
export async function transitionWithdraw(id: bigint, action: WithdrawAction, actor: Actor, opts: { note?: string; reason?: string; txid?: string; ip?: string | null } = {}) {
  const rule = TRANSITIONS[action];
  const result = await db.$transaction(async (tx) => {
    // 鎖定該筆提領，避免兩位管理員同時操作
    await tx.$queryRaw`SELECT id FROM withdraws WHERE id = ${id} FOR UPDATE`;
    const w = await tx.withdraw.findUnique({ where: { id } });
    if (!w) throw new WithdrawError("state");
    if (actor.type === "MEMBER" && w.memberId !== actor.id) throw new WithdrawError("state");
    const state = stateOf(w.aasmState);
    if (!rule.from.includes(state)) throw new WithdrawError("state");
    // 舊系統「指定手續費資產」的提領，手續費凍結在另一個帳戶，需人工處理
    if (w.feeAccountId && w.accountId && w.feeAccountId !== w.accountId && ["complete", "reject", "cancel"].includes(action)) throw new WithdrawError("fee_account");

    const now = new Date();
    const data: Prisma.WithdrawUpdateInput = { aasmState: TO_AASM[rule.to], updatedAt: now };
    const sum = new D(w.sum);
    const accountId = w.accountId ?? (await findAccount(w.memberId!, Number(w.currency), tx))?.id;
    if (!accountId) throw new WithdrawError("balance");

    if (action === "process" && actor.type === "ADMIN") {
      const approver = await lastOperator(id, "accepted", tx);
      if (env.fourEyes && approver?.operatorId === actor.id) throw new WithdrawError("four_eyes");
    }
    if (action === "complete") {
      const txid = opts.txid?.trim();
      if (!txid || txid.length < 8 || txid.length > 200) throw new WithdrawError("txid");
      const processor = await lastOperator(id, "processing", tx);
      if (processor?.operatorId !== actor.id) throw new WithdrawError("not_processor");
      data.txid = txid;
      data.doneAt = now;
      await moveFunds(tx, { accountId, balance: new D(0), locked: sum.neg(), fee: new D(w.fee ?? 0), reason: REASON.WITHDRAW, fun: FUN.unlock_and_sub_funds, withdrawId: id });
    }
    if (action === "reject" || action === "cancel") {
      if (action === "reject") {
        if (!opts.reason?.trim()) throw new WithdrawError("reason");
        await addWithdrawComment(tx, id, "reject", opts.reason.trim(), actor.id);
      }
      data.doneAt = now;
      await moveFunds(tx, { accountId, balance: sum, locked: sum.neg(), reason: REASON.WITHDRAW_UNLOCK, fun: FUN.unlock_funds, withdrawId: id });
    }
    if (opts.note && actor.type === "ADMIN" && action !== "reject") await addWithdrawComment(tx, id, "note", `[${action}] ${opts.note}`, actor.id);

    const updated = await tx.withdraw.update({ where: { id }, data });
    await logTransition(tx, id, w.aasmState, TO_AASM[rule.to], actor.id);
    await audit(
      { actorType: actor.type, actorId: actor.id, actorName: actor.email, action: `withdraw.${action}`, targetType: "withdraw", targetId: id, data: { from: w.aasmState, to: TO_AASM[rule.to], reason: opts.reason, txid: opts.txid, note: opts.note }, ip: opts.ip },
      tx,
    );
    return updated;
  });
  await notifyWithdraw(result, rule.to);
  return result;
}
