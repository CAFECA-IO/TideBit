import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "../env";
import { cookieOptions, requestOrigin, sign, unsign } from "../session";
import { createCafecaVerifier, type SignInResponse, type VerifiedSignIn } from "./verify";

/**
 * Sign in with CAFECA 的一次性 nonce。
 * 資料庫沒有 nonce 表，因此把 nonce 與待確認的資料（例如提領草稿）簽章後放在 httpOnly cookie，
 * 綁定目前的瀏覽器 session（sid），驗證前即刪除，只能使用一次。
 */
export type NoncePurpose = "BIND" | "WITHDRAW" | "ADMIN_LOGIN" | "LOGIN";
const NONCE_COOKIE = "tb_cafeca";
const NONCE_TTL = 5 * 60; // 秒

type NonceToken = { n: string; p: NoncePurpose; sid: string; exp: number; d?: unknown };

let verifier: ReturnType<typeof createCafecaVerifier> | null = null;
function getVerifier() {
  return (verifier ??= createCafecaVerifier({ wallet: env.cafecaWallet, rpcUrl: env.cafecaRpcUrl }));
}

// 同一個 nonce 在本機程序內也只接受一次（多台部署時 cookie 刪除仍可防止重送）
const used = new Map<string, number>();
function markUsed(n: string) {
  const now = Date.now();
  for (const [k, v] of used) if (v < now) used.delete(k);
  if (used.has(n)) return false;
  used.set(n, now + NONCE_TTL * 1000);
  return true;
}

export async function issueNonce(p: { purpose: NoncePurpose; sid: string; payload?: unknown }) {
  const nonce = randomBytes(16).toString("base64url");
  const t: NonceToken = { n: nonce, p: p.purpose, sid: p.sid, exp: Math.floor(Date.now() / 1000) + NONCE_TTL, d: p.payload };
  (await cookies()).set(NONCE_COOKIE, sign(t), await cookieOptions(NONCE_TTL));
  return { nonce };
}

export class CafecaVerifyError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
  }
}

/** 取出並作廢 nonce；回傳當初保存的資料 */
export async function consumeNonce<T = unknown>(nonce: string | undefined, sid: string, purpose: NoncePurpose): Promise<{ nonce: string; payload: T | undefined }> {
  const jar = await cookies();
  const t = unsign<NonceToken>(jar.get(NONCE_COOKIE)?.value);
  jar.delete(NONCE_COOKIE);
  if (!nonce || !t || t.n !== nonce || t.sid !== sid || t.p !== purpose) throw new CafecaVerifyError("invalid_nonce");
  if (!markUsed(nonce)) throw new CafecaVerifyError("nonce_used");
  if (t.exp < Math.floor(Date.now() / 1000)) throw new CafecaVerifyError("nonce_expired");
  return { nonce, payload: t.d as T | undefined };
}

export function responseNonce(res: unknown): string | undefined {
  const r = res as { message?: { nonce?: unknown }; nonce?: unknown } | null;
  const n = r?.message?.nonce ?? r?.nonce;
  return typeof n === "string" ? n : undefined;
}

type MockResponse = { mock: true; account: string; message: { nonce: string }; claims?: Record<string, unknown> };

/** 驗證錢包交回的登入結果；開發模式（CAFECA_MOCK=true）下接受假回應 */
export async function verifyCafecaResponse(response: unknown, nonce: string): Promise<VerifiedSignIn> {
  const r = response as Partial<SignInResponse> & { error?: string; mock?: boolean };
  if (!r || typeof r !== "object") throw new CafecaVerifyError("invalid_response");
  if (r.error) throw new CafecaVerifyError(r.error);

  if (env.cafecaMock && r.mock) {
    const m = response as MockResponse;
    const claims = m.claims ?? {};
    const level = Number(claims.kyc_level ?? 2);
    return {
      account: m.account as `0x${string}`,
      claims: {
        kyc_level: level,
        legal_name: (claims.legal_name as string) ?? null,
        doc_type: "national_id",
        nationality: "TW",
        pairwise_id: ("0x" + createHash("sha256").update(m.account).digest("hex")) as `0x${string}`,
        kyc: {
          subjectType: "person", level, effectiveLevel: level, status: "active",
          expiry: Math.floor(Date.now() / 1000) + 365 * 86400, jurisdiction: "TW", nonce: "1",
          signer: "0x0000000000000000000000000000000000000000", signerClass: "prototype",
        },
      },
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    };
  }

  // 使用者簽署的 domain 是瀏覽器當時網址的 origin：必須在 APP_ORIGINS 允許清單內，且與本次請求的網址相同
  const raw = (r as { message?: { domain?: unknown } }).message?.domain;
  let signed: string | null = null;
  try {
    signed = typeof raw === "string" ? new URL(raw).origin : null;
  } catch {
    /* 格式錯誤 */
  }
  const allowed = env.appOrigins;
  const current = await requestOrigin();
  if (!signed || !allowed.includes(signed) || (current && allowed.includes(current) && current !== signed)) {
    throw new CafecaVerifyError("domain_mismatch", `允許網址=${allowed.join(", ")}，簽署網址=${String(raw)}${current ? `，目前網址=${current}` : ""}`);
  }
  try {
    return await getVerifier().verify(r as SignInResponse, { domain: raw as string, nonce });
  } catch (e) {
    throw new CafecaVerifyError("verify_failed", (e as Error).message);
  }
}
