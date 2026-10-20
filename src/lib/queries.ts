import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { currencyMap, unknownCurrency } from "./currencies";

export type Holding = {
  code: string;
  name: string | null;
  isCoin: boolean;
  isFiat: boolean;
  precision: number;
  viewPrecision: number;
  balance: string;
  locked: string;
  total: string;
  withdrawEnabled: boolean;
  network: string | null;
  refPriceUsd: string | null;
  valueUsd: string | null;
};

export async function getHoldings(memberId: bigint, opts: { includeZero?: boolean } = {}): Promise<Holding[]> {
  const [rows, cm] = await Promise.all([
    db.account.findMany({ where: { memberId, ...(opts.includeZero ? {} : { OR: [{ balance: { gt: 0 } }, { locked: { gt: 0 } }] }) } }),
    currencyMap(),
  ]);
  // 舊資料可能有同幣種多個帳戶，合併顯示
  const merged = new Map<number, { balance: Prisma.Decimal; locked: Prisma.Decimal }>();
  for (const r of rows) {
    const k = Number(r.currency);
    const m = merged.get(k) ?? { balance: new Prisma.Decimal(0), locked: new Prisma.Decimal(0) };
    m.balance = m.balance.plus(r.balance ?? 0);
    m.locked = m.locked.plus(r.locked ?? 0);
    merged.set(k, m);
  }
  return [...merged.entries()]
    .map(([id, v]) => {
      const c = cm.get(id) ?? unknownCurrency(id);
      const total = v.balance.plus(v.locked);
      const price = c.refPriceUsd ? new Prisma.Decimal(c.refPriceUsd) : null;
      return {
        h: {
          code: c.code,
          name: c.name,
          isCoin: c.isCoin,
          isFiat: c.isFiat,
          precision: c.precision,
          viewPrecision: c.viewPrecision,
          balance: v.balance.toFixed(),
          locked: v.locked.toFixed(),
          total: total.toFixed(),
          withdrawEnabled: c.withdrawEnabled,
          network: c.network,
          refPriceUsd: price?.toFixed() ?? null,
          valueUsd: price ? total.times(price).toFixed(2) : null,
        } satisfies Holding,
        visible: c.visible || !total.isZero(),
        id,
      };
    })
    .filter((x) => x.visible)
    .sort((a, b) => Number(b.h.valueUsd ?? 0) - Number(a.h.valueUsd ?? 0) || Number(b.h.total) - Number(a.h.total) || a.id - b.id)
    .map((x) => x.h);
}

export function sumUsd(h: Holding[]): string | null {
  const priced = h.filter((x) => x.valueUsd !== null);
  if (priced.length === 0) return null;
  return priced.reduce((acc, x) => acc.plus(x.valueUsd!), new Prisma.Decimal(0)).toFixed(2);
}

export const PAGE_SIZE = 20;

export function pageOf(sp: Record<string, string | string[] | undefined>) {
  const p = Number(Array.isArray(sp.page) ? sp.page[0] : sp.page);
  return Number.isFinite(p) && p >= 1 ? Math.floor(p) : 1;
}

export function str(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/** 路由參數轉 BigInt（非數字時回傳 -1，查不到資料） */
export function idParam(v: string) {
  return /^\d{1,18}$/.test(v) ? BigInt(v) : -1n;
}

/** 日期篩選（以台北時間的日期為準；資料庫時間為 UTC） */
export function dateRange(from: string, to: string) {
  const r: { gte?: Date; lt?: Date } = {};
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) r.gte = new Date(`${from}T00:00:00+08:00`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) r.lt = new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 86400_000);
  return r.gte || r.lt ? r : undefined;
}
