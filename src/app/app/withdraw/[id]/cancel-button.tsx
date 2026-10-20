"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import { cancelWithdrawAction } from "../../actions";

export function CancelWithdrawButton({ id }: { id: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <Button
        variant="secondary"
        className="text-danger"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(t("withdraw.cancelConfirm"))) return;
          start(async () => {
            const r = await cancelWithdrawAction(id);
            if (r.ok) router.refresh();
            else setError(r.error);
          });
        }}
      >
        {t("withdraw.cancel")}
      </Button>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
