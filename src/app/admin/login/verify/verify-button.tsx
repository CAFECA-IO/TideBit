"use client";

import { useRouter } from "next/navigation";
import { CafecaButton } from "@/components/cafeca-button";
import { completeAdminVerifyAction, startAdminVerifyAction } from "../actions";

export function AdminVerifyButton({ wallet, mock }: { wallet: string; mock: boolean }) {
  const router = useRouter();
  return (
    <CafecaButton
      wallet={wallet}
      mock={mock}
      size="md"
      getRequest={startAdminVerifyAction}
      onResponse={async (res) => {
        const r = await completeAdminVerifyAction(res);
        if (r.ok) router.replace("/admin");
        return r;
      }}
    >
      以 CAFECA 簽署
    </CafecaButton>
  );
}
