import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { getMemberSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { currencyMap, marketCodesFor, marketOf, unknownCurrency } from "@/lib/currencies";
import { dateRange } from "@/lib/queries";
import { depositRows, ledgerRows, orderRows, tradeRows, withdrawRows } from "@/lib/history";
import { reasonKey } from "@/lib/reasons";
import { stateOf } from "@/lib/withdraw";
import { getI18n } from "@/i18n/server";
import { rateLimit } from "@/lib/ratelimit";
import type { DictKey } from "@/i18n/dict/zh-TW";

const MAX_ROWS = 50_000;

function csv(rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    // 避免 CSV 公式注入
    const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : "");
const dec = (d: Prisma.Decimal | null | undefined) => (d === null || d === undefined ? "" : new Prisma.Decimal(d).toFixed());

export async function GET(req: Request, ctx: RouteContext<"/api/export/[kind]">) {
  const s = await getMemberSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const memberId = s.member.id;
  if (!rateLimit(`export:${memberId}`, 20, 10 * 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const { kind } = await ctx.params;
  const url = new URL(req.url);
  const code = (url.searchParams.get("currency") ?? "").toLowerCase();
  const createdAt = dateRange(url.searchParams.get("from") ?? "", url.searchParams.get("to") ?? "");
  const cm = await currencyMap();
  const c = code ? cm.byCode.get(code) : undefined;
  const currency = c ? BigInt(c.id) : undefined;
  const markets = code ? marketCodesFor(code).map(BigInt) : null;
  const codeOf = (id: bigint | null) => (cm.get(id) ?? unknownCurrency(id)).code.toUpperCase();
  const { t } = await getI18n();

  let rows: (string | number | null)[][] = [];
  if (kind === "ledger") {
    const accounts = await db.account.findMany({ where: { memberId, ...(currency ? { currency } : {}) }, select: { id: true } });
    const list = await ledgerRows({ accountIds: accounts.map((a) => a.id), range: createdAt, limit: MAX_ROWS });
    rows = [
      [t("common.time"), t("common.currency"), t("history.reason"), t("assets.available"), t("assets.locked"), t("common.fee"), t("history.balanceAfter")],
      ...list.map((v) => [iso(v.createdAt), codeOf(v.currency), t(reasonKey(v.reason)), dec(v.balance), dec(v.locked), dec(v.fee), dec(v.amount)]),
    ];
  } else if (kind === "withdraws") {
    const list = await withdrawRows({ memberId, currency, range: createdAt, limit: MAX_ROWS });
    rows = [
      [t("withdraw.sn"), t("common.time"), t("common.currency"), t("common.amount"), t("common.fee"), t("common.address"), t("common.memo"), t("common.txid"), t("common.status")],
      ...list.map((w) => {
        const st = stateOf(w.aasmState);
        return [w.sn ?? String(w.id), iso(w.createdAt), codeOf(w.currency), dec(w.amount), dec(w.fee), w.fundUid, w.memo, w.txid, st === "OTHER" ? (w.aasmState ?? "") : t(`withdraw.state.${st}` as DictKey)];
      }),
    ];
  } else if (kind === "deposits") {
    const list = await depositRows({ memberId, currency, range: createdAt, limit: MAX_ROWS });
    rows = [
      [t("common.time"), t("common.currency"), t("common.amount"), t("common.fee"), t("common.txid"), t("common.status")],
      ...list.map((d) => [iso(d.createdAt), codeOf(d.currency), dec(d.amount), dec(d.fee), d.txid, d.aasmState]),
    ];
  } else if (kind === "orders") {
    const list = await orderRows({ memberId, markets, range: createdAt, limit: MAX_ROWS });
    const STATE: Record<number, string> = { 100: "wait", 200: "done", 0: "cancel" };
    rows = [
      [t("common.time"), t("history.market"), t("history.side"), t("history.ordType"), t("history.price"), t("history.volume"), t("history.filled"), t("common.status")],
      ...list.map((o) => [
        iso(o.createdAt),
        marketOf(o.currency).name,
        o.type === "OrderBid" ? "bid" : "ask",
        o.ordType,
        dec(o.price),
        dec(o.originVolume),
        new Prisma.Decimal(o.originVolume ?? 0).minus(o.volume ?? 0).toFixed(),
        STATE[Number(o.state)] ?? String(o.state),
      ]),
    ];
  } else if (kind === "trades") {
    const list = await tradeRows({ memberId, markets, range: createdAt, limit: MAX_ROWS });
    rows = [
      [t("common.time"), t("history.market"), t("history.side"), t("history.price"), t("history.volume"), t("history.total")],
      ...list.map((x) => [iso(x.createdAt), marketOf(x.currency).name, x.bidMemberId === memberId ? "bid" : "ask", dec(x.price), dec(x.volume), dec(x.funds)]),
    ];
  } else {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tidebit-${kind}${code ? "-" + code : ""}-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
