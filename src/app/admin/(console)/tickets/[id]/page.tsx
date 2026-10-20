import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, CardHeader, DefinitionList, Textarea } from "@/components/ui";
import { IBadge, TBadge } from "@/components/admin/labels";
import { TicketThread } from "@/components/ticket-thread";
import { can, requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { legacyName, loadMember } from "@/lib/members";
import { idParam } from "@/lib/queries";
import { loadThread } from "@/lib/tickets";
import { ticketReplyAction, ticketStatusAction } from "../../actions";

export const metadata = { title: "客服單" };

export default async function AdminTicket({ params }: PageProps<"/admin/tickets/[id]">) {
  const { id } = await params;
  const { admin } = await requireAdmin("member.view");
  const thread = await loadThread(idParam(id));
  if (!thread) notFound();
  const { topic, subject, status, messages } = thread;
  const member = topic.authorId ? await loadMember(topic.authorId) : null;
  const staffIds = [...new Set(messages.filter((m) => m.authorType === "ADMIN" && m.authorId).map((m) => m.authorId!))];
  const staff = new Map((await db.member.findMany({ where: { id: { in: staffIds } }, select: { id: true, email: true, nickname: true, name: true } })).map((s) => [s.id.toString(), s.nickname || s.name || s.email || "客服"]));
  const canReply = can(admin.role, "ticket.reply");

  return (
    <div className="space-y-6">
      <Link href="/admin/tickets" className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft size={14} /> 客服
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">
          #{String(topic.id)} {subject}
        </h1>
        <TBadge status={status} />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4">
          <Card className="p-4 sm:p-6">
            <TicketThread
              mine="ADMIN"
              locale="zh-TW"
              messages={messages.map((m) => ({
                ...m,
                authorName: m.authorType === "ADMIN" ? (staff.get(m.authorId?.toString() ?? "") ?? "客服") : (member?.email ?? "會員"),
              }))}
            />
          </Card>
          {canReply && (
            <Card className="p-4">
              <ActionForm action={ticketReplyAction} className="space-y-3">
                <input type="hidden" name="ticketId" value={String(topic.id)} />
                <Textarea name="body" rows={4} required placeholder="回覆內容（會以 Email 通知會員）" />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm text-muted">
                    <input type="checkbox" name="close" value="1" className="h-4 w-4" /> 回覆後結案
                  </label>
                  <SubmitButton>送出回覆</SubmitButton>
                </div>
              </ActionForm>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          {member && (
            <Card>
              <CardHeader
                title="會員"
                action={
                  <Link href={`/admin/members/${member.id}`} className="text-sm text-accent hover:underline">
                    會員頁面
                  </Link>
                }
              />
              <div className="px-5">
                <DefinitionList
                  items={[
                    { label: "Email", value: member.email },
                    { label: "姓名", value: legacyName(member) ?? "—" },
                    { label: "實名", value: <IBadge status={member.identityStatus} /> },
                  ]}
                />
              </div>
            </Card>
          )}
          {canReply && (
            <form action={ticketStatusAction.bind(null, String(topic.id), status === "CLOSED" ? "OPEN" : "CLOSED")}>
              <button className="h-9 w-full rounded-lg border border-border bg-surface text-sm hover:bg-surface-2">{status === "CLOSED" ? "重新開啟" : "結案"}</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
