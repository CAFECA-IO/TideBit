"use server";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { CafecaVerifyError, consumeNonce, issueNonce, responseNonce, verifyCafecaResponse } from "@/lib/cafeca/server";
import { lockedMinutes } from "@/lib/login";
import { CAFECA_PROVIDER, loadMember } from "@/lib/members";
import { audit } from "@/lib/notify";
import { rateLimit } from "@/lib/ratelimit";
import { clientInfo, createSession } from "@/lib/session";
import { getI18n } from "@/i18n/server";
import type { DictKey } from "@/i18n/dict/zh-TW";
import type { CafecaRequest } from "@/app/app/actions";

/**
 * Sign in with CAFECA：已綁定 CAFECA 的會員可直接以 CAFECA 身分登入。
 * 尚未登入，nonce 以固定的 "login" 作為 sid，仍存放於 httpOnly 簽章 cookie、只能使用一次。
 */
const LOGIN_SID = "login";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export async function startCafecaLoginAction(): Promise<Result<{ request: CafecaRequest }>> {
  const { t } = await getI18n();
  const { ip } = await clientInfo();
  if (!rateLimit(`login-cafeca:${ip}`, 20, 10 * 60_000)) return { ok: false, error: t("auth.rateLimited") };
  const { nonce } = await issueNonce({ purpose: "LOGIN", sid: LOGIN_SID });
  let mock: CafecaRequest["mock"];
  if (env.cafecaMock) {
    // 開發用：模擬以最近一筆綁定的 CAFECA 身分登入（可用 CAFECA_MOCK_LOGIN_ACCOUNT 指定）
    const account =
      process.env.CAFECA_MOCK_LOGIN_ACCOUNT ||
      (await db.authentication.findFirst({ where: { provider: CAFECA_PROVIDER }, orderBy: { id: "desc" }, select: { uid: true } }))?.uid ||
      "0x0000000000000000000000000000000000000001";
    mock = { account, claims: { kyc_level: 2 } };
  }
  return { ok: true, request: { nonce, statement: "TideBit Login", claims: ["kyc_level"], mock } };
}

export async function completeCafecaLoginAction(response: unknown): Promise<Result> {
  const { t } = await getI18n();
  const { ip } = await clientInfo();
  const fail = (key: DictKey, vars?: Record<string, string | number>) => ({ ok: false as const, error: t(key, vars) });
  try {
    const { nonce } = await consumeNonce(responseNonce(response), LOGIN_SID, "LOGIN");
    const v = await verifyCafecaResponse(response, nonce);
    const account = v.account.toLowerCase();

    const auths = await db.authentication.findMany({
      where: { provider: CAFECA_PROVIDER, uid: { equals: account, mode: "insensitive" } },
      select: { memberId: true, secret: true },
    });
    const memberIds = [...new Set(auths.map((a) => a.memberId).filter((x): x is bigint => !!x).map(String))];
    if (memberIds.length === 0) return fail("identity.err.not_bound");
    if (memberIds.length > 1) return fail("identity.err.multi_bound");

    const member = await loadMember(BigInt(memberIds[0]));
    if (!member) return fail("identity.err.not_bound");
    if (member.identityStatus === "REJECTED" || member.binding?.account.toLowerCase() !== account) return fail("identity.err.binding_rejected");
    if (member.disabled) return fail("auth.disabled");
    if (member.identityRow) {
      const minutes = lockedMinutes(member.identityRow);
      if (minutes > 0) return fail("auth.locked", { minutes });
    }
    if (!member.passwordDigest) return fail("auth.noPassword");

    await createSession("M", member.id, member.passwordDigest);
    await audit({ actorType: "MEMBER", actorId: member.id, actorName: member.email, action: "auth.login_cafeca", targetType: "member", targetId: member.id, data: { account }, ip });
    return { ok: true };
  } catch (e) {
    if (e instanceof CafecaVerifyError) {
      console.warn(`[cafeca-login] ${e.code}:`, e.message);
      const key = `identity.err.${e.code}` as DictKey;
      const text = t(key);
      return { ok: false, error: text === key ? t("identity.err.verify_failed") : text };
    }
    console.error("[cafeca-login]", e);
    return { ok: false, error: t("common.error") };
  }
}
