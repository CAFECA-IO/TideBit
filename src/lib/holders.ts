import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "./db";

type Row = Record<string, unknown>;
const D = (v: unknown) => new Prisma.Decimal((v as string | number | null) ?? 0);

export type Holder = {
  memberId: bigint;
  email: string | null;
  name: string | null;
  disabled: boolean;
  withdrawDisabled: boolean;
  balance: Prisma.Decimal;
  locked: Prisma.Decimal;
  total: Prisma.Decimal;
};

/** 單一幣種的持有者，依（可用＋凍結）由多到少排序 */
export async function currencyHolders(currencyId: bigint, p: { limit: number; offset: number; memberIds?: bigint[] }): Promise<Holder[]> {
  if (p.memberIds && p.memberIds.length === 0) return [];
  const rows = await db.$queryRaw<Row[]>`
    SELECT a.member_id,
           SUM(COALESCE(a.balance, 0)) AS balance,
           SUM(COALESCE(a.locked, 0)) AS locked,
           SUM(COALESCE(a.balance, 0) + COALESCE(a.locked, 0)) AS total
    FROM accounts a
    WHERE a.currency = ${currencyId} AND a.member_id IS NOT NULL
      ${p.memberIds ? Prisma.sql`AND a.member_id IN (${Prisma.join(p.memberIds)})` : Prisma.empty}
    GROUP BY a.member_id
    HAVING SUM(COALESCE(a.balance, 0) + COALESCE(a.locked, 0)) <> 0
    ORDER BY total DESC, a.member_id ASC
    LIMIT ${p.limit} OFFSET ${p.offset}`;
  const ids = rows.map((r) => BigInt(r.member_id as string | number | bigint));
  const members = new Map(
    (await db.member.findMany({ where: { id: { in: ids } }, select: { id: true, email: true, nickname: true, name: true, disabled: true, disableWithdraw: true } })).map((m) => [m.id.toString(), m]),
  );
  return rows.map((r) => {
    const id = BigInt(r.member_id as string | number | bigint);
    const m = members.get(id.toString());
    return {
      memberId: id,
      email: m?.email ?? null,
      name: m?.nickname || m?.name || null,
      disabled: !!m?.disabled,
      withdrawDisabled: !!m?.disableWithdraw,
      balance: D(r.balance),
      locked: D(r.locked),
      total: D(r.total),
    };
  });
}

export async function currencyHolderStats(currencyId: bigint) {
  const [r] = await db.$queryRaw<Row[]>`
    SELECT COUNT(*) AS holders, COALESCE(SUM(t.total), 0) AS total, COALESCE(SUM(t.balance), 0) AS balance, COALESCE(SUM(t.locked), 0) AS locked,
           COUNT(*) FILTER (WHERE t.total < 0) AS negative
    FROM (
      SELECT member_id, SUM(COALESCE(balance, 0)) AS balance, SUM(COALESCE(locked, 0)) AS locked, SUM(COALESCE(balance, 0) + COALESCE(locked, 0)) AS total
      FROM accounts WHERE currency = ${currencyId} AND member_id IS NOT NULL
      GROUP BY member_id HAVING SUM(COALESCE(balance, 0) + COALESCE(locked, 0)) <> 0
    ) t`;
  return { holders: Number(r?.holders ?? 0), total: D(r?.total), balance: D(r?.balance), locked: D(r?.locked), negative: Number(r?.negative ?? 0) };
}

export type AccountCheck = {
  accountId: bigint;
  balance: Prisma.Decimal;
  locked: Prisma.Decimal;
  ledgerBalance: Prisma.Decimal;
  ledgerLocked: Prisma.Decimal;
  entries: number;
  firstAt: Date | null;
  lastAt: Date | null;
  /** 帳本加總與帳戶餘額相符 */
  ok: boolean;
};

/** 大表彙總查詢加上 statement_timeout，避免拖垮資料庫或讓頁面無限等待 */
export async function timed<T>(ms: number, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${Math.floor(ms)}`);
      return fn(tx);
    },
    { timeout: ms + 5000, maxWait: 10_000 },
  );
}

export function isTimeout(e: unknown) {
  return /statement timeout|canceling statement/i.test(String((e as Error)?.message ?? e));
}

const EPS = new Prisma.Decimal("0.00000001");

/** 帳本對帳：account_versions 的變動量加總應等於 accounts 目前的 balance / locked */
export async function reconcileAccounts(accounts: { id: bigint; balance: Prisma.Decimal | null; locked: Prisma.Decimal | null }[], ms = 15_000): Promise<AccountCheck[]> {
  if (accounts.length === 0) return [];
  const rows = await timed(ms, (tx) => tx.$queryRaw<Row[]>`
    SELECT account_id, COALESCE(SUM(balance), 0) AS balance, COALESCE(SUM(locked), 0) AS locked, COUNT(*) AS n, MIN(created_at) AS first_at, MAX(created_at) AS last_at
    FROM account_versions WHERE account_id IN (${Prisma.join(accounts.map((a) => a.id))})
    GROUP BY account_id`);
  const by = new Map(rows.map((r) => [String(r.account_id), r]));
  return accounts.map((a) => {
    const r = by.get(a.id.toString());
    const lb = D(r?.balance);
    const ll = D(r?.locked);
    const balance = D(a.balance);
    const locked = D(a.locked);
    return {
      accountId: a.id,
      balance,
      locked,
      ledgerBalance: lb,
      ledgerLocked: ll,
      entries: Number(r?.n ?? 0),
      firstAt: (r?.first_at as Date) ?? null,
      lastAt: (r?.last_at as Date) ?? null,
      ok: lb.minus(balance).abs().lte(EPS) && ll.minus(locked).abs().lte(EPS),
    };
  });
}

/** 依帳本原因彙總某會員某幣種的資金流向（變動量 = balance + locked） */
export async function flowByReason(accountIds: bigint[], ms = 15_000) {
  if (accountIds.length === 0) return [];
  const rows = await timed(ms, (tx) => tx.$queryRaw<Row[]>`
    SELECT reason, COUNT(*) AS n,
           COALESCE(SUM(COALESCE(balance, 0) + COALESCE(locked, 0)), 0) AS net,
           COALESCE(SUM(GREATEST(COALESCE(balance, 0) + COALESCE(locked, 0), 0)), 0) AS inflow,
           COALESCE(SUM(LEAST(COALESCE(balance, 0) + COALESCE(locked, 0), 0)), 0) AS outflow,
           MAX(created_at) AS last_at
    FROM account_versions WHERE account_id IN (${Prisma.join(accountIds)})
    GROUP BY reason ORDER BY reason`);
  return rows.map((r) => ({
    reason: Number(r.reason ?? -1),
    count: Number(r.n),
    net: D(r.net),
    inflow: D(r.inflow),
    outflow: D(r.outflow),
    lastAt: (r.last_at as Date) ?? null,
  }));
}
