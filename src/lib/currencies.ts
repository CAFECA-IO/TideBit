import "server-only";
import fs from "node:fs";
import path from "node:path";
import { load as yamlLoad } from "js-yaml";
import { db } from "./db";
import { env } from "./env";
import { listConfigs, setConfig } from "./settings";

/** 每個幣種的提領設定（存於 system_configs：key_1 = tidebit、key_2 = withdraw、key_3 = 幣種代碼） */
export type WithdrawConfig = {
  enabled?: boolean;
  network?: string | null;
  fee?: string;
  min?: string;
  max?: string | null;
  addressPattern?: string | null;
  memoRequired?: boolean;
  memoLabel?: string | null;
  notice?: string | null;
  explorerTx?: string | null;
  explorerAddr?: string | null;
  refPriceUsd?: string | null;
  hidden?: boolean;
};

export type Currency = {
  id: number;
  code: string;
  reference: string | null;
  name: string | null;
  symbol: string | null;
  precision: number;
  viewPrecision: number;
  isCoin: boolean;
  isFiat: boolean;
  visible: boolean;
  explorerTx: string | null;
  explorerAddr: string | null;
  tokenType: string | null;
  withdrawEnabled: boolean;
  network: string | null;
  withdrawFee: string;
  withdrawMin: string;
  withdrawMax: string | null;
  addressPattern: string | null;
  memoRequired: boolean;
  memoLabel: string | null;
  withdrawNotice: string | null;
  refPriceUsd: string | null;
};

let cache: { at: number; list: Currency[] } | null = null;
const TTL = 30_000;

function tpl(s: string | null | undefined) {
  if (!s) return null;
  return s.replace(/#\{(\w+)\}/g, "{$1}");
}

export async function getCurrencies(force = false): Promise<Currency[]> {
  if (!force && cache && Date.now() - cache.at < TTL) return cache.list;
  const [bases, tokens, cfgs] = await Promise.all([
    db.assetBase.findMany({ orderBy: { id: "asc" } }),
    db.assetToken.findMany(),
    listConfigs<WithdrawConfig>("withdraw"),
  ]);
  // 幣種 id 預設取 asset_bases.id；若提供舊系統正式環境的 coins.yml（COINS_FILE），以其 id ↔ code 對應為準
  const coins = loadCoinsFile();
  const source = coins
    ? coins.map((c) => ({ ...(bases.find((b) => b.key?.toLowerCase() === c.code) ?? { key: c.code, reference: c.key ?? null, name: null, symbol: c.symbol ?? null, precision: BigInt(c.precision ?? 8), viewPrecision: null, isBlockchain: c.coin ? 1 : 0, isFiat: c.coin ? 0 : 1, explorerUrl: c.blockchain ?? null }), id: BigInt(c.id) }))
    : bases;
  const list = source
    .filter((b) => b.key)
    .map((b) => {
      const code = b.key!.toLowerCase();
      const c = cfgs.get(code) ?? {};
      const token = tokens.find((t) => t.assetKey?.toLowerCase() === code);
      const isFiat = !!b.isFiat;
      return {
        id: Number(b.id),
        code,
        reference: b.reference,
        name: b.name,
        symbol: b.symbol,
        precision: Number(b.precision ?? 8),
        viewPrecision: Number(b.viewPrecision ?? 4),
        isCoin: !isFiat,
        isFiat,
        visible: !c.hidden,
        explorerTx: c.explorerTx ?? tpl(b.explorerUrl),
        explorerAddr: c.explorerAddr ?? null,
        tokenType: token?.tokenType ?? null,
        withdrawEnabled: !!c.enabled && !isFiat,
        network: c.network ?? (token?.tokenType ? `${token.tokenType.toUpperCase()} token` : null),
        withdrawFee: c.fee ?? "0",
        withdrawMin: c.min ?? "0",
        withdrawMax: c.max ?? null,
        addressPattern: c.addressPattern ?? null,
        memoRequired: !!c.memoRequired,
        memoLabel: c.memoLabel ?? null,
        withdrawNotice: c.notice ?? null,
        refPriceUsd: c.refPriceUsd ?? null,
      } satisfies Currency;
    });
  cache = { at: Date.now(), list };
  return list;
}

type CoinRow = { id: number; code: string; key?: string; symbol?: string; coin?: boolean; precision?: number; blockchain?: string };
let coinsFile: CoinRow[] | null | undefined;
function loadCoinsFile(): CoinRow[] | null {
  if (coinsFile !== undefined) return coinsFile;
  const f = env.coinsFile;
  // 設定檔路徑由環境變數決定，不需要讓 bundler 追蹤整個專案
  const file = f ? path.resolve(/*turbopackIgnore: true*/ process.cwd(), f) : "";
  coinsFile = file && fs.existsSync(file) ? ((yamlLoad(fs.readFileSync(file, "utf8")) as CoinRow[]) ?? null) : null;
  return coinsFile;
}

export async function currencyMap() {
  const list = await getCurrencies();
  return {
    list,
    byId: new Map(list.map((c) => [c.id, c])),
    byCode: new Map(list.map((c) => [c.code, c])),
    get(id: bigint | number | null | undefined) {
      return id === null || id === undefined ? undefined : this.byId.get(Number(id));
    },
  };
}

/** 找不到 asset_bases 資料時的替代顯示 */
export function unknownCurrency(id: bigint | number | null | undefined): Currency {
  const n = Number(id ?? 0);
  return {
    id: n, code: `#${n}`, reference: null, name: null, symbol: null, precision: 8, viewPrecision: 4, isCoin: true, isFiat: false, visible: true,
    explorerTx: null, explorerAddr: null, tokenType: null, withdrawEnabled: false, network: null, withdrawFee: "0", withdrawMin: "0",
    withdrawMax: null, addressPattern: null, memoRequired: false, memoLabel: null, withdrawNotice: null, refPriceUsd: null,
  };
}

export async function saveWithdrawConfig(code: string, cfg: WithdrawConfig) {
  await setConfig("withdraw", code, cfg, `TideBit 提領設定 ${code.toUpperCase()}`);
  cache = null;
}

export async function getWithdrawConfig(code: string) {
  return (await listConfigs<WithdrawConfig>("withdraw")).get(code) ?? {};
}

// ───────────── 市場（舊系統 markets.yml） ─────────────

export type Market = { id: string; code: number; name: string; baseUnit: string; quoteUnit: string; baseFixed: number; quoteFixed: number };
let markets: Map<number, Market> | null = null;

export function getMarkets(): Map<number, Market> {
  if (markets) return markets;
  markets = new Map();
  const file = path.resolve(/*turbopackIgnore: true*/ process.cwd(), env.marketsFile);
  if (!fs.existsSync(file)) {
    console.warn(`[markets] 找不到 ${file}，委託與成交將只顯示市場代碼`);
    return markets;
  }
  type Row = { id: string; code: number; name?: string; base_unit: string; quote_unit: string; bid?: { fixed?: number }; ask?: { fixed?: number } };
  for (const m of (yamlLoad(fs.readFileSync(file, "utf8")) as Row[]) ?? []) {
    if (!m?.code || markets.has(Number(m.code))) continue;
    markets.set(Number(m.code), {
      id: m.id,
      code: Number(m.code),
      name: m.name ?? `${m.base_unit}/${m.quote_unit}`.toUpperCase(),
      baseUnit: m.base_unit,
      quoteUnit: m.quote_unit,
      baseFixed: m.ask?.fixed ?? 4,
      quoteFixed: m.bid?.fixed ?? 2,
    });
  }
  return markets;
}

export function marketOf(code: bigint | number | null | undefined): Market {
  const n = Number(code ?? 0);
  return getMarkets().get(n) ?? { id: String(n), code: n, name: `#${n}`, baseUnit: "", quoteUnit: "", baseFixed: 4, quoteFixed: 8 };
}

/** 與某幣種相關的市場代碼（篩選委託、成交用） */
export function marketCodesFor(code: string): number[] {
  return [...getMarkets().values()].filter((m) => m.baseUnit === code || m.quoteUnit === code).map((m) => m.code);
}
