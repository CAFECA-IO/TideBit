import "server-only";
import { db, type Tx } from "./db";

export type IdentityStatus = "UNBOUND" | "PENDING_REVIEW" | "VERIFIED" | "REJECTED";

/** CAFECA 綁定（存於 authentications，provider = "cafeca"） */
export type CafecaBinding = {
  authId: bigint;
  account: string; // uid
  legalName: string | null; // nickname
  pairwiseId: string | null; // token
  status: IdentityStatus;
  level: number;
  signerClass: string | null;
  docType: string | null;
  nationality: string | null;
  flags: string[];
  reviewerId: string | null;
  reviewedAt: number | null;
  boundAt: Date | null;
};

/** authentications.secret（varchar 255）內的精簡 JSON */
type SecretJson = { s: IdentityStatus; l: number; c?: string | null; d?: string | null; n?: string | null; f?: string[]; r?: string | null; t?: number | null };

export const CAFECA_PROVIDER = "cafeca";
export const CAFECA_ADMIN_PROVIDER = "cafeca-admin";

export function encodeSecret(s: SecretJson) {
  const out = JSON.stringify(s);
  if (out.length > 255) return JSON.stringify({ ...s, f: s.f?.slice(0, 3) });
  return out;
}

function parseBinding(a: { id: bigint; uid: string | null; nickname: string | null; token: string | null; secret: string | null; createdAt: Date | null }): CafecaBinding | null {
  if (!a.uid) return null;
  let s: SecretJson = { s: "PENDING_REVIEW", l: 0 };
  try {
    s = { ...s, ...JSON.parse(a.secret ?? "{}") };
  } catch {
    /* 格式錯誤時視為待審核 */
  }
  return {
    authId: a.id,
    account: a.uid,
    legalName: a.nickname,
    pairwiseId: a.token,
    status: s.s,
    level: s.l ?? 0,
    signerClass: s.c ?? null,
    docType: s.d ?? null,
    nationality: s.n ?? null,
    flags: s.f ?? [],
    reviewerId: s.r ?? null,
    reviewedAt: s.t ?? null,
    boundAt: a.createdAt,
  };
}

export async function getBinding(memberId: bigint, tx: Tx | typeof db = db, provider = CAFECA_PROVIDER) {
  const a = await tx.authentication.findFirst({ where: { memberId, provider }, orderBy: { id: "desc" } });
  return a ? parseBinding(a) : null;
}

export async function getBindings(memberIds: bigint[]) {
  const rows = await db.authentication.findMany({ where: { memberId: { in: memberIds }, provider: CAFECA_PROVIDER }, orderBy: { id: "asc" } });
  const map = new Map<string, CafecaBinding>();
  for (const r of rows) {
    const b = parseBinding(r);
    if (b && r.memberId) map.set(r.memberId.toString(), b);
  }
  return map;
}

export type AppMember = Awaited<ReturnType<typeof loadMember>>;

/** 會員（含登入資料、舊系統證件姓名、CAFECA 綁定） */
export async function loadMember(id: bigint) {
  const m = await db.member.findUnique({ where: { id }, include: { identity: true } });
  if (!m) return null;
  // 舊資料偶有 identity_id 為空或失效，改以 Email 找登入帳號（與登入時的查找方式一致）
  if (!m.identity && m.email) {
    m.identity = await db.identity.findFirst({ where: { email: { equals: m.email, mode: "insensitive" } }, orderBy: { id: "asc" } });
  }
  const [doc, binding] = await Promise.all([
    db.idDocument.findFirst({ where: { memberId: id, aasmState: "verified" }, orderBy: { id: "desc" } }),
    getBinding(id),
  ]);
  return {
    id: m.id,
    sn: m.sn,
    email: (m.email ?? m.identity?.email ?? "").toLowerCase(),
    name: m.name,
    nickname: m.nickname,
    legacyIdName: doc?.name ?? null,
    legacyCountry: doc?.country ?? m.country ?? null,
    phone: m.phoneNumber ? `${m.countryCode ? "+" + m.countryCode + " " : ""}${m.phoneNumber}` : null,
    disabled: !!m.disabled,
    withdrawDisabled: !!m.disableWithdraw,
    createdAt: m.createdAt,
    identityRow: m.identity,
    passwordDigest: m.identity?.passwordDigest ?? null,
    locked: !!m.identity?.isLocked,
    lockedAt: m.identity?.lockedAt ?? null,
    binding,
    identityStatus: (binding?.status ?? "UNBOUND") as IdentityStatus,
  };
}

/** 舊系統登記姓名：已審核證件優先，其次會員資料 */
export function legacyName(m: { legacyIdName: string | null; name: string | null }) {
  return m.legacyIdName || m.name || null;
}

export function displayName(m: { nickname: string | null; name: string | null; email: string; binding: CafecaBinding | null }) {
  return m.nickname || m.binding?.legalName || m.name || m.email.split("@")[0];
}
