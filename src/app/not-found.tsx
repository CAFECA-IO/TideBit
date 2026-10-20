import { Mark } from "@/components/brand";
import { ButtonLink } from "@/components/ui";
import { getI18n } from "@/i18n/server";

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <Mark size={56} />
      <p className="text-5xl font-semibold text-brand-gradient">404</p>
      <p className="text-muted">{t("common.notFound")}</p>
      <ButtonLink href="/" variant="secondary">
        {t("common.backHome")}
      </ButtonLink>
    </div>
  );
}
