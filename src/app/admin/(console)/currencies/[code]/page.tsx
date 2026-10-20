import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { ArrowLeft, Search } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, CoinIcon, EmptyState, Field, Input, Textarea, inputClass } from "@/components/ui";
import { Pagination } from "@/components/pagination";
import { can, requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCurrencies } from "@/lib/currencies";
import { fmtAmount } from "@/lib/format";
import { currencyHolderStats, currencyHolders } from "@/lib/holders";
import { PAGE_SIZE, pageOf, str } from "@/lib/queries";
import { tFor } from "@/i18n/server";
import { currencyAction } from "../../actions";

export const metadata = { title: "幣種設定" };

const d = (v: string | null) => v ?? "";

export default async function CurrencyEdit({ params, searchParams }: PageProps<"/admin/currencies/[code]">) {
  const { code } = await params;
  const sp = await searchParams;
  const { admin } = await requireAdmin();
  const c = (await getCurrencies(true)).find((x) => x.code === code.toLowerCase());
  if (!c) notFound();
  const editable = can(admin.role, "currency.edit");
  const canView = can(admin.role, "member.view");
  const tab = canView && str(sp.tab) !== "settings" ? "holders" : "settings";

  const check = (name: string, label: string, checked: boolean, hint?: string) => (
    <label className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5">
      <input type="checkbox" name={name} defaultChecked={checked} disabled={!editable} className="mt-0.5 h-4 w-4" />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );

  return (
    <div className={clsx("space-y-6", tab === "settings" && "mx-auto max-w-3xl")}>
      <Link href="/admin/currencies" className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft size={14} /> 幣種與提領設定
      </Link>
      <div className="flex items-center gap-3">
        <CoinIcon code={c.code} size={40} />
        <div>
          <h1 className="text-2xl font-semibold">{c.code.toUpperCase()}</h1>
          <p className="text-sm text-muted">
            {c.name ?? ""} · asset_bases #{c.id} · 精度 {c.precision} {c.isFiat && "· 法幣（不可線上提領）"}
          </p>
        </div>
      </div>
      <nav className="flex gap-1 border-b border-border">
        {[
          ...(canView ? [{ k: "holders", label: "持有用戶" }] : []),
          { k: "settings", label: "提領設定" },
        ].map((x) => (
          <Link
            key={x.k}
            href={`/admin/currencies/${c.code}${x.k === "settings" ? "?tab=settings" : ""}`}
            aria-current={tab === x.k ? "page" : undefined}
            className={clsx("-mb-px border-b-2 px-4 py-2.5 text-sm font-medium", tab === x.k ? "border-brand-teal text-text" : "border-transparent text-muted hover:text-text")}
          >
            {x.label}
          </Link>
        ))}
      </nav>
      {tab === "holders" ? (
        <Holders currencyId={BigInt(c.id)} code={c.code} precision={c.precision} q={str(sp.q).trim()} page={pageOf(sp)} />
      ) : (
      <Card className="p-5 sm:p-6">
        <ActionForm action={currencyAction} className="space-y-5">
          <input type="hidden" name="code" value={c.code} />
          <fieldset disabled={!editable} className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              {check("withdrawEnabled", "開放提領", c.withdrawEnabled, c.isFiat ? "法幣即使勾選也不會開放" : undefined)}
              {check("visible", "在資產列表顯示", c.visible, "有餘額的會員仍會看到")}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="網路（顯示給會員）" htmlFor="network" hint="例：Ethereum (ERC-20)">
                <Input id="network" name="network" defaultValue={c.network ?? ""} />
              </Field>
              <Field label="提領手續費" htmlFor="withdrawFee">
                <Input id="withdrawFee" name="withdrawFee" inputMode="decimal" defaultValue={d(c.withdrawFee)} className="num" />
              </Field>
              <Field label="最低提領數量" htmlFor="withdrawMin">
                <Input id="withdrawMin" name="withdrawMin" inputMode="decimal" defaultValue={d(c.withdrawMin)} className="num" />
              </Field>
              <Field label="單筆上限（空白＝不限）" htmlFor="withdrawMax">
                <Input id="withdrawMax" name="withdrawMax" inputMode="decimal" defaultValue={d(c.withdrawMax)} className="num" />
              </Field>
              <Field label="參考價格 USD（估值用，選填）" htmlFor="refPriceUsd">
                <Input id="refPriceUsd" name="refPriceUsd" inputMode="decimal" defaultValue={d(c.refPriceUsd)} className="num" />
              </Field>
            </div>
            <Field label="地址驗證 Regex（選填）" htmlFor="addressPattern" hint="例：^0x[0-9a-fA-F]{40}$">
              <Input id="addressPattern" name="addressPattern" defaultValue={c.addressPattern ?? ""} className="font-mono" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-end">
              {check("memoRequired", "需要 Memo / Tag", c.memoRequired)}
              <Field label="Memo 欄位名稱" htmlFor="memoLabel">
                <Input id="memoLabel" name="memoLabel" defaultValue={c.memoLabel ?? ""} placeholder="Memo / Destination Tag" />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="區塊瀏覽器（交易）" htmlFor="explorerTx" hint="以 {txid} 代表交易 ID">
                <Input id="explorerTx" name="explorerTx" defaultValue={c.explorerTx ?? ""} className="font-mono text-xs" />
              </Field>
              <Field label="區塊瀏覽器（地址）" htmlFor="explorerAddr" hint="以 {address} 代表地址">
                <Input id="explorerAddr" name="explorerAddr" defaultValue={c.explorerAddr ?? ""} className="font-mono text-xs" />
              </Field>
            </div>
            <Field label="提領說明（顯示給會員）" htmlFor="withdrawNotice">
              <Textarea id="withdrawNotice" name="withdrawNotice" rows={3} defaultValue={c.withdrawNotice ?? ""} />
            </Field>
          </fieldset>
          {editable && (
            <div className="flex justify-end">
              <SubmitButton>儲存</SubmitButton>
            </div>
          )}
        </ActionForm>
      </Card>
      )}
    </div>
  );
}

async function Holders({ currencyId, code, precision, q, page }: { currencyId: bigint; code: string; precision: number; q: string; page: number }) {
  const t = await tFor("zh-TW");
  let memberIds: bigint[] | undefined;
  if (q) {
    const found = await db.member.findMany({
      where: { OR: [{ email: { contains: q, mode: "insensitive" } }, ...(/^\d{1,18}$/.test(q) ? [{ id: BigInt(q) }] : [])] },
      select: { id: true },
      take: 200,
    });
    memberIds = found.map((m) => m.id);
  }
  const [stats, rows] = await Promise.all([
    currencyHolderStats(currencyId),
    currencyHolders(currencyId, { limit: PAGE_SIZE + 1, offset: (page - 1) * PAGE_SIZE, memberIds }),
  ]);
  const up = code.toUpperCase();
  const dp = Math.max(precision, 8);
  const share = (v: { toNumber(): number }) => (stats.total.isZero() ? "—" : `${((v.toNumber() / stats.total.toNumber()) * 100).toFixed(2)}%`);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "持有人數", value: stats.holders.toLocaleString() },
          { label: "會員總持有", value: `${fmtAmount(stats.total, dp)} ${up}` },
          { label: "其中凍結", value: `${fmtAmount(stats.locked, dp)} ${up}` },
          { label: "負餘額帳戶", value: String(stats.negative), warn: stats.negative > 0 },
        ].map((x) => (
          <Card key={x.label} className="px-4 py-3">
            <p className="text-xs text-muted">{x.label}</p>
            <p className={clsx("num mt-1 font-semibold", x.warn && "text-danger")}>{x.value}</p>
          </Card>
        ))}
      </div>
      <Card>
        <form className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3" action={`/admin/currencies/${code}`}>
          <div className="relative w-full max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <input name="q" defaultValue={q} placeholder="搜尋 Email 或會員 ID" className={clsx(inputClass, "h-9 pl-9")} />
          </div>
          {q && (
            <Link href={`/admin/currencies/${code}`} className="text-sm text-muted hover:text-text">
              清除
            </Link>
          )}
          <p className="ml-auto text-xs text-muted">依持有量（可用＋凍結）由多到少排序</p>
        </form>
        {rows.length === 0 ? (
          <EmptyState title="沒有符合的持有者" />
        ) : (
          <div className="overflow-x-auto">
            <table className="tb-table">
              <thead>
                <tr>
                  <th className="r">#</th>
                  <th>會員</th>
                  <th className="r">可用</th>
                  <th className="r">凍結</th>
                  <th className="r">合計</th>
                  <th className="r">占比</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, PAGE_SIZE).map((h, i) => (
                  <tr key={String(h.memberId)}>
                    <td className="r num text-muted">{q ? "" : (page - 1) * PAGE_SIZE + i + 1}</td>
                    <td>
                      <Link href={`/admin/currencies/${code}/holders/${h.memberId}`} className="font-medium hover:text-accent hover:underline">
                        {h.email ?? `#${h.memberId}`}
                      </Link>
                      <span className="ml-1 text-xs text-muted">#{String(h.memberId)}</span>
                      {h.disabled && <Badge tone="danger" className="ml-2">停權</Badge>}
                      {!h.disabled && h.withdrawDisabled && <Badge tone="warning" className="ml-2">禁止提領</Badge>}
                    </td>
                    <td className="r num">{fmtAmount(h.balance, dp)}</td>
                    <td className="r num text-muted">{h.locked.isZero() ? "—" : fmtAmount(h.locked, dp)}</td>
                    <td className={clsx("r num font-medium", h.total.isNegative() && "text-danger")}>{fmtAmount(h.total, dp)}</td>
                    <td className="r num text-muted">{share(h.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} hasNext={rows.length > PAGE_SIZE} basePath={`/admin/currencies/${code}`} params={{ q: q || undefined }} t={t} />
      </Card>
    </div>
  );
}
