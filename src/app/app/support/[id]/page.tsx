import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert, Badge, Card, Textarea } from "@/components/ui";
import { TicketThread } from "@/components/ticket-thread";
import { getI18n } from "@/i18n/server";
import { requireMember } from "@/lib/auth";
import { idParam } from "@/lib/queries";
import { loadThread } from "@/lib/tickets";
import { closeTicketAction, replyTicketAction } from "../../actions";

export default async function TicketPage({ params }: PageProps<"/app/support/[id]">) {
  const { id } = await params;
  const { member } = await requireMember();
  const { t, locale } = await getI18n();
  const thread = await loadThread(idParam(id));
  if (!thread || thread.topic.authorId !== member.id) notFound();
  const { topic, subject, status, messages } = thread;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/app/support" className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft size={14} /> {t("support.title")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{subject}</h1>
          <p className="mt-1 text-sm text-muted">#{String(topic.id)}</p>
        </div>
        <Badge tone={status === "ANSWERED" ? "accent" : status === "OPEN" ? "warning" : "neutral"}>{t(`support.status.${status}`)}</Badge>
      </div>

      <Card className="p-4 sm:p-6">
        <TicketThread
          mine="MEMBER"
          locale={locale}
          messages={messages.map((m) => ({ ...m, authorName: m.authorType === "MEMBER" ? t("support.you") : t("support.staff") }))}
        />
      </Card>

      {status === "CLOSED" ? (
        <Alert tone="neutral">{t("support.closed")}</Alert>
      ) : (
        <Card className="p-4">
          <ActionForm action={replyTicketAction} className="space-y-3">
            <input type="hidden" name="ticketId" value={String(topic.id)} />
            <Textarea name="body" required maxLength={5000} rows={3} placeholder={t("support.replyPlaceholder")} aria-label={t("support.reply")} />
            <div className="flex items-center justify-between gap-3">
              <button formAction={closeTicketAction.bind(null, String(topic.id))} formNoValidate className="text-sm text-muted hover:text-text">
                {t("support.closeTicket")}
              </button>
              <SubmitButton>{t("support.reply")}</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
