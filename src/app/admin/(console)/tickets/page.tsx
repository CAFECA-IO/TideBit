import Link from "next/link";
import clsx from "clsx";
import type { Prisma } from "@/generated/prisma/client";
import { Card, EmptyState } from "@/components/ui";
import { T_LABEL, TBadge } from "@/components/admin/labels";
import { Pagination } from "@/components/pagination";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { PAGE_SIZE, pageOf, str } from "@/lib/queries";
import { splitContent, ticketStatus, type TicketStatus } from "@/lib/tickets";
import { getI18n } from "@/i18n/server";

export const metadata = { title: "客服" };
const TABS: TicketStatus[] = ["OPEN", "ANSWERED", "CLOSED"];
const WHERE: Record<TicketStatus, Prisma.TicketTopicWhereInput> = {
  OPEN: { OR: [{ state: null }, { state: { notIn: ["replied", "answered", "reply", "closed", "close", "resolved"] } }] },
  ANSWERED: { state: { in: ["replied", "answered", "reply"] } },
  CLOSED: { state: { in: ["closed", "close", "resolved"] } },
};

export default async function AdminTickets({ searchParams }: PageProps<"/admin/tickets">) {
  await requireAdmin("member.view");
  const { t } = await getI18n();
  const sp = await searchParams;
  const status = (TABS as string[]).includes(str(sp.status)) ? (str(sp.status) as TicketStatus) : "OPEN";
  const page = pageOf(sp);
  const rows = await db.ticketTopic.findMany({
    where: WHERE[status],
    include: { author: true, _count: { select: { comments: true } } },
    orderBy: status === "OPEN" ? { lastReplyAt: "asc" } : { id: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE + 1,
  });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">客服</h1>
      <Card>
        <div className="flex gap-1 border-b border-border px-2">
          {TABS.map((s) => (
            <Link
              key={s}
              href={`/admin/tickets?status=${s}`}
              className={clsx("-mb-px border-b-2 px-3 py-3 text-sm", status === s ? "border-brand-teal font-medium" : "border-transparent text-muted hover:text-text")}
            >
              {T_LABEL[s]}
            </Link>
          ))}
        </div>
        {rows.length === 0 ? (
          <EmptyState title="沒有客服單" />
        ) : (
          <div className="overflow-x-auto">
            <table className="tb-table">
              <thead>
                <tr>
                  <th>最後更新</th>
                  <th>#</th>
                  <th>主旨</th>
                  <th>會員</th>
                  <th className="r">回覆數</th>
                  <th>狀態</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, PAGE_SIZE).map((tk) => (
                  <tr key={String(tk.id)}>
                    <td data-label="最後更新" className="whitespace-nowrap text-muted">{fmtDateTime(tk.lastReplyAt ?? tk.updatedAt)}</td>
                    <td data-label="#" className="num text-muted">{String(tk.id)}</td>
                    <td data-label="主旨" className="max-w-80 truncate">
                      <Link href={`/admin/tickets/${tk.id}`} className="font-medium text-accent hover:underline">
                        {splitContent(tk.content).subject}
                      </Link>
                    </td>
                    <td data-label="會員" className="max-w-48 truncate">{tk.author?.email ?? `#${tk.authorId}`}</td>
                    <td data-label="回覆數" className="r num">{tk._count.comments}</td>
                    <td data-label="狀態">
                      <TBadge status={ticketStatus(tk.state)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} hasNext={rows.length > PAGE_SIZE} basePath="/admin/tickets" params={{ status }} t={t} />
      </Card>
    </div>
  );
}
