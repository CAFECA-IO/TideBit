import Link from "next/link";
import { LifeBuoy, Plus } from "lucide-react";
import { Badge, ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { requireMember } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { splitContent, ticketStatus } from "@/lib/tickets";

export const metadata = { title: "Support" };

export default async function SupportList() {
  const { member } = await requireMember();
  const { t, locale } = await getI18n();
  const topics = await db.ticketTopic.findMany({ where: { authorId: member.id }, orderBy: { id: "desc" }, take: 100 });
  return (
    <>
      <PageHeader
        title={t("support.title")}
        action={
          <ButtonLink href="/app/support/new">
            <Plus size={16} /> {t("support.new")}
          </ButtonLink>
        }
      />
      <Card>
        {topics.length === 0 ? (
          <EmptyState icon={<LifeBuoy size={32} />} title={t("support.empty")} />
        ) : (
          <ul className="divide-y divide-border">
            {topics.map((tk) => {
              const status = ticketStatus(tk.state);
              return (
                <li key={String(tk.id)}>
                  <Link href={`/app/support/${tk.id}`} className="flex flex-wrap items-center gap-3 px-5 py-4 hover:bg-surface-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{splitContent(tk.content).subject}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        #{String(tk.id)} · {t("support.updated")} {fmtDateTime(tk.lastReplyAt ?? tk.updatedAt, locale)}
                      </p>
                    </div>
                    <Badge tone={status === "ANSWERED" ? "accent" : status === "OPEN" ? "warning" : "neutral"}>{t(`support.status.${status}`)}</Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
