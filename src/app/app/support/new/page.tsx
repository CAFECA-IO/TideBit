import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { requireMember } from "@/lib/auth";
import { str } from "@/lib/queries";
import { createTicketAction } from "../../actions";

export default async function NewTicket({ searchParams }: PageProps<"/app/support/new">) {
  const sp = await searchParams;
  await requireMember();
  const { t } = await getI18n();
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/app/support" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft size={14} /> {t("support.title")}
      </Link>
      <PageHeader title={t("support.new")} />
      <Card className="p-5 sm:p-6">
        <ActionForm action={createTicketAction} className="space-y-4">
          <Field label={t("support.subject")} htmlFor="subject">
            <Input id="subject" name="subject" required maxLength={120} defaultValue={str(sp.subject).slice(0, 120)} />
          </Field>
          <Field label={t("support.message")} htmlFor="body">
            <Textarea id="body" name="body" required maxLength={5000} rows={6} placeholder={t("support.messagePlaceholder")} />
          </Field>
          <div className="flex justify-end">
            <SubmitButton>{t("support.send")}</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
