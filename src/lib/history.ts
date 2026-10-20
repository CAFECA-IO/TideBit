import "server-only";
import { Prisma, type AccountVersion, type Deposit, type Order, type Trade, type Withdraw } from "@/generated/prisma/client";
import { db } from "./db";

/**
 * 歷史紀錄查詢（大表專用）。
 *
 * 舊資料庫的 account_versions、orders、trades 動輒數億筆，而且只有 member_id／account_id 的單欄索引。
 * 「WHERE member_id = ? ORDER BY id DESC LIMIT 20」會讓 PostgreSQL 選擇沿主鍵倒序掃描整張表，
 * 對紀錄不多的會員幾乎等於全表掃描（頁面一直轉圈）。
 * 這裡改用 ORDER BY id + 0：讓規劃器改走 member_id／account_id 索引取出該會員的資料再排序，
 * 不需要新增任何索引或變更資料表。
 */

type Range = { gte?: Date; lt?: Date } | undefined;
type Page = { limit: number; offset?: number };

const D = (v: unknown) => (v === null || v === undefined ? null : new Prisma.Decimal(v as string));
const B = (v: unknown) => (v === null || v === undefined ? null : BigInt(v as string | number | bigint));

function rangeSql(col: string, r: Range) {
  const parts: Prisma.Sql[] = [];
  if (r?.gte) parts.push(Prisma.sql`AND ${Prisma.raw(col)} >= ${r.gte}`);
  if (r?.lt) parts.push(Prisma.sql`AND ${Prisma.raw(col)} < ${r.lt}`);
  return parts.length ? Prisma.join(parts, " ") : Prisma.empty;
}

type Row = Record<string, unknown>;

export async function ledgerRows(p: { accountIds: bigint[]; range?: Range } & Page): Promise<AccountVersion[]> {
  if (p.accountIds.length === 0) return [];
  const rows = await db.$queryRaw<Row[]>`
    SELECT * FROM account_versions
    WHERE account_id IN (${Prisma.join(p.accountIds)}) ${rangeSql("created_at", p.range)}
    ORDER BY id + 0 DESC LIMIT ${p.limit} OFFSET ${p.offset ?? 0}`;
  return rows.map((r) => ({
    id: B(r.id)!,
    memberId: B(r.member_id),
    accountId: B(r.account_id),
    reason: B(r.reason),
    balance: D(r.balance),
    locked: D(r.locked),
    fee: D(r.fee),
    amount: D(r.amount),
    modifiableId: B(r.modifiable_id),
    modifiableType: (r.modifiable_type as string) ?? null,
    createdAt: (r.created_at as Date) ?? null,
    updatedAt: (r.updated_at as Date) ?? null,
    currency: B(r.currency),
    fun: B(r.fun),
  }));
}

export async function depositRows(p: { memberId: bigint; currency?: bigint; range?: Range } & Page): Promise<Deposit[]> {
  const rows = await db.$queryRaw<Row[]>`
    SELECT * FROM deposits
    WHERE member_id = ${p.memberId} ${p.currency !== undefined ? Prisma.sql`AND currency = ${p.currency}` : Prisma.empty} ${rangeSql("created_at", p.range)}
    ORDER BY id + 0 DESC LIMIT ${p.limit} OFFSET ${p.offset ?? 0}`;
  return rows.map((r) => ({
    id: B(r.id)!,
    memberId: B(r.member_id),
    currency: B(r.currency),
    amount: D(r.amount),
    fee: D(r.fee),
    fundUid: (r.fund_uid as string) ?? null,
    txid: (r.txid as string) ?? null,
    aasmState: (r.aasm_state as string) ?? null,
    createdAt: (r.created_at as Date) ?? null,
    doneAt: (r.done_at as Date) ?? null,
    type: (r.type as string) ?? null,
  }));
}

export async function withdrawRows(p: { memberId: bigint; currency?: bigint; range?: Range } & Page): Promise<Withdraw[]> {
  const rows = await db.$queryRaw<Row[]>`
    SELECT * FROM withdraws
    WHERE member_id = ${p.memberId} ${p.currency !== undefined ? Prisma.sql`AND currency = ${p.currency}` : Prisma.empty} ${rangeSql("created_at", p.range)}
    ORDER BY id + 0 DESC LIMIT ${p.limit} OFFSET ${p.offset ?? 0}`;
  return rows.map((r) => ({
    id: B(r.id)!,
    memberId: B(r.member_id),
    sn: (r.sn as string) ?? null,
    amount: D(r.amount),
    accountId: B(r.account_id),
    fee: D(r.fee),
    feeAccountId: B(r.fee_account_id),
    fundUid: (r.fund_uid as string) ?? null,
    fundExtra: (r.fund_extra as string) ?? null,
    createdAt: (r.created_at as Date) ?? null,
    updatedAt: (r.updated_at as Date) ?? null,
    doneAt: (r.done_at as Date) ?? null,
    txid: (r.txid as string) ?? null,
    aasmState: (r.aasm_state as string) ?? null,
    sum: D(r.sum) ?? new Prisma.Decimal(0),
    type: (r.type as string) ?? null,
    memo: (r.memo as string) ?? null,
    currency: B(r.currency),
    destinationTag: B(r.destination_tag),
  }));
}

export async function orderRows(p: { memberId: bigint; markets?: bigint[] | null; range?: Range } & Page): Promise<Order[]> {
  if (p.markets && p.markets.length === 0) return [];
  const rows = await db.$queryRaw<Row[]>`
    SELECT id, bid, ask, currency, price, volume, origin_volume, state, done_at, type, member_id, created_at, ord_type, funds_received
    FROM orders
    WHERE member_id = ${p.memberId} ${p.markets ? Prisma.sql`AND currency IN (${Prisma.join(p.markets)})` : Prisma.empty} ${rangeSql("created_at", p.range)}
    ORDER BY id + 0 DESC LIMIT ${p.limit} OFFSET ${p.offset ?? 0}`;
  return rows.map((r) => ({
    id: B(r.id)!,
    bid: B(r.bid),
    ask: B(r.ask),
    currency: B(r.currency),
    price: D(r.price),
    volume: D(r.volume),
    originVolume: D(r.origin_volume),
    state: B(r.state),
    doneAt: (r.done_at as Date) ?? null,
    type: (r.type as string) ?? null,
    memberId: B(r.member_id),
    createdAt: (r.created_at as Date) ?? null,
    ordType: (r.ord_type as string) ?? null,
    fundsReceived: D(r.funds_received),
  }));
}

/** 成交：買方、賣方分別走各自的索引，再合併排序 */
export async function tradeRows(p: { memberId: bigint; markets?: bigint[] | null; range?: Range } & Page): Promise<Trade[]> {
  if (p.markets && p.markets.length === 0) return [];
  const n = p.limit + (p.offset ?? 0);
  const m = p.markets ? Prisma.sql`AND currency IN (${Prisma.join(p.markets)})` : Prisma.empty;
  const rows = await db.$queryRaw<Row[]>`
    SELECT * FROM (
      (SELECT id, price, volume, ask_id, bid_id, currency, created_at, ask_member_id, bid_member_id, funds FROM trades
        WHERE ask_member_id = ${p.memberId} ${m} ${rangeSql("created_at", p.range)} ORDER BY id + 0 DESC LIMIT ${n})
      UNION
      (SELECT id, price, volume, ask_id, bid_id, currency, created_at, ask_member_id, bid_member_id, funds FROM trades
        WHERE bid_member_id = ${p.memberId} ${m} ${rangeSql("created_at", p.range)} ORDER BY id + 0 DESC LIMIT ${n})
    ) t
    ORDER BY id DESC LIMIT ${p.limit} OFFSET ${p.offset ?? 0}`;
  return rows.map((r) => ({
    id: B(r.id)!,
    price: D(r.price),
    volume: D(r.volume),
    askId: B(r.ask_id),
    bidId: B(r.bid_id),
    currency: B(r.currency),
    createdAt: (r.created_at as Date) ?? null,
    askMemberId: B(r.ask_member_id),
    bidMemberId: B(r.bid_member_id),
    funds: D(r.funds),
  }));
}
