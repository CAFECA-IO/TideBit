"use client";

import { useRouter } from "next/navigation";
import { CafecaButton } from "@/components/cafeca-button";
import { useI18n } from "@/i18n/client";
import { completeCafecaLoginAction, startCafecaLoginAction } from "../../cafeca-login";

export function CafecaLoginButton({ wallet, mock }: { wallet: string; mock: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <CafecaButton
      wallet={wallet}
      mock={mock}
      getRequest={startCafecaLoginAction}
      onResponse={async (res) => {
        const r = await completeCafecaLoginAction(res);
        if (r.ok) router.replace("/login/continue");
        return r;
      }}
    >
      {t("auth.cafecaLogin")}
    </CafecaButton>
  );
}
