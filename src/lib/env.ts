import "server-only";
import type { AdminRole } from "./roles";

const isProd = process.env.NODE_ENV === "production";

function required(name: string, devFallback?: string): string {
  const v = process.env[name];
  if (v) return v;
  if (!isProd && devFallback !== undefined) return devFallback;
  throw new Error(`Missing environment variable ${name}`);
}

const DEFAULT_ORIGINS = "https://legacy.tidebit-defi.com,https://tidebit.com";

/** "tidebit.com, http://localhost:3000/" → ["https://tidebit.com", "http://localhost:3000"] */
export function parseOrigins(raw: string, prod: boolean): string[] {
  const out: string[] = [];
  for (const part of raw.split(/[,\s]+/)) {
    const v = part.trim();
    if (!v) continue;
    try {
      const u = new URL(/^[a-z]+:\/\//i.test(v) ? v : `https://${v}`);
      if (!out.includes(u.origin)) out.push(u.origin);
    } catch {
      console.warn(`[env] APP_ORIGINS 格式錯誤，已略過：${v}`);
    }
  }
  if (!prod && !out.includes("http://localhost:3000")) out.push("http://localhost:3000");
  return out;
}

const ROLES: AdminRole[] = ["SUPER", "OPERATOR", "SUPPORT", "AUDITOR"];

export const env = {
  isProd,
  /**
   * 允許的網站 origin（可多個，逗號分隔；CAFECA 簽章的 domain 必須是其中之一）。
   * 未設定時預設為 legacy.tidebit-defi.com 與 tidebit.com；開發環境另外允許 http://localhost:3000。
   */
  get appOrigins(): string[] {
    return parseOrigins(process.env.APP_ORIGINS || process.env.APP_ORIGIN || DEFAULT_ORIGINS, isProd);
  },
  /** 主要網址（無法判斷目前網址時，例如寄信連結，使用第一個） */
  get appOrigin() {
    return this.appOrigins[0];
  },
  /** 簽署 session cookie 與一次性驗證資料（至少 32 字元的隨機字串） */
  get sessionSecret() {
    const s = required("SESSION_SECRET", "dev-only-session-secret-change-me-please");
    if (isProd && s.length < 32) throw new Error("SESSION_SECRET 至少需要 32 個字元");
    return s;
  },
  get cafecaWallet() {
    return required("CAFECA_WALLET_URL", "https://cafeca.io").replace(/\/$/, "");
  },
  get cafecaRpcUrl() {
    return process.env.CAFECA_RPC_URL || undefined;
  },
  /** 只在開發環境有效：不連線 CAFECA，直接以假身分完成簽署 */
  get cafecaMock() {
    return !isProd && process.env.CAFECA_MOCK === "true";
  },
  /** 正式實名需要 PRODUCTION 簽章者；CAFECA 原型期間預設不要求 */
  get requireProductionSigner() {
    return process.env.CAFECA_REQUIRE_PRODUCTION_SIGNER === "true";
  },
  /** 管理員登入是否必須以 CAFECA 完成第二因素 */
  get adminRequireCafeca() {
    const v = process.env.ADMIN_REQUIRE_CAFECA;
    return v ? v === "true" : isProd;
  },
  /** 提領需不同管理員分別「核准」與「出款」 */
  get fourEyes() {
    return process.env.WITHDRAW_FOUR_EYES !== "false";
  },
  /**
   * 管理員名單（沿用舊系統以 Email 指定角色的做法）：
   *   ADMINS="ops@tidebit.com:OPERATOR,boss@tidebit.com:SUPER"
   * 管理員以自己的 TideBit 會員帳密登入後台。
   */
  get admins(): Map<string, AdminRole> {
    const m = new Map<string, AdminRole>();
    for (const part of (process.env.ADMINS ?? "").split(",")) {
      const [email, role = "SUPPORT"] = part.trim().split(":");
      const r = role.trim().toUpperCase() as AdminRole;
      if (email && ROLES.includes(r)) m.set(email.trim().toLowerCase(), r);
    }
    return m;
  },
  /** 市場設定檔（舊系統 config/markets/markets.yml） */
  get marketsFile() {
    return process.env.MARKETS_FILE || "config/markets.yml";
  },
  /** 選填：舊系統正式環境的 coins.yml（若 accounts.currency 的 id 與 asset_bases.id 不一致時使用） */
  get coinsFile() {
    return process.env.COINS_FILE || "";
  },
  smtp: {
    get url() {
      return process.env.SMTP_URL || "";
    },
    get from() {
      return process.env.MAIL_FROM || "TideBit <no-reply@tidebit.com>";
    },
  },
};
