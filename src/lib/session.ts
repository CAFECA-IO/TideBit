import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { env } from "./env";

/**
 * 無狀態 session：資料庫沒有 session 表，因此以 HMAC 簽章的 cookie 保存登入狀態。
 * - fp 為密碼雜湊的指紋：變更／重設密碼後，所有舊 session 立即失效
 * - sid 為隨機值，用來把 CAFECA nonce 綁定到這個瀏覽器 session
 */
export const MEMBER_COOKIE = "tb_sid";
export const ADMIN_COOKIE = "tb_admin";
const MEMBER_TTL = 12 * 3600; // 秒
const ADMIN_TTL = 8 * 3600;

export type SessionPayload = { k: "M" | "A"; id: string; sid: string; fp: string; v: boolean; iat: number; exp: number };

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

function hmac(data: string) {
  return createHmac("sha256", env.sessionSecret).update(data).digest("base64url");
}

export function sign(obj: unknown): string {
  const body = Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${body}.${hmac(body)}`;
}

export function unsign<T>(token: string | undefined | null): T | null {
  if (!token) return null;
  const i = token.lastIndexOf(".");
  if (i < 1) return null;
  const body = token.slice(0, i);
  const sig = Buffer.from(token.slice(i + 1));
  const expect = Buffer.from(hmac(body));
  if (sig.length !== expect.length || !timingSafeEqual(sig, expect)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString()) as T;
  } catch {
    return null;
  }
}

/** 密碼雜湊指紋（不外洩雜湊本身） */
export function passwordFingerprint(digest: string | null | undefined) {
  return hmac("pw:" + (digest ?? "")).slice(0, 16);
}

export async function clientInfo() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim() || null;
  return { ip, userAgent: h.get("user-agent")?.slice(0, 300) ?? null };
}

/**
 * 依「這次請求」是否為 HTTPS 決定 cookie 的 Secure 屬性：
 * 正式環境走 HTTPS（反向代理會帶 x-forwarded-proto），本機以 http://localhost 執行 npm start 時仍能登入
 * （Safari 等瀏覽器不會在 http 頁面保存 Secure cookie，導致登入後立刻被導回登入頁）。
 */
export async function isHttpsRequest() {
  const h = await headers();
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim();
  if (proto) return proto === "https";
  const origin = h.get("origin") ?? h.get("referer") ?? "";
  return origin.startsWith("https://");
}

export async function cookieOptions(maxAge: number) {
  return { httpOnly: true, secure: await isHttpsRequest(), sameSite: "lax" as const, path: "/", maxAge };
}

async function setCookie(name: string, value: string, ttl: number) {
  (await cookies()).set(name, value, await cookieOptions(ttl));
}

export async function createSession(kind: "M" | "A", id: bigint, passwordDigest: string | null, verified = true) {
  const now = Math.floor(Date.now() / 1000);
  const ttl = kind === "M" ? MEMBER_TTL : ADMIN_TTL;
  const p: SessionPayload = { k: kind, id: id.toString(), sid: randomToken(12), fp: passwordFingerprint(passwordDigest), v: verified, iat: now, exp: now + ttl };
  await setCookie(kind === "M" ? MEMBER_COOKIE : ADMIN_COOKIE, sign(p), ttl);
  return p;
}

export async function readSession(kind: "M" | "A"): Promise<SessionPayload | null> {
  const p = unsign<SessionPayload>((await cookies()).get(kind === "M" ? MEMBER_COOKIE : ADMIN_COOKIE)?.value);
  if (!p || p.k !== kind || p.exp < Math.floor(Date.now() / 1000)) return null;
  return p;
}

export async function destroySession(kind: "M" | "A") {
  (await cookies()).delete(kind === "M" ? MEMBER_COOKIE : ADMIN_COOKIE);
}

/** 目前請求的 origin（依 x-forwarded-host／host 與通訊協定） */
export async function requestOrigin(): Promise<string | null> {
  try {
    const h = await headers();
    const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim().toLowerCase();
    if (!host) return null;
    const proto = (await isHttpsRequest()) ? "https" : h.get("x-forwarded-proto") ? "http" : process.env.NODE_ENV === "production" ? "https" : "http";
    return new URL(`${proto}://${host}`).origin;
  } catch {
    return null; // 不在請求範圍內（例如背景工作）
  }
}

/** 寄信連結等使用的網址：目前網址若在允許清單內就沿用，否則用主要網址 */
export async function siteOrigin(): Promise<string> {
  const o = await requestOrigin();
  return o && env.appOrigins.includes(o) ? o : env.appOrigin;
}
