import "server-only";
import { readFile } from "node:fs/promises";

/**
 * OFAC SDN（美國財政部特別指定國民）名單比對：
 *  - 姓名：sdn.csv（主名）＋ alt.csv（別名），只比對個人（individual）
 *  - 加密貨幣地址：sdn.csv 備註欄的「Digital Currency Address - XBT …」
 *  - 另可用 AML_ADDRESS_LIST_URLS 加入其他地址清單（每行一個地址）
 * 名單快取在記憶體 12 小時；下載失敗時沿用舊名單。可改指向本機檔案（離線環境）。
 */
const SDN_URL = () => process.env.AML_OFAC_SDN_URL || "https://www.treasury.gov/ofac/downloads/sdn.csv";
const ALT_URL = () => process.env.AML_OFAC_ALT_URL || "https://www.treasury.gov/ofac/downloads/alt.csv";
const EXTRA_URLS = () => (process.env.AML_ADDRESS_LIST_URLS ?? "").split(/[,\s]+/).filter(Boolean);
const TTL = 12 * 3600_000;
const RETRY_AFTER = 10 * 60_000;

export type SdnEntry = { ent: number; name: string; type: string; program: string };
type NameRec = { ent: number; name: string; tokens: string[] };
type Store = {
  entries: Map<number, SdnEntry>;
  names: NameRec[];
  tokenIndex: Map<string, number[]>; // token → names 的索引
  addresses: Map<string, { ent: number | null; currency: string; source: string }>;
  loadedAt: number;
};
export type SanctionsStatus = { enabled: boolean; loadedAt: Date | null; individuals: number; names: number; addresses: number; error: string | null; sources: string[] };

const g = globalThis as unknown as { __tbSanctions?: { store: Store | null; loading: Promise<Store> | null; error: string | null; errorAt: number } };
const state = (g.__tbSanctions ??= { store: null, loading: null, error: null, errorAt: 0 });

/** 簡易 CSV 解析（支援雙引號與跳脫） */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const nil = (v: string | undefined) => {
  const s = (v ?? "").trim();
  return s === "-0-" ? "" : s;
};

/** 姓名正規化：去除重音、轉大寫、標點換空白，回傳 token（去重） */
export function nameTokens(name: string): string[] {
  const s = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ");
  return [...new Set(s.split(/\s+/).filter((t) => t.length >= 2))];
}

export function hasLatin(name: string | null | undefined) {
  return !!name && /[A-Za-z]{2,}/.test(name);
}

async function fetchText(src: string): Promise<string> {
  if (!/^https?:\/\//.test(src)) return readFile(src.replace(/^file:\/\//, ""), "utf8");
  const r = await fetch(src, { signal: AbortSignal.timeout(45_000), cache: "no-store" });
  if (!r.ok) throw new Error(`${src} HTTP ${r.status}`);
  return r.text();
}

const ADDR_RE = /Digital Currency Address - ([A-Z0-9]+)\s+([A-Za-z0-9]{20,})/g;

async function load(): Promise<Store> {
  const [sdn, alt] = await Promise.all([fetchText(SDN_URL()), fetchText(ALT_URL()).catch(() => "")]);
  const entries = new Map<number, SdnEntry>();
  const names: NameRec[] = [];
  const addresses: Store["addresses"] = new Map();
  for (const r of parseCsv(sdn)) {
    const ent = Number(r[0]);
    if (!Number.isFinite(ent) || !r[1]) continue;
    const e: SdnEntry = { ent, name: nil(r[1]), type: nil(r[2]).toLowerCase(), program: nil(r[3]) };
    entries.set(ent, e);
    if (e.type === "individual") names.push({ ent, name: e.name, tokens: nameTokens(e.name) });
    for (const m of nil(r[11]).matchAll(ADDR_RE)) addresses.set(m[2].toLowerCase(), { ent, currency: m[1], source: "OFAC SDN" });
  }
  if (entries.size < 1000) throw new Error(`OFAC SDN 名單格式異常（僅 ${entries.size} 筆）`);
  for (const r of parseCsv(alt)) {
    const ent = Number(r[0]);
    const e = entries.get(ent);
    const name = nil(r[3]);
    if (e?.type === "individual" && name) names.push({ ent, name, tokens: nameTokens(name) });
  }
  for (const url of EXTRA_URLS()) {
    try {
      for (const line of (await fetchText(url)).split(/\r?\n/)) {
        const a = line.trim();
        if (a && !a.startsWith("#") && !addresses.has(a.toLowerCase())) addresses.set(a.toLowerCase(), { ent: null, currency: "", source: url });
      }
    } catch (e) {
      console.warn("[aml] 地址清單下載失敗", url, (e as Error).message);
    }
  }
  const tokenIndex = new Map<string, number[]>();
  names.forEach((n, i) => {
    for (const t of n.tokens) {
      const arr = tokenIndex.get(t);
      if (arr) arr.push(i);
      else tokenIndex.set(t, [i]);
    }
  });
  return { entries, names, tokenIndex, addresses, loadedAt: Date.now() };
}

/** 取得名單（必要時下載）；無法取得時回傳 null，並保留錯誤訊息 */
export async function getSanctions(opts: { force?: boolean } = {}): Promise<Store | null> {
  const fresh = state.store && Date.now() - state.store.loadedAt < TTL;
  if (fresh && !opts.force) return state.store;
  if (!opts.force && state.error && Date.now() - state.errorAt < RETRY_AFTER) return state.store;
  state.loading ??= load()
    .then((s) => {
      state.store = s;
      state.error = null;
      console.info(`[aml] OFAC 名單已載入：${s.entries.size} 筆、地址 ${s.addresses.size} 個`);
      return s;
    })
    .catch((e) => {
      state.error = (e as Error).message;
      state.errorAt = Date.now();
      console.warn("[aml] OFAC 名單載入失敗：", state.error);
      throw e;
    })
    .finally(() => {
      state.loading = null;
    });
  try {
    return await state.loading;
  } catch {
    return state.store; // 沿用舊名單（若有）
  }
}

export function sanctionsStatus(enabled: boolean): SanctionsStatus {
  const s = state.store;
  return {
    enabled,
    loadedAt: s ? new Date(s.loadedAt) : null,
    individuals: s ? [...s.entries.values()].filter((e) => e.type === "individual").length : 0,
    names: s?.names.length ?? 0,
    addresses: s?.addresses.size ?? 0,
    error: state.error,
    sources: [SDN_URL(), ALT_URL(), ...EXTRA_URLS()],
  };
}

export type NameHit = { ent: number; listed: string; primary: string; program: string; strength: "exact" | "strong" };

/**
 * 姓名比對：token 完全相同 → exact；至少兩個 token 相同且一方完全包含另一方 → strong。
 * 例：「CHEN, Wei」與「Wei CHEN」為 exact。中文姓名須以護照英文名比對。
 */
export function screenName(store: Store, name: string | null | undefined): NameHit[] {
  if (!name || !hasLatin(name)) return [];
  const tokens = nameTokens(name);
  if (tokens.length < 2) return [];
  const cand = new Set<number>();
  for (const t of tokens) for (const i of store.tokenIndex.get(t) ?? []) cand.add(i);
  const hits = new Map<number, NameHit>();
  for (const i of cand) {
    const n = store.names[i];
    if (n.tokens.length < 2) continue;
    const inter = n.tokens.filter((t) => tokens.includes(t)).length;
    let strength: NameHit["strength"] | null = null;
    if (inter === n.tokens.length && inter === tokens.length) strength = "exact";
    else if (inter >= 2 && (inter === n.tokens.length || inter === tokens.length)) strength = "strong";
    if (!strength) continue;
    const e = store.entries.get(n.ent);
    const prev = hits.get(n.ent);
    if (!prev || (prev.strength === "strong" && strength === "exact")) {
      hits.set(n.ent, { ent: n.ent, listed: n.name, primary: e?.name ?? n.name, program: e?.program ?? "", strength });
    }
  }
  return [...hits.values()].sort((a, b) => (a.strength === b.strength ? 0 : a.strength === "exact" ? -1 : 1)).slice(0, 10);
}

export function screenAddress(store: Store, address: string | null | undefined) {
  if (!address) return null;
  const hit = store.addresses.get(address.trim().toLowerCase());
  if (!hit) return null;
  const e = hit.ent ? store.entries.get(hit.ent) : undefined;
  return { ...hit, name: e?.name ?? null, program: e?.program ?? null };
}
