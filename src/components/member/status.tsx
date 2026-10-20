import { Check } from "lucide-react";
import clsx from "clsx";
import { Badge } from "@/components/ui";
import type { T } from "@/i18n/server";
import type { IdentityStatus } from "@/lib/members";
import { stateOf, type WithdrawState } from "@/lib/withdraw";

const W_TONE: Record<WithdrawState, "neutral" | "info" | "success" | "warning" | "danger" | "accent"> = {
  SUBMITTED: "warning",
  APPROVED: "info",
  PROCESSING: "info",
  DONE: "success",
  REJECTED: "danger",
  CANCELED: "neutral",
  FAILED: "danger",
  OTHER: "neutral",
};

/** aasm 為舊系統 aasm_state */
export function WithdrawBadge({ aasm, t }: { aasm: string | null; t: T }) {
  const s = stateOf(aasm);
  return <Badge tone={W_TONE[s]}>{s === "OTHER" ? (aasm ?? "—") : t(`withdraw.state.${s}`)}</Badge>;
}

const I_TONE: Record<IdentityStatus, "neutral" | "warning" | "success" | "danger"> = {
  UNBOUND: "neutral",
  PENDING_REVIEW: "warning",
  VERIFIED: "success",
  REJECTED: "danger",
};

export function IdentityBadge({ status, t }: { status: IdentityStatus; t: T }) {
  return <Badge tone={I_TONE[status]}>{t(`identity.status.${status}`)}</Badge>;
}

/** 登入 → 綁定 → 審核 → 可提領 */
export function IdentityProgress({ status, t }: { status: IdentityStatus; t: T }) {
  const done = { UNBOUND: 1, REJECTED: 1, PENDING_REVIEW: 2, VERIFIED: 4 }[status];
  const steps = [t("identity.steps.login"), t("identity.steps.bind"), t("identity.steps.review"), t("identity.steps.withdraw")];
  return (
    <ol className="flex items-center gap-2">
      {steps.map((s, i) => {
        const complete = i < done;
        const current = i === done;
        return (
          <li key={i} className="flex flex-1 items-center gap-2 last:flex-none">
            <span className="flex items-center gap-2">
              <span
                className={clsx(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  complete ? "bg-brand-gradient text-white" : current ? "border-2 border-brand-blue text-brand-blue" : "border border-border text-muted",
                )}
              >
                {complete ? <Check size={14} /> : i + 1}
              </span>
              <span className={clsx("hidden text-sm sm:inline", complete || current ? "font-medium" : "text-muted")}>{s}</span>
            </span>
            {i < steps.length - 1 && <span className={clsx("h-px flex-1", complete ? "bg-brand-teal" : "bg-border")} />}
          </li>
        );
      })}
    </ol>
  );
}
