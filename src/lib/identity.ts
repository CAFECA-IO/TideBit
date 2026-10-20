import "server-only";
import { db } from "./db";
import { env } from "./env";
import { normalizeName } from "./format";
import { CAFECA_PROVIDER, encodeSecret, legacyName, type AppMember, type IdentityStatus } from "./members";
import { audit, notifyMember } from "./notify";
import { getSettings } from "./settings";
import { tFor } from "@/i18n/server";
import type { VerifiedSignIn } from "./cafeca/verify";
import type { DictKey } from "@/i18n/dict/zh-TW";

export class IdentityError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

/** 依 CAFECA 回傳的實名資料檢查，並寫入 authentications（provider = cafeca） */
export async function bindIdentity(member: NonNullable<AppMember>, v: VerifiedSignIn, ip?: string | null) {
  if (member.identityStatus === "VERIFIED") throw new IdentityError("already_verified");

  const kyc = v.claims.kyc;
  const level = kyc?.effectiveLevel ?? v.claims.kyc_level ?? 0;
  if (kyc?.subjectType === "entity") throw new IdentityError("entity");
  if (level < 2) throw new IdentityError("kyc_level");
  if (env.requireProductionSigner && kyc?.signerClass !== "production") throw new IdentityError("production_signer");
  if (v.recoveryPending) throw new IdentityError("recovery_pending");

  const account = v.account.toLowerCase();
  const legalName = v.claims.legal_name ?? null;
  const pairwiseId = v.claims.pairwise_id?.toLowerCase() ?? null;

  // 自動比對：任何一項不符就轉人工審核
  const flags: string[] = [];
  const expected = legacyName(member);
  if (!legalName) flags.push("NO_LEGAL_NAME");
  else if (!expected) flags.push("NO_LEGACY_NAME");
  else if (normalizeName(expected) !== normalizeName(legalName)) flags.push("NAME_MISMATCH");

  const dup = await db.authentication.findFirst({
    where: {
      provider: CAFECA_PROVIDER,
      memberId: { not: member.id },
      OR: [{ uid: account }, ...(pairwiseId ? [{ token: pairwiseId }] : [])],
    },
    select: { id: true },
  });
  if (dup) flags.push("DUPLICATE_IDENTITY");
  if (!(await getSettings()).identityAutoApprove) flags.push("MANUAL_REVIEW");

  const status: IdentityStatus = flags.length === 0 ? "VERIFIED" : "PENDING_REVIEW";
  const now = new Date();
  const secret = encodeSecret({
    s: status,
    l: level,
    c: kyc?.signerClass ?? null,
    d: v.claims.doc_type ?? null,
    n: v.claims.nationality ?? null,
    f: flags,
    t: status === "VERIFIED" ? now.getTime() : null,
  });

  await db.$transaction(async (tx) => {
    // 一個會員只保留一筆 CAFECA 綁定（重新綁定時覆寫）
    const existing = await tx.authentication.findFirst({ where: { memberId: member.id, provider: CAFECA_PROVIDER } });
    const data = { uid: account, nickname: legalName?.slice(0, 255) ?? null, token: pairwiseId, secret, updatedAt: now };
    if (existing) await tx.authentication.update({ where: { id: existing.id }, data: { ...data, createdAt: now } });
    else await tx.authentication.create({ data: { ...data, provider: CAFECA_PROVIDER, memberId: member.id, createdAt: now } });
    await audit(
      { actorType: "MEMBER", actorId: member.id, actorName: member.email, action: "identity.bind", targetType: "member", targetId: member.id, data: { account, level, flags, status, signerClass: kyc?.signerClass }, ip },
      tx,
    );
  });
  const t = await tFor(null);
  await notifyMember({ memberId: member.id, title: t(`notify.identity.${status}` as DictKey), link: "/app/verify" });
  return { status, flags };
}

/** 管理員審核：更新 authentications.secret 內的狀態 */
export async function reviewIdentity(memberId: bigint, status: IdentityStatus, reviewerId: bigint) {
  const a = await db.authentication.findFirst({ where: { memberId, provider: CAFECA_PROVIDER } });
  if (!a) throw new IdentityError("not_bound");
  if (status === "UNBOUND") {
    // 解除綁定：保留紀錄但改 provider，讓會員可以重新綁定
    await db.authentication.update({ where: { id: a.id }, data: { provider: `${CAFECA_PROVIDER}-unbound`, updatedAt: new Date() } });
    return;
  }
  let s: Record<string, unknown> = {};
  try {
    s = JSON.parse(a.secret ?? "{}");
  } catch {
    /* ignore */
  }
  await db.authentication.update({
    where: { id: a.id },
    data: { secret: encodeSecret({ ...(s as { s: IdentityStatus; l: number }), s: status, r: reviewerId.toString(), t: Date.now() }), updatedAt: new Date() },
  });
}

export function canWithdraw(m: { identityStatus: IdentityStatus; withdrawDisabled: boolean; disabled: boolean }) {
  return m.identityStatus === "VERIFIED" && !m.withdrawDisabled && !m.disabled;
}
