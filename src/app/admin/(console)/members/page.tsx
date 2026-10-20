import Link from "next/link";
import clsx from "clsx";
import { Search } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { Badge, Card, EmptyState, inputClass } from "@/components/ui";
import { IBadge } from "@/components/admin/labels";
import { Pagination } from "@/components/pagination";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { CAFECA_PROVIDER, getBindings } from "@/lib/members";
import { PAGE_SIZE, pageOf, str } from "@/lib/queries";
import { getI18n } from "@/i18n/server";

export const metadata = { title: "會員" };

export default async function MembersPage({ searchParams }: PageProps<"/admin/members">) {
  await requireAdmin("member.view");
  const { t } = await getI18n();
  const sp = await searchParams;
  const q = str(sp.q).trim();
  const page = pageOf(sp);
  // CAFECA 地址或證件姓名搜尋：先找 authentications
  const byAuth = q
    ? await db.authentication.findMany({
        where: { provider: CAFECA_PROVIDER, OR: [{ uid: { contains: q.toLowerCase() } }, { nickname: { contains: q, mode: "insensitive" } }] },
        select: { memberId: true },
        take: 50,
      })
    : [];
  const where: Prisma.MemberWhereInput = q
    ? {
        OR: [
          { email: { contains: q, mode: "insensitive" } },
          { sn: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
          { phoneNumber: { contains: q } },
          { idDocuments: { some: { name: { contains: q, mode: "insensitive" } } } },
          ...(byAuth.length ? [{ id: { in: byAuth.map((a) => a.memberId).filter((x): x is bigint => !!x) } }] : []),
          ...(/^\d{1,18}$/.test(q) ? [{ id: BigInt(q) }] : []),
        ],
      }
    : {};
  const rows = await db.member.findMany({ where, orderBy: { id: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE + 1 });
  const bindings = await getBindings(rows.map((r) => r.id));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">會員</h1>
      <Card>
        <form className="flex gap-2 border-b border-border px-4 py-3" action="/admin/members">
          <label className="relative flex-1 sm:max-w-md">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input name="q" defaultValue={q} placeholder="Email、會員 ID、SN、姓名、CAFECA 地址、電話" className={clsx(inputClass, "h-9 pl-9")} autoFocus />
          </label>
        </form>
        {rows.length === 0 ? (
          <EmptyState title="找不到會員" />
        ) : (
          <div className="overflow-x-auto">
            <table className="tb-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Email</th>
                  <th>姓名</th>
                  <th>實名</th>
                  <th>狀態</th>
                  <th>註冊</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, PAGE_SIZE).map((m) => (
                  <tr key={String(m.id)}>
                    <td className="num text-muted">{String(m.id)}</td>
                    <td>
                      <Link href={`/admin/members/${m.id}`} className="font-medium text-accent hover:underline">
                        {m.email ?? "—"}
                      </Link>
                    </td>
                    <td>{m.name || "—"}</td>
                    <td>
                      <IBadge status={bindings.get(m.id.toString())?.status ?? "UNBOUND"} />
                    </td>
                    <td>{m.disabled ? <Badge tone="danger">停權</Badge> : m.disableWithdraw ? <Badge tone="warning">禁止提領</Badge> : <Badge tone="success">正常</Badge>}</td>
                    <td className="text-muted">{fmtDate(m.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} hasNext={rows.length > PAGE_SIZE} basePath="/admin/members" params={{ q: q || undefined }} t={t} />
      </Card>
    </div>
  );
}
