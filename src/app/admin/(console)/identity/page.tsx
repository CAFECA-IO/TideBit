import Link from "next/link";
import clsx from "clsx";
import { Badge, Card, EmptyState } from "@/components/ui";
import { FLAG_LABEL, I_LABEL, IBadge } from "@/components/admin/labels";
import { Pagination } from "@/components/pagination";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDateTime, shortAddr } from "@/lib/format";
import { CAFECA_PROVIDER, getBindings, type IdentityStatus } from "@/lib/members";
import { PAGE_SIZE, pageOf, str } from "@/lib/queries";
import { getI18n } from "@/i18n/server";

export const metadata = { title: "實名審核" };
const TABS: IdentityStatus[] = ["PENDING_REVIEW", "VERIFIED", "REJECTED"];

export default async function IdentityQueue({ searchParams }: PageProps<"/admin/identity">) {
  await requireAdmin("member.view");
  const { t } = await getI18n();
  const sp = await searchParams;
  const status = (TABS as string[]).includes(str(sp.status)) ? (str(sp.status) as IdentityStatus) : "PENDING_REVIEW";
  const page = pageOf(sp);
  const auths = await db.authentication.findMany({
    where: { provider: CAFECA_PROVIDER, secret: { contains: `"s":"${status}"` } },
    include: { member: { include: { idDocuments: { where: { aasmState: "verified" }, take: 1, orderBy: { id: "desc" } } } } },
    orderBy: { id: status === "PENDING_REVIEW" ? "asc" : "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE + 1,
  });
  const bindings = await getBindings(auths.map((a) => a.memberId).filter((x): x is bigint => !!x));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">實名審核</h1>
      <p className="text-sm text-muted">會員以 CAFECA 綁定時，系統會比對證件姓名與舊系統登記姓名；不一致或有重複身分時會進入人工審核。</p>
      <Card>
        <div className="flex gap-1 border-b border-border px-2">
          {TABS.map((s) => (
            <Link
              key={s}
              href={`/admin/identity?status=${s}`}
              className={clsx("-mb-px border-b-2 px-3 py-3 text-sm", status === s ? "border-brand-teal font-medium" : "border-transparent text-muted hover:text-text")}
            >
              {I_LABEL[s]}
            </Link>
          ))}
        </div>
        {auths.length === 0 ? (
          <EmptyState title="沒有資料" />
        ) : (
          <div className="overflow-x-auto">
            <table className="tb-table">
              <thead>
                <tr>
                  <th>綁定時間</th>
                  <th>會員</th>
                  <th>舊系統姓名</th>
                  <th>CAFECA 證件姓名</th>
                  <th>等級</th>
                  <th>CAFECA</th>
                  <th>提示</th>
                  <th>狀態</th>
                </tr>
              </thead>
              <tbody>
                {auths.slice(0, PAGE_SIZE).map((a) => {
                  const b = a.memberId ? bindings.get(a.memberId.toString()) : undefined;
                  const m = a.member;
                  return (
                    <tr key={String(a.id)}>
                      <td className="whitespace-nowrap text-muted">{fmtDateTime(a.createdAt)}</td>
                      <td>
                        <Link href={`/admin/members/${a.memberId}`} className="font-medium text-accent hover:underline">
                          {m?.email ?? `#${a.memberId}`}
                        </Link>
                      </td>
                      <td>{m?.idDocuments[0]?.name || m?.name || "—"}</td>
                      <td className="font-medium">{a.nickname ?? "—"}</td>
                      <td>L{b?.level ?? 0}</td>
                      <td className="font-mono text-xs">{shortAddr(a.uid)}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {(b?.flags ?? []).map((f) => (
                            <Badge key={f} tone="warning">
                              {FLAG_LABEL[f] ?? f}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td>
                        <IBadge status={b?.status ?? "UNBOUND"} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} hasNext={auths.length > PAGE_SIZE} basePath="/admin/identity" params={{ status }} t={t} />
      </Card>
    </div>
  );
}
