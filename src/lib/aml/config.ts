import "server-only";
import { randomBytes } from "node:crypto";
import { getConfig, setConfig } from "../settings";

/**
 * 洗錢防制設定與內部黑名單，存於既有 system_configs（key_1 = "tidebit", key_2 = "aml"）。
 */
export type AmlSettings = {
  /** FATF 高風險（Call for Action）及需加強審查的國家，ISO 3166-1 alpha-2 */
  highRiskCountries: string[];
  /** FATF 加強監控名單（灰名單） */
  monitoredCountries: string[];
  /** 單筆提領超過此 USD 估值時需加強審查（需設定幣種參考價格） */
  largeWithdrawUsd: number;
  /** 24 小時內提領申請超過此筆數視為異常頻繁 */
  velocity24h: number;
  /** 入金後多少小時內即提領視為快進快出 */
  quickTurnaroundHours: number;
  /** 密碼重設、CAFECA 綁定後多少小時內提領需注意帳號被盜 */
  recentChangeHours: number;
  /** 非交易來源（人工調整、贈送、其他）占持有量的比例超過此值需注意（0–1） */
  nonTradeShare: number;
  /** 是否下載 OFAC SDN 名單比對 */
  ofacEnabled: boolean;
};

// FATF 2026 年 6 月公布：高風險為伊朗、北韓（緬甸需加強審查）；灰名單 22 國。名單每年 2、6、10 月更新，請定期在後台調整。
export const DEFAULT_AML: AmlSettings = {
  highRiskCountries: ["KP", "IR", "MM"],
  monitoredCountries: ["AO", "BO", "BA", "BG", "CM", "CI", "CD", "HT", "IQ", "KE", "KW", "LA", "LB", "MC", "NP", "PG", "SS", "SY", "VE", "VN", "VG", "YE"],
  largeWithdrawUsd: 10_000,
  velocity24h: 3,
  quickTurnaroundHours: 72,
  recentChangeHours: 72,
  nonTradeShare: 0.2,
  ofacEnabled: true,
};

export async function getAmlSettings(): Promise<AmlSettings> {
  return { ...DEFAULT_AML, ...((await getConfig<Partial<AmlSettings>>("aml", "settings")) ?? {}) };
}

export async function saveAmlSettings(s: AmlSettings) {
  await setConfig("aml", "settings", s, "TideBit 洗錢防制參數");
}

// ───────────── 內部黑名單 ─────────────

export type BlacklistType = "address" | "member" | "email" | "name" | "cafeca";
export const BLACKLIST_LABEL: Record<BlacklistType, string> = { address: "收款地址", member: "會員 ID", email: "Email", name: "姓名", cafeca: "CAFECA 身分" };
export type BlacklistEntry = { id: string; type: BlacklistType; value: string; reason: string; by: string; at: number };

export function normalizeEntry(type: BlacklistType, value: string) {
  const v = value.trim();
  if (type === "name") return v.normalize("NFKC").replace(/\s+/g, " ").toUpperCase();
  if (type === "member") return v.replace(/^#/, "");
  return v.toLowerCase();
}

export async function getBlacklist(): Promise<BlacklistEntry[]> {
  return (await getConfig<BlacklistEntry[]>("aml", "blacklist")) ?? [];
}

export async function addBlacklist(e: Omit<BlacklistEntry, "id" | "at">) {
  const list = await getBlacklist();
  const value = normalizeEntry(e.type, e.value);
  if (list.some((x) => x.type === e.type && x.value === value)) return false;
  list.push({ ...e, value, id: randomBytes(6).toString("hex"), at: Date.now() });
  await setConfig("aml", "blacklist", list, "TideBit 洗錢防制內部黑名單");
  return true;
}

export async function removeBlacklist(id: string) {
  const list = await getBlacklist();
  const hit = list.find((x) => x.id === id);
  if (!hit) return null;
  await setConfig("aml", "blacklist", list.filter((x) => x.id !== id), "TideBit 洗錢防制內部黑名單");
  return hit;
}

/** 回傳命中的黑名單項目 */
export function matchBlacklist(list: BlacklistEntry[], q: Partial<Record<BlacklistType, (string | null | undefined)[]>>) {
  const hits: BlacklistEntry[] = [];
  for (const e of list) {
    const values = (q[e.type] ?? []).filter((v): v is string => !!v).map((v) => normalizeEntry(e.type, v));
    if (values.includes(e.value)) hits.push(e);
  }
  return hits;
}

/** 國家欄位正規化為 alpha-2（舊資料可能存國名） */
const COUNTRY_NAMES: Record<string, string> = {
  "NORTH KOREA": "KP", "KOREA, NORTH": "KP", "DPRK": "KP", "IRAN": "IR", "MYANMAR": "MM", "BURMA": "MM",
  "ANGOLA": "AO", "BOLIVIA": "BO", "BOSNIA AND HERZEGOVINA": "BA", "BULGARIA": "BG", "CAMEROON": "CM",
  "COTE D'IVOIRE": "CI", "CÔTE D'IVOIRE": "CI", "IVORY COAST": "CI", "CONGO, DEMOCRATIC REPUBLIC": "CD", "DEMOCRATIC REPUBLIC OF THE CONGO": "CD",
  "HAITI": "HT", "IRAQ": "IQ", "KENYA": "KE", "KUWAIT": "KW", "LAOS": "LA", "LAO PDR": "LA", "LEBANON": "LB", "MONACO": "MC",
  "NEPAL": "NP", "PAPUA NEW GUINEA": "PG", "SOUTH SUDAN": "SS", "SYRIA": "SY", "VENEZUELA": "VE", "VIETNAM": "VN", "VIET NAM": "VN",
  "BRITISH VIRGIN ISLANDS": "VG", "VIRGIN ISLANDS (UK)": "VG", "YEMEN": "YE",
  "TAIWAN": "TW", "HONG KONG": "HK", "CHINA": "CN", "JAPAN": "JP", "KOREA": "KR", "SOUTH KOREA": "KR", "UNITED STATES": "US", "USA": "US",
};

export function countryCode(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(s)) return s;
  if (/^[A-Z]{3}$/.test(s)) return { PRK: "KP", IRN: "IR", MMR: "MM", TWN: "TW", HKG: "HK", CHN: "CN", USA: "US" }[s] ?? null;
  return COUNTRY_NAMES[s] ?? null;
}
