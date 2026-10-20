"use client";

import { useRouter } from "next/navigation";
import { CafecaButton } from "@/components/cafeca-button";
import { completeBindAction, startBindAction } from "../actions";

export function BindPanel({ wallet, mock, label }: { wallet: string; mock: boolean; label: string }) {
  const router = useRouter();
  return (
    <CafecaButton
      wallet={wallet}
      mock={mock}
      getRequest={startBindAction}
      onResponse={async (response) => {
        const r = await completeBindAction(response);
        if (r.ok) router.refresh();
        return r;
      }}
    >
      {label}
    </CafecaButton>
  );
}
