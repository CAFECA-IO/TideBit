"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui";
import { useI18n } from "@/i18n/client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  useEffect(() => console.error(error), [error]);
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-lg font-semibold">{error.message === "FORBIDDEN" ? t("common.forbidden") : t("common.error")}</p>
      {error.digest && <p className="font-mono text-xs text-muted">{error.digest}</p>}
      <Button variant="secondary" onClick={reset}>
        {t("common.back")}
      </Button>
    </div>
  );
}
