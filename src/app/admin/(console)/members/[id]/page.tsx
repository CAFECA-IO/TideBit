import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, CardHeader, CoinIcon, DefinitionList, Field, Input, Textarea } from "@/components/ui";
import { FLAG_LABEL, IBadge, TBadge, WBadge } from "@/components/admin/labels";
import { can, requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { currencyMap, unknownCurrency } from "@/lib/currencies";
import { fmtAmount, fmtDate, fmtDateTime, normalizeName } from "@/lib/format";
import { lockedMinutes } from "@/lib/login";
import { CAFECA_PROVIDER, legacyName, loadMember } from "@/lib/members";
import { getHoldings, idParam } from "@/lib/queries";
import { splitContent, ticketStatus } from "@/lib/tickets";
import { identityReviewAction, memberFlagAction, memberNoteAction, messageMemberAction } from "../../actions";

export const metadata = { title: "會員詳情" };

export default async function MemberDetail({ params }: PageProps<"/admin/members/[id]">) {
  const { id } = await params;
  const { admin } = await requireAdmin("member.view");
  const m = await loadMember(idParam(id));
  if (!m) notFound();
  const b = m.binding;
  const [holdings, withdraws, topics, notes, identityNotes, duplicates, cm] = await Promise.all([
    getHoldings(m.id),
    db.withdraw.findMany({ where: { memberId: m.id }, orderBy: { id: "desc" }, take: 10 }),
    db.ticketTopic.findMany({ where: { authorId: m.id }, orderBy: { id: "desc" }, take: 10 }),
    db.adminComment.findMany({ where: { resourceType: "Member", resourceId: m.id.toString() }, orderBy: { id: "desc" } }),
    db.adminComment.findMany({ where: { resourceType: "MemberIdentity", resourceId: m.id.toString() }, orderBy: { id: "desc" }, take: 5 }),
    b
      ? db.authentication.findMany({
          where: { provider: CAFECA_PROVIDER, memberId: { not: m.id }, OR: [{ uid: b.account }, ...(b.pairwiseId ? [{ token: b.pairwiseId }] : [])] },
          include: { member: { select: { id: true, email: true } } },
        })
      : Promise.resolve([]),
    currencyMap(),
  ]);
  const authorIds = [...new Set([...notes, ...identityNotes].map((n) => n.authorId).filter((x): x is bigint => !!x))];
  const authors = new Map((await db.member.findMany({ where: { id: { in: authorIds } }, select: { id: true, email: true, nickname: true, name: true } })).map((a) => [a.id.toString(), a.nickname || a.name || a.email || `#${a.id}`]));
  const lName = legacyName(m);
  const nameMatch = !!b?.legalName && !!lName && normalizeName(b.legalName) === normalizeName(lName);
  const locked = m.identityRow ? lockedMinutes(m.identityRow) > 0 : false;

  return (
    <div className="space-y-6">
      <Link href="/admin/members" className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft size={14} /> 會員
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{m.email || `#${m.id}`}</h1>
        <IBadge status={m.identityStatus} />
        {m.disabled && <Badge tone="danger">停權</Badge>}
        {m.withdrawDisabled && <Badge tone="warning">禁止提領</Badge>}
        {locked && <Badge tone="warning">登入鎖定中</Badge>}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="身分比對" desc={b?.reviewedAt ? `最後審核：${authors.get(b.reviewerId ?? "") ?? (b.reviewerId ? `#${b.reviewerId}` : "自動")} · ${fmtDateTime(new Date(b.reviewedAt))}` : undefined} />
            <div className="grid gap-px overflow-hidden border-b border-border bg-border sm:grid-cols-2">
              <div className="bg-surface px-5 py-4">
                <p className="text-xs text-muted">舊系統登記{m.legacyIdName ? "（已審核證件）" : ""}</p>
                <p className="mt-1 text-lg font-semibold">{lName ?? "—"}</p>
                <p className="mt-1 text-xs text-muted">{[m.legacyCountry, `註冊 ${fmtDate(m.createdAt)}`].filter(Boolean).join(" · ")}</p>
              </div>
              <div className="bg-surface px-5 py-4">
                <p className="text-xs text-muted">CAFECA 證件{b ? `（L${b.level}${b.signerClass ? ` · ${b.signerClass}` : ""}）` : ""}</p>
                <p className={`mt-1 text-lg font-semibold ${b?.legalName && !nameMatch ? "text-warning" : ""}`}>{b?.legalName ?? "—"}</p>
                <p className="mt-1 text-xs text-muted">{b ? [b.docType, b.nationality, `綁定 ${fmtDateTime(b.boundAt)}`].filter(Boolean).join(" · ") : "尚未綁定"}</p>
              </div>
            </div>
            {b && (
              <div className="space-y-3 px-5 py-4 text-sm">
                <p className="break-all">
                  <span className="text-muted">CAFECA 身分：</span>
                  <span className="font-mono text-xs">{b.account}</span>
                </p>
                <p className="break-all">
                  <span className="text-muted">pairwise ID：</span>
                  <span className="font-mono text-xs">{b.pairwiseId ?? "—"}</span>
                </p>
                {b.flags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {b.flags.map((f) => (
                      <Badge key={f} tone="warning">
                        {FLAG_LABEL[f] ?? f}
                      </Badge>
                    ))}
                  </div>
                )}
                {duplicates.length > 0 && (
                  <p className="text-warning">
                    相同 CAFECA 身分的其他帳號：
                    {duplicates.map((d) => (
                      <Link key={String(d.id)} href={`/admin/members/${d.memberId}`} className="ml-2 underline">
                        {d.member?.email ?? `#${d.memberId}`}
                      </Link>
                    ))}
                  </p>
                )}
                {identityNotes.map((n) => (
                  <p key={String(n.id)}>
                    <span className="text-muted">
                      給會員的說明（{authors.get(n.authorId?.toString() ?? "") ?? "—"} · {fmtDateTime(n.createdAt)}）：
                    </span>
                    {n.body}
                  </p>
                ))}
              </div>
            )}
            {can(admin.role, "identity.review") && b && (
              <ActionForm action={identityReviewAction} className="space-y-3 border-t border-border px-5 py-4">
                <input type="hidden" name="memberId" value={String(m.id)} />
                <Textarea name="note" rows={2} placeholder="給會員的說明（不通過、解除綁定時必填）" />
                <div className="flex flex-wrap gap-2">
                  {m.identityStatus !== "VERIFIED" && (
                    <button name="decision" value="approve" className="h-9 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:opacity-90">
                      核准實名
                    </button>
                  )}
                  {m.identityStatus !== "REJECTED" && (
                    <button name="decision" value="reject" className="h-9 rounded-lg bg-danger px-4 text-sm font-medium text-white hover:opacity-90">
                      不通過
                    </button>
                  )}
                  <button name="decision" value="reset" className="h-9 rounded-lg border border-border px-4 text-sm hover:bg-surface-2">
                    解除綁定（請會員重新綁定）
                  </button>
                </div>
              </ActionForm>
            )}
          </Card>

          <Card>
            <CardHeader title="資產餘額" />
            <div className="overflow-x-auto">
              <table className="tb-table">
                <thead>
                  <tr>
                    <th>幣種</th>
                    <th className="r">可用</th>
                    <th className="r">凍結</th>
                    <th className="r">總額</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h) => (
                    <tr key={h.code}>
                      <td data-label="幣種">
                        <span className="flex items-center gap-2 font-medium">
                          <CoinIcon code={h.code} size={20} />
                          {h.code.toUpperCase()}
                        </span>
                      </td>
                      <td data-label="可用" className="r num">{fmtAmount(h.balance, 8)}</td>
                      <td data-label="凍結" className="r num text-muted">{fmtAmount(h.locked, 8)}</td>
                      <td data-label="總額" className="r num font-medium">{fmtAmount(h.total, 8)}</td>
                    </tr>
                  ))}
                  {holdings.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-muted">
                        無餘額
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader title="提領" action={<Link href={`/admin/withdrawals?state=ALL&q=${m.id}`} className="text-sm text-accent hover:underline">全部</Link>} />
            <ul className="divide-y divide-border text-sm">
              {withdraws.map((w) => (
                <li key={String(w.id)}>
                  <Link href={`/admin/withdrawals/${w.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-surface-2">
                    <span className="text-muted">{fmtDateTime(w.createdAt)}</span>
                    <span className="num flex-1 text-right">
                      {fmtAmount(w.amount ?? 0, 8)} {(cm.get(w.currency) ?? unknownCurrency(w.currency)).code.toUpperCase()}
                    </span>
                    <WBadge aasm={w.aasmState} />
                  </Link>
                </li>
              ))}
              {withdraws.length === 0 && <li className="px-5 py-4 text-muted">無提領紀錄</li>}
            </ul>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="基本資料" />
            <div className="px-5">
              <DefinitionList
                items={[
                  { label: "會員 ID", value: String(m.id) },
                  { label: "SN", value: m.sn ?? "—" },
                  { label: "電話", value: m.phone ?? "—" },
                  { label: "最後登入", value: fmtDateTime(m.identityRow?.lastVerifyAt) },
                ]}
              />
            </div>
            {can(admin.role, "member.edit") && (
              <div className="flex flex-wrap gap-2 border-t border-border px-5 py-4">
                <ActionForm action={memberFlagAction}>
                  <input type="hidden" name="memberId" value={String(m.id)} />
                  <input type="hidden" name="field" value="withdrawDisabled" />
                  <input type="hidden" name="value" value={String(!m.withdrawDisabled)} />
                  <SubmitButton variant="secondary" size="sm">
                    {m.withdrawDisabled ? "恢復提領" : "禁止提領"}
                  </SubmitButton>
                </ActionForm>
                <ActionForm action={memberFlagAction}>
                  <input type="hidden" name="memberId" value={String(m.id)} />
                  <input type="hidden" name="field" value="disabled" />
                  <input type="hidden" name="value" value={String(!m.disabled)} />
                  <SubmitButton variant={m.disabled ? "secondary" : "danger"} size="sm">
                    {m.disabled ? "解除停權" : "停權帳號"}
                  </SubmitButton>
                </ActionForm>
                {m.locked && (
                  <ActionForm action={memberFlagAction}>
                    <input type="hidden" name="memberId" value={String(m.id)} />
                    <input type="hidden" name="field" value="unlock" />
                    <SubmitButton variant="secondary" size="sm">
                      解除登入鎖定
                    </SubmitButton>
                  </ActionForm>
                )}
              </div>
            )}
          </Card>

          {can(admin.role, "member.edit") && (
            <Card>
              <CardHeader title="寄送訊息" desc="會建立一則客服對話並以 Email 通知會員，會員可直接回覆" />
              <ActionForm action={messageMemberAction} className="space-y-3 px-5 py-4">
                <input type="hidden" name="memberId" value={String(m.id)} />
                <Field label="主旨" htmlFor="subject">
                  <Input id="subject" name="subject" required maxLength={120} />
                </Field>
                <Field label="內容" htmlFor="body">
                  <Textarea id="body" name="body" required rows={4} />
                </Field>
                <div className="flex justify-end">
                  <SubmitButton size="sm">送出</SubmitButton>
                </div>
              </ActionForm>
            </Card>
          )}

          <Card>
            <CardHeader title="客服紀錄" />
            <ul className="divide-y divide-border text-sm">
              {topics.map((tk) => (
                <li key={String(tk.id)}>
                  <Link href={`/admin/tickets/${tk.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-surface-2">
                    <span className="truncate">{splitContent(tk.content).subject}</span>
                    <TBadge status={ticketStatus(tk.state)} />
                  </Link>
                </li>
              ))}
              {topics.length === 0 && <li className="px-5 py-4 text-muted">無</li>}
            </ul>
          </Card>

          <Card>
            <CardHeader title="內部備註" />
            <ul className="divide-y divide-border text-sm">
              {notes.map((n) => (
                <li key={String(n.id)} className="px-5 py-3">
                  <p className="whitespace-pre-wrap">{n.body}</p>
                  <p className="mt-1 text-xs text-muted">
                    {authors.get(n.authorId?.toString() ?? "") ?? "—"} · {fmtDateTime(n.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
            {can(admin.role, "member.note") && (
              <ActionForm action={memberNoteAction} className="space-y-2 border-t border-border px-5 py-4">
                <input type="hidden" name="memberId" value={String(m.id)} />
                <Textarea name="body" rows={2} required placeholder="新增備註…" />
                <div className="flex justify-end">
                  <SubmitButton variant="secondary" size="sm">
                    新增
                  </SubmitButton>
                </div>
              </ActionForm>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
