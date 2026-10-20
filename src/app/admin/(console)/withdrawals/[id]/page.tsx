import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Prisma } from "@/generated/prisma/client";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, CardHeader, CoinIcon, DefinitionList, Textarea } from "@/components/ui";
import { CopyButton } from "@/components/copy-button";
import { W_LABEL, WBadge } from "@/components/admin/labels";
import { RiskPanel, RiskPanelSkeleton } from "@/components/admin/risk-panel";
import { can, requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { currencyMap, unknownCurrency } from "@/lib/currencies";
import { explorerUrl, fmtAmount, fmtDateTime, shortAddr } from "@/lib/format";
import { loadMember } from "@/lib/members";
import { idParam } from "@/lib/queries";
import { lastOperator, stateOf } from "@/lib/withdraw";
import { withdrawNoteAction } from "../../actions";
import { WithdrawActions } from "./withdraw-actions";

export const metadata = { title: "提領詳情" };

export default async function AdminWithdrawDetail({ params, searchParams }: PageProps<"/admin/withdrawals/[id]">) {
  const { id } = await params;
  const fresh = !!(await searchParams).fresh;
  const { admin } = await requireAdmin();
  const w = await db.withdraw.findUnique({ where: { id: idParam(id) } });
  if (!w || !w.memberId) notFound();
  const [m, cm, logs, comments, approver, processor, history, signed] = await Promise.all([
    loadMember(w.memberId),
    currencyMap(),
    db.auditLog.findMany({ where: { auditableType: "Withdraw", auditableId: w.id }, orderBy: { id: "asc" } }),
    db.adminComment.findMany({ where: { resourceType: "Withdraw", resourceId: w.id.toString() }, orderBy: { id: "asc" } }),
    lastOperator(w.id, "accepted"),
    lastOperator(w.id, "processing"),
    db.withdraw.findMany({ where: { memberId: w.memberId, id: { not: w.id } }, orderBy: { id: "desc" }, take: 6 }),
    db.version.findFirst({ where: { itemType: "TideBit", itemId: w.id, event: "withdraw.create" } }),
  ]);
  if (!m) notFound();
  const operatorIds = [...new Set([...logs.map((l) => l.operatorId), ...comments.map((c) => c.authorId)].filter((x): x is bigint => !!x))];
  const operators = new Map((await db.member.findMany({ where: { id: { in: operatorIds } }, select: { id: true, email: true, nickname: true, name: true } })).map((o) => [o.id.toString(), o.nickname || o.name || o.email || `#${o.id}`]));
  const who = (id: bigint | null | undefined) => (id ? (id === w.memberId ? "會員" : (operators.get(id.toString()) ?? `#${id}`)) : "系統");

  const c = cm.get(w.currency) ?? unknownCurrency(w.currency);
  const up = c.code.toUpperCase();
  const accounts = await db.account.findMany({ where: { memberId: w.memberId, currency: w.currency ?? -1n } });
  const balance = accounts.reduce((a, x) => a.plus(x.balance ?? 0), new Prisma.Decimal(0));
  const locked = accounts.reduce((a, x) => a.plus(x.locked ?? 0), new Prisma.Decimal(0));
  let signer: string | null = null;
  try {
    signer = (JSON.parse(signed?.object ?? "{}") as { data?: { cafecaAccount?: string } }).data?.cafecaAccount ?? null;
  } catch {
    /* 舊系統提領沒有簽署紀錄 */
  }
  const b = m.binding;
  const txUrl = explorerUrl(c.explorerTx, "txid", w.txid);
  const addrUrl = explorerUrl(c.explorerAddr, "address", w.fundUid);
  const amountStr = new Prisma.Decimal(w.amount ?? 0).toFixed();
  const notes = comments.filter((x) => x.namespace === "note");
  const reject = comments.filter((x) => x.namespace === "reject").at(-1);
  const legacyFee = !!w.feeAccountId && !!w.accountId && w.feeAccountId !== w.accountId;

  return (
    <div className="space-y-6">
      <Link href="/admin/withdrawals" className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft size={14} /> 提領審核
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <CoinIcon code={c.code} size={44} />
          <div>
            <p className="font-mono text-xs text-muted">
              {w.sn || "—"} · #{String(w.id)}
            </p>
            <p className="num text-2xl font-semibold">
              {fmtAmount(w.amount ?? 0, 8)} <span className="text-base font-normal text-muted">{up}</span>
            </p>
          </div>
        </div>
        <WBadge aasm={w.aasmState} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="出款資訊" desc="請逐字核對地址與網路後再出款" />
            <div className="px-5">
              <DefinitionList
                items={[
                  { label: "網路", value: c.network ?? "—" },
                  {
                    label: "收款地址",
                    value: (
                      <span className="inline-flex items-start gap-1">
                        <span className="break-all font-mono text-sm font-medium">{w.fundUid}</span>
                        {w.fundUid && <CopyButton value={w.fundUid} />}
                        {addrUrl && (
                          <a href={addrUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-muted hover:text-accent">
                            <ExternalLink size={13} />
                          </a>
                        )}
                      </span>
                    ),
                  },
                  ...(w.memo || w.destinationTag
                    ? [
                        {
                          label: c.memoLabel || "Memo / Tag",
                          value: (
                            <span className="inline-flex items-center gap-1 font-mono">
                              {w.memo ?? String(w.destinationTag)} <CopyButton value={w.memo ?? String(w.destinationTag)} />
                            </span>
                          ),
                        },
                      ]
                    : []),
                  {
                    label: "出款數量（到帳）",
                    value: (
                      <span className="num inline-flex items-center gap-1 text-base font-semibold">
                        {amountStr} {up} <CopyButton value={amountStr} />
                      </span>
                    ),
                  },
                  { label: "手續費", value: <span className="num">{fmtAmount(w.fee ?? 0, 8)} {up}</span> },
                  { label: "扣款總額（凍結中）", value: <span className="num">{fmtAmount(w.sum, 8)} {up}</span> },
                  {
                    label: "txid",
                    value: w.txid ? (
                      txUrl ? (
                        <a href={txUrl} target="_blank" rel="noopener noreferrer" className="break-all font-mono text-xs text-accent hover:underline">
                          {w.txid}
                        </a>
                      ) : (
                        <span className="break-all font-mono text-xs">{w.txid}</span>
                      )
                    ) : (
                      "—"
                    ),
                  },
                  { label: "申請時間", value: fmtDateTime(w.createdAt) },
                  { label: "核准", value: approver ? `${who(approver.operatorId)} · ${fmtDateTime(approver.at)}` : "—" },
                  { label: "出款人", value: processor ? `${who(processor.operatorId)} · ${fmtDateTime(processor.at)}` : "—" },
                  ...(reject?.body ? [{ label: "退回原因", value: reject.body }] : []),
                ]}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="處理紀錄" />
            <ol className="space-y-3 px-5 py-4 text-sm">
              {logs.map((e) => (
                <li key={String(e.id)} className="flex flex-wrap gap-x-3 gap-y-1">
                  <span className="w-36 shrink-0 text-muted">{fmtDateTime(e.createdAt)}</span>
                  <span className="font-medium">
                    {e.sourceState ? `${W_LABEL[stateOf(e.sourceState)]} → ` : ""}
                    {W_LABEL[stateOf(e.targetState)]}
                  </span>
                  <span className="text-muted">{who(e.operatorId)}</span>
                </li>
              ))}
              {logs.length === 0 && <li className="text-muted">無處理紀錄</li>}
            </ol>
          </Card>

          <Card>
            <CardHeader title="內部備註" desc="僅管理員可見" />
            <div className="space-y-3 px-5 py-4">
              {notes.length === 0 ? (
                <p className="text-sm text-muted">尚無備註</p>
              ) : (
                <ul className="space-y-2">
                  {notes.map((n) => (
                    <li key={String(n.id)} className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
                      <p className="whitespace-pre-wrap">{n.body}</p>
                      <p className="mt-1 text-xs text-muted">
                        {who(n.authorId)} · {fmtDateTime(n.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              {can(admin.role, "withdraw.review") && (
                <ActionForm action={withdrawNoteAction} className="space-y-2">
                  <input type="hidden" name="id" value={String(w.id)} />
                  <Textarea name="note" rows={2} placeholder="新增備註…" required />
                  <div className="flex justify-end">
                    <SubmitButton variant="secondary" size="sm">
                      新增備註
                    </SubmitButton>
                  </div>
                </ActionForm>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <WithdrawActions
            id={String(w.id)}
            state={stateOf(w.aasmState)}
            canReview={can(admin.role, "withdraw.review")}
            canProcess={can(admin.role, "withdraw.process")}
            isApprover={approver?.operatorId === admin.id}
            isProcessor={processor?.operatorId === admin.id}
            fourEyes={env.fourEyes}
            legacyFee={legacyFee}
            amount={`${amountStr} ${up}`}
            address={w.fundUid ?? ""}
          />

          <Suspense key={fresh ? "fresh" : "cached"} fallback={<RiskPanelSkeleton />}>
            <RiskPanel withdrawId={w.id} address={w.fundUid} memberId={w.memberId} canManage={can(admin.role, "aml.manage")} fresh={fresh} />
          </Suspense>

          <Card className="px-5 py-3 text-sm text-muted">
            目前 {up} 可用 <span className="num text-text">{fmtAmount(balance, 8)}</span>・凍結 <span className="num text-text">{fmtAmount(locked, 8)}</span>
            <Link href={`/admin/currencies/${c.code}/holders/${m.id}`} className="ml-2 text-accent hover:underline">
              {up} 紀錄 →
            </Link>
          </Card>

          <Card>
            <CardHeader
              title="會員"
              action={
                <Link href={`/admin/members/${m.id}`} className="text-sm text-accent hover:underline">
                  會員頁面
                </Link>
              }
            />
            <div className="px-5">
              <DefinitionList
                items={[
                  { label: "Email", value: m.email },
                  { label: "會員 ID", value: `${m.id}${m.sn ? ` · ${m.sn}` : ""}` },
                  { label: "CAFECA", value: <span className="font-mono text-xs">{shortAddr(b?.account, 10, 8)}</span> },
                  { label: "簽署身分", value: <span className="font-mono text-xs">{shortAddr(signer, 10, 8)}</span> },
                ]}
              />
            </div>
            {history.length > 0 && (
              <ul className="divide-y divide-border border-t border-border text-sm">
                {history.map((h) => (
                  <li key={String(h.id)}>
                    <Link href={`/admin/withdrawals/${h.id}`} className="flex items-center justify-between gap-2 px-5 py-2 hover:bg-surface-2">
                      <span className="text-muted">{fmtDateTime(h.createdAt)}</span>
                      <span className="num">
                        {fmtAmount(h.amount ?? 0, 8)} {(cm.get(h.currency) ?? unknownCurrency(h.currency)).code.toUpperCase()}
                      </span>
                      <WBadge aasm={h.aasmState} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
