import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { currencyMap, unknownCurrency } from "./currencies";
import { fmtAmount, normalizeName } from "./format";
import { flowByReason, isTimeout, reconcileAccounts } from "./holders";
import { CAFECA_PROVIDER, legacyName, loadMember } from "./members";
import { REASON } from "./reasons";
import { AUDIT_ITEM_TYPE } from "./notify";
import { stateOf } from "./withdraw";
import { BLACKLIST_LABEL, countryCode, getAmlSettings, getBlacklist, matchBlacklist } from "./aml/config";
import { getSanctions, hasLatin, screenAddress, screenName } from "./aml/sanctions";

/**
 * 提領風險與洗錢防制分析（只讀取資料，不改變任何狀態）。
 * 結果僅供審核參考，最終是否放行由管理員判斷並留下紀錄。
 */
export type CheckStatus = "fail" | "warn" | "ok" | "info";
export type RiskCheck = {
  key: string;
  group: "制裁與黑名單" | "身分" | "帳務" | "交易行為" | "收款地址";
  status: CheckStatus;
  title: string;
  detail?: string;
  links?: { href: string; label: string }[];
};
export type Verdict = "PASS" | "REVIEW" | "BLOCK";
export type RiskReport = { withdrawId: string; verdict: Verdict; score: number; checks: RiskCheck[]; analyzedAt: number; ms: number };

const H = 3600_000;
const ZERO = new Prisma.Decimal(0);
const dec = (v: Prisma.Decimal | number | string | null | undefined) => new Prisma.Decimal(v ?? 0);

// 交易相關帳本原因（掛單、成交、撤單）
const TRADE_REASONS = new Set<number>([REASON.STRIKE_FEE, REASON.STRIKE_ADD, REASON.STRIKE_SUB, REASON.STRIKE_UNLOCK, REASON.ORDER_SUBMIT, REASON.ORDER_CANCEL, REASON.ORDER_FULLFILLED]);
const WITHDRAW_REASONS = new Set<number>([800, 810, 820, 830, 840, 850, 2000, 2001]);
const DEPOSIT_REASONS = new Set<number>([REASON.DEPOSIT]);

// 同一筆提領的分析結果快取 5 分鐘（頁面與核准動作共用）
const cache = ((globalThis as unknown as { __tbRisk?: Map<string, RiskReport> }).__tbRisk ??= new Map());

export function verdictOf(checks: RiskCheck[]): { verdict: Verdict; score: number } {
  const fails = checks.filter((c) => c.status === "fail").length;
  const warns = checks.filter((c) => c.status === "warn").length;
  return { verdict: fails ? "BLOCK" : warns ? "REVIEW" : "PASS", score: Math.min(100, fails * 40 + warns * 10) };
}

export async function analyzeWithdraw(id: bigint, opts: { fresh?: boolean } = {}): Promise<RiskReport | null> {
  const key = id.toString();
  const hit = cache.get(key);
  if (hit && !opts.fresh && Date.now() - hit.analyzedAt < 5 * 60_000) return hit;
  const started = Date.now();

  const w = await db.withdraw.findUnique({ where: { id } });
  if (!w?.memberId) return null;
  const memberId = w.memberId;
  const [m, cm, aml, blacklist] = await Promise.all([loadMember(memberId), currencyMap(), getAmlSettings(), getBlacklist()]);
  if (!m) return null;
  const c = cm.get(w.currency) ?? unknownCurrency(w.currency);
  const up = c.code.toUpperCase();
  const at = w.createdAt ?? new Date();
  const b = m.binding;
  const checks: RiskCheck[] = [];
  const add = (x: RiskCheck) => checks.push(x);
  const memberLink = (mid: bigint | string, label?: string) => ({ href: `/admin/members/${mid}`, label: label ?? `#${mid}` });

  const sanctionsP = aml.ofacEnabled ? getSanctions() : Promise.resolve(null);
  const accountsP = db.account.findMany({ where: { memberId } });

  // ───── 制裁名單與黑名單 ─────
  const names = [...new Set([b?.legalName, m.legacyIdName, m.name, m.nickname].filter((x): x is string => !!x?.trim()))];
  const bl = matchBlacklist(blacklist, {
    address: [w.fundUid],
    member: [m.id.toString()],
    email: [m.email],
    name: names,
    cafeca: [b?.account, b?.pairwiseId],
  });
  const blAddr = bl.filter((e) => e.type === "address");
  const blPerson = bl.filter((e) => e.type !== "address");
  add({
    key: "blacklist_address",
    group: "制裁與黑名單",
    status: blAddr.length ? "fail" : "ok",
    title: blAddr.length ? "收款地址在內部黑名單" : "收款地址不在內部黑名單",
    detail: blAddr.map((e) => `${e.reason}（${e.by}）`).join("；") || undefined,
  });
  add({
    key: "blacklist_member",
    group: "制裁與黑名單",
    status: blPerson.length ? "fail" : "ok",
    title: blPerson.length ? "會員命中內部黑名單" : "會員不在內部黑名單",
    detail: blPerson.map((e) => `${BLACKLIST_LABEL[e.type]}「${e.value}」：${e.reason}`).join("；") || undefined,
  });

  const sanctions = await sanctionsP;
  if (!aml.ofacEnabled) {
    add({ key: "ofac", group: "制裁與黑名單", status: "info", title: "未啟用 OFAC 制裁名單比對", detail: "可在「洗錢防制」設定開啟" });
  } else if (!sanctions) {
    add({ key: "ofac", group: "制裁與黑名單", status: "warn", title: "OFAC 制裁名單無法載入，未完成比對", detail: "請確認伺服器可連線 treasury.gov，或以 AML_OFAC_SDN_URL 指向本機檔案" });
  } else {
    const ah = screenAddress(sanctions, w.fundUid);
    add({
      key: "ofac_address",
      group: "制裁與黑名單",
      status: ah ? "fail" : "ok",
      title: ah ? "收款地址列於 OFAC 制裁名單" : "收款地址未列於 OFAC 制裁名單",
      detail: ah ? `${ah.name ?? ah.source}${ah.program ? `（${ah.program}）` : ""} · ${ah.currency}` : `已比對 ${sanctions.addresses.size.toLocaleString()} 個制裁地址`,
    });
    const latin = names.filter(hasLatin);
    const nh = latin.flatMap((n) => screenName(sanctions, n).map((h) => ({ ...h, query: n })));
    const exact = nh.filter((h) => h.strength === "exact");
    add({
      key: "ofac_name",
      group: "制裁與黑名單",
      status: exact.length ? "fail" : nh.length ? "warn" : latin.length ? "ok" : "info",
      title: exact.length
        ? "姓名與 OFAC 制裁對象完全相符"
        : nh.length
          ? "姓名與 OFAC 制裁對象部分相符，請人工比對出生日期與國籍"
          : latin.length
            ? "姓名未命中 OFAC 制裁對象"
            : "姓名為非拉丁字元，無法比對 OFAC（名單為英文拼音）",
      detail: nh.length
        ? nh
            .slice(0, 5)
            .map((h) => `「${h.query}」≈ ${h.listed}${h.listed !== h.primary ? `（別名，主名 ${h.primary}）` : ""} · ${h.program} · SDN #${h.ent}`)
            .join("\n")
        : latin.length
          ? `比對：${latin.join("、")}`
          : `可比對舊系統的護照英文姓名；目前姓名：${names.join("、") || "—"}`,
      links: nh.length ? [{ href: `https://sanctionssearch.ofac.treas.gov/Details.aspx?id=${nh[0].ent}`, label: "OFAC 查詢" }] : undefined,
    });
  }

  // ───── 身分 ─────
  const nationality = countryCode(b?.nationality);
  const legacyCountry = countryCode(m.legacyCountry);
  const countries = [...new Set([nationality, legacyCountry].filter((x): x is string => !!x))];
  const high = countries.filter((x) => aml.highRiskCountries.includes(x));
  const monitored = countries.filter((x) => aml.monitoredCountries.includes(x));
  add({
    key: "jurisdiction",
    group: "身分",
    status: high.length ? "fail" : monitored.length ? "warn" : countries.length ? "ok" : "info",
    title: high.length ? `國籍／地區屬 FATF 高風險：${high.join("、")}` : monitored.length ? `國籍／地區屬 FATF 加強監控：${monitored.join("、")}` : countries.length ? "國籍／地區非 FATF 高風險或監控名單" : "無國籍資料",
    detail: `CAFECA 國籍 ${b?.nationality ?? "—"}・舊系統國家 ${m.legacyCountry ?? "—"}`,
  });
  add({
    key: "identity",
    group: "身分",
    status: m.identityStatus === "VERIFIED" ? "ok" : "fail",
    title: m.identityStatus === "VERIFIED" ? `CAFECA 實名已驗證（L${b?.level ?? "?"}）` : "CAFECA 實名未完成驗證",
    detail: b?.signerClass ? `簽章者類別：${b.signerClass}` : undefined,
  });
  const lName = legacyName(m);
  const nameOk = !!b?.legalName && !!lName && normalizeName(b.legalName) === normalizeName(lName);
  const flags = (b?.flags ?? []).filter((f) => f !== "MANUAL_REVIEW");
  add({
    key: "name_match",
    group: "身分",
    status: nameOk ? "ok" : "warn",
    title: nameOk ? "CAFECA 證件姓名與舊系統姓名一致" : "CAFECA 證件姓名與舊系統姓名不一致或缺漏",
    detail: `CAFECA「${b?.legalName ?? "—"}」／舊系統「${lName ?? "—"}」${flags.length ? `・旗標 ${flags.join(", ")}` : ""}`,
  });
  // 同一 CAFECA 身分綁定多個帳號
  if (b) {
    const others = await db.authentication.findMany({
      where: { provider: CAFECA_PROVIDER, memberId: { not: memberId }, OR: [{ uid: { equals: b.account, mode: "insensitive" } }, ...(b.pairwiseId ? [{ token: b.pairwiseId }] : [])] },
      select: { memberId: true },
      take: 10,
    });
    const ids = [...new Set(others.map((o) => o.memberId).filter((x): x is bigint => !!x))];
    add({
      key: "duplicate_identity",
      group: "身分",
      status: ids.length ? "warn" : "ok",
      title: ids.length ? `同一 CAFECA 身分也綁定了 ${ids.length} 個其他帳號` : "CAFECA 身分只綁定此帳號",
      links: ids.map((x) => memberLink(x)),
    });
  }
  add({
    key: "account_status",
    group: "身分",
    status: m.disabled || m.withdrawDisabled ? "fail" : "ok",
    title: m.disabled ? "帳號已停權" : m.withdrawDisabled ? "帳號被設定禁止提領" : "帳號狀態正常",
  });

  // 簽署者
  const signed = await db.version.findFirst({ where: { itemType: AUDIT_ITEM_TYPE, itemId: w.id, event: "withdraw.create" }, orderBy: { id: "desc" } });
  let signer: string | null = null;
  let createIp: string | null = null;
  try {
    const o = JSON.parse(signed?.object ?? "{}") as { ip?: string; data?: { cafecaAccount?: string } };
    signer = o.data?.cafecaAccount ?? null;
    createIp = o.ip ?? null;
  } catch {
    /* 舊系統提領 */
  }
  add({
    key: "signer",
    group: "身分",
    status: !signer ? "info" : signer === b?.account ? "ok" : "fail",
    title: !signer ? "舊系統提領，無 CAFECA 簽署紀錄" : signer === b?.account ? "提領由綁定的 CAFECA 身分簽署" : "提領簽署者與目前綁定的 CAFECA 身分不一致",
  });

  // 近期帳號異動（帳號被盜風險）
  const since = new Date(at.getTime() - aml.recentChangeHours * H);
  const events = await db.version.findMany({
    where: { itemType: AUDIT_ITEM_TYPE, itemId: memberId, event: { in: ["auth.password_reset", "auth.password_changed", "auth.reset_requested", "identity.bind", "auth.login_failed"] }, createdAt: { gte: since, lte: at } },
    select: { event: true, createdAt: true, object: true },
    orderBy: { id: "asc" },
    take: 100,
  });
  const recentBind = b?.boundAt && b.boundAt >= since && b.boundAt <= at;
  const pw = events.filter((e) => e.event === "auth.password_reset" || e.event === "auth.password_changed");
  const fails = events.filter((e) => e.event === "auth.login_failed").length;
  const changes = [...(pw.length ? [`密碼變更 ${pw.length} 次`] : []), ...(recentBind || events.some((e) => e.event === "identity.bind") ? ["綁定 CAFECA"] : []), ...(fails >= 3 ? [`登入失敗 ${fails} 次`] : [])];
  const ips = new Set(events.map((e) => (JSON.parse(e.object ?? "{}") as { ip?: string }).ip).filter(Boolean));
  add({
    key: "recent_changes",
    group: "交易行為",
    status: pw.length || fails >= 3 ? "warn" : changes.length ? "info" : "ok",
    title: changes.length ? `提領前 ${aml.recentChangeHours} 小時內有帳號異動：${changes.join("、")}` : `提領前 ${aml.recentChangeHours} 小時內無密碼或身分異動`,
    detail: changes.length ? `相關 IP：${[...ips].join("、") || "—"}${createIp ? `・提領 IP：${createIp}` : ""}` : createIp ? `提領 IP：${createIp}` : undefined,
  });

  // ───── 帳務 ─────
  const accounts = await accountsP;
  const curAccounts = accounts.filter((a) => a.currency === w.currency);
  const negative = accounts.filter((a) => dec(a.balance).isNegative() || dec(a.locked).isNegative());
  add({
    key: "negative",
    group: "帳務",
    status: negative.length ? "fail" : "ok",
    title: negative.length ? `有 ${negative.length} 個資產帳戶為負餘額` : "所有資產帳戶皆無負餘額",
    detail: negative.map((a) => `${(cm.get(a.currency) ?? unknownCurrency(a.currency)).code.toUpperCase()} ${fmtAmount(a.balance ?? 0, 8)} / ${fmtAmount(a.locked ?? 0, 8)}`).join("、") || undefined,
  });

  let holdings = curAccounts.reduce((s, a) => s.plus(a.balance ?? 0).plus(a.locked ?? 0), ZERO);
  try {
    const rec = await reconcileAccounts(curAccounts);
    const bad = rec.filter((r) => !r.ok);
    add({
      key: "ledger",
      group: "帳務",
      status: bad.length ? "fail" : "ok",
      title: bad.length ? `${up} 帳本加總與帳戶餘額不符` : `${up} 帳本加總與帳戶餘額相符（${rec.reduce((s, r) => s + r.entries, 0).toLocaleString()} 筆）`,
      detail: bad.map((r) => `帳戶 #${r.accountId}：餘額 ${r.balance.toFixed()} / 凍結 ${r.locked.toFixed()}，帳本 ${r.ledgerBalance.toFixed()} / ${r.ledgerLocked.toFixed()}`).join("\n") || undefined,
      links: [{ href: `/admin/currencies/${c.code}/holders/${memberId}`, label: "幣種紀錄" }],
    });
  } catch (e) {
    if (!isTimeout(e)) throw e;
    add({ key: "ledger", group: "帳務", status: "warn", title: "帳本筆數過多，對帳查詢逾時", links: [{ href: `/admin/currencies/${c.code}/holders/${memberId}`, label: "幣種紀錄" }] });
  }

  // 資金來源
  try {
    const flows = await flowByReason(curAccounts.map((a) => a.id));
    let deposit = ZERO, trade = ZERO, other = ZERO;
    const otherReasons: number[] = [];
    for (const f of flows) {
      if (DEPOSIT_REASONS.has(f.reason)) deposit = deposit.plus(f.inflow);
      else if (TRADE_REASONS.has(f.reason)) trade = trade.plus(f.net);
      else if (!WITHDRAW_REASONS.has(f.reason) && f.inflow.gt(0)) {
        other = other.plus(f.inflow);
        otherReasons.push(f.reason);
      }
    }
    holdings = holdings.isZero() ? flows.reduce((s, f) => s.plus(f.net), ZERO) : holdings;
    const share = holdings.gt(0) ? other.div(holdings).toNumber() : 0;
    const noSource = deposit.isZero() && trade.lte(0) && holdings.gt(0);
    add({
      key: "funding",
      group: "帳務",
      status: noSource || share > aml.nonTradeShare ? "warn" : "ok",
      title: noSource
        ? `${up} 沒有入金或交易來源，餘額全部來自其他調整`
        : share > aml.nonTradeShare
          ? `非入金／交易來源占持有量 ${(share * 100).toFixed(1)}%`
          : `${up} 資金來源為入金與交易`,
      detail: `入金 ${fmtAmount(deposit, 8)}・交易淨額 ${fmtAmount(trade, 8, { sign: true })}・其他流入 ${fmtAmount(other, 8)}${otherReasons.length ? `（原因碼 ${otherReasons.join(", ")}）` : ""}`,
    });
  } catch (e) {
    if (!isTimeout(e)) throw e;
    add({ key: "funding", group: "帳務", status: "warn", title: "帳本筆數過多，資金來源彙總逾時" });
  }

  // ───── 交易行為 ─────
  const amount = dec(w.amount);
  const sum = dec(w.sum).isZero() ? amount.plus(w.fee ?? 0) : dec(w.sum);
  const ratio = holdings.gt(0) ? sum.div(holdings).toNumber() : 1;
  const usd = c.refPriceUsd ? amount.mul(c.refPriceUsd).toNumber() : null;
  add({
    key: "size",
    group: "交易行為",
    status: usd !== null && usd >= aml.largeWithdrawUsd ? "warn" : "info",
    title:
      usd !== null && usd >= aml.largeWithdrawUsd
        ? `大額提領：約 USD ${Math.round(usd).toLocaleString()}（門檻 ${aml.largeWithdrawUsd.toLocaleString()}）`
        : `提領占 ${up} 持有量 ${(ratio * 100).toFixed(1)}%${usd !== null ? `・約 USD ${Math.round(usd).toLocaleString()}` : ""}`,
    detail: usd === null ? "此幣種未設定參考價格，無法判斷是否大額" : undefined,
  });

  const [recent, rejected, quickDeposits] = await Promise.all([
    db.withdraw.count({ where: { memberId, id: { not: w.id }, createdAt: { gte: new Date(at.getTime() - 24 * H), lte: at } } }),
    db.withdraw.count({ where: { memberId, aasmState: { in: ["rejected", "failed"] } } }),
    db.deposit.findMany({
      where: { memberId, currency: w.currency, createdAt: { gte: new Date(at.getTime() - aml.quickTurnaroundHours * H), lte: at } },
      select: { amount: true, createdAt: true, aasmState: true },
      take: 20,
    }),
  ]);
  add({
    key: "velocity",
    group: "交易行為",
    status: recent + 1 > aml.velocity24h ? "warn" : "ok",
    title: `24 小時內共 ${recent + 1} 筆提領申請${recent + 1 > aml.velocity24h ? `（超過 ${aml.velocity24h} 筆）` : ""}`,
    detail: rejected ? `歷史被退回／失敗 ${rejected} 筆` : undefined,
  });
  const qd = quickDeposits.reduce((s, d) => s.plus(d.amount ?? 0), ZERO);
  add({
    key: "turnaround",
    group: "交易行為",
    status: qd.gt(0) && qd.gte(amount.mul(0.5)) ? "warn" : "ok",
    title: qd.gt(0) ? `提領前 ${aml.quickTurnaroundHours} 小時內入金 ${fmtAmount(qd, 8)} ${up}（快進快出）` : `提領前 ${aml.quickTurnaroundHours} 小時內無 ${up} 入金`,
  });

  // ───── 收款地址 ─────
  if (c.addressPattern && w.fundUid) {
    let ok = true;
    try {
      ok = new RegExp(c.addressPattern).test(w.fundUid);
    } catch {
      /* 設定錯誤時略過 */
    }
    add({ key: "address_format", group: "收款地址", status: ok ? "ok" : "fail", title: ok ? "地址格式符合此幣種規則" : "地址格式不符合此幣種規則" });
  }
  if (w.fundUid) {
    const [wd, fs, mine] = await Promise.all([
      db.withdraw.groupBy({ by: ["memberId"], where: { fundUid: { equals: w.fundUid, mode: "insensitive" }, memberId: { not: memberId } } }),
      db.fundSource.groupBy({ by: ["memberId"], where: { uid: { equals: w.fundUid, mode: "insensitive" }, memberId: { not: memberId }, deletedAt: null } }),
      db.withdraw.count({ where: { fundUid: w.fundUid, memberId, aasmState: "done", id: { not: w.id } } }),
    ]);
    const others = [...new Set([...wd, ...fs].map((x) => x.memberId).filter((x): x is bigint => !!x).map(String))];
    const flagged = others.length
      ? await db.member.findMany({ where: { id: { in: others.map(BigInt) }, OR: [{ disabled: 1 }, { disableWithdraw: 1 }] }, select: { id: true } })
      : [];
    const blOthers = matchBlacklist(blacklist, { member: others });
    add({
      key: "address_shared",
      group: "收款地址",
      status: flagged.length || blOthers.length ? "fail" : others.length ? "warn" : "ok",
      title: others.length
        ? `此地址也被 ${others.length} 位其他會員使用${flagged.length || blOthers.length ? "，其中有停權或黑名單帳號" : "（可能為人頭帳戶或交易所地址）"}`
        : "此地址未被其他會員使用",
      links: others.slice(0, 8).map((x) => memberLink(x)),
    });
    add({
      key: "address_history",
      group: "收款地址",
      status: mine > 0 ? "ok" : "info",
      title: mine > 0 ? `會員曾成功提領至此地址 ${mine} 次` : "首次提領至此地址",
    });
  }

  const order: Record<CheckStatus, number> = { fail: 0, warn: 1, info: 2, ok: 3 };
  checks.sort((a, b2) => order[a.status] - order[b2.status]);
  const { verdict, score } = verdictOf(checks);
  const report: RiskReport = { withdrawId: key, verdict, score, checks, analyzedAt: Date.now(), ms: Date.now() - started };
  if (stateOf(w.aasmState) === "SUBMITTED" || stateOf(w.aasmState) === "APPROVED") cache.set(key, report);
  return report;
}

export function forgetRisk(id: bigint | string) {
  cache.delete(String(id));
}
