import "server-only";
import { db } from "./db";
import { verifyPassword } from "./password";

export const MAX_FAILS = 5;
export const LOCK_MINUTES = 15;

/**
 * 以 identities（舊系統登入帳密）找到會員。
 * 舊資料可能有同一 Email 的多筆 identities：有提供密碼時，優先採用密碼相符者；
 * 否則優先採用有會員關聯（members.identity_id）的那筆。
 */
export async function findLogin(email: string, password?: string) {
  const identities = await db.identity.findMany({ where: { email: { equals: email, mode: "insensitive" } }, orderBy: { id: "asc" } });
  if (identities.length === 0) return null;
  const linked = await db.member.findMany({ where: { identityId: { in: identities.map((i) => i.id) } }, orderBy: { id: "asc" } });
  let identity = identities.find((i) => linked.some((m) => m.identityId === i.id)) ?? identities[0];
  if (password && identities.length > 1) {
    for (const i of identities) {
      if (i.passwordDigest && (await verifyPassword(password, i.passwordDigest))) {
        identity = i;
        break;
      }
    }
  }
  const member =
    linked.find((m) => m.identityId === identity.id) ??
    (await db.member.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, orderBy: { id: "asc" } }));
  return member ? { identity, member } : null;
}

/** 帳號鎖定狀態：沿用 identities.is_locked / locked_at / retry_count，鎖定 15 分鐘後自動解除 */
export function lockedMinutes(identity: { isLocked: number | null; lockedAt: Date | null }) {
  if (!identity.isLocked) return 0;
  const until = (identity.lockedAt?.getTime() ?? 0) + LOCK_MINUTES * 60_000;
  return until > Date.now() ? Math.ceil((until - Date.now()) / 60_000) : 0;
}

