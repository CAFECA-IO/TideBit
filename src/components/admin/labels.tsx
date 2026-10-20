import { Badge } from "@/components/ui";
import type { AdminRole } from "@/lib/roles";
import type { IdentityStatus } from "@/lib/members";
import type { TicketStatus } from "@/lib/tickets";
import { stateOf, type WithdrawState } from "@/lib/withdraw";

export const ROLE_LABEL: Record<AdminRole, string> = { SUPER: "超級管理員", OPERATOR: "營運", SUPPORT: "客服", AUDITOR: "稽核（唯讀）" };

export const W_LABEL: Record<WithdrawState, string> = {
  SUBMITTED: "待審核",
  APPROVED: "已核准・待出款",
  PROCESSING: "出款中",
  DONE: "已完成",
  REJECTED: "已退回",
  CANCELED: "已取消",
  FAILED: "出款異常",
  OTHER: "其他",
};
const W_TONE: Record<WithdrawState, "neutral" | "info" | "success" | "warning" | "danger"> = {
  SUBMITTED: "warning",
  APPROVED: "info",
  PROCESSING: "info",
  DONE: "success",
  REJECTED: "danger",
  CANCELED: "neutral",
  FAILED: "danger",
  OTHER: "neutral",
};

/** aasm 為舊系統 aasm_state 原始值 */
export function WBadge({ aasm }: { aasm: string | null }) {
  const s = stateOf(aasm);
  return <Badge tone={W_TONE[s]}>{s === "OTHER" ? `其他（${aasm ?? "—"}）` : W_LABEL[s]}</Badge>;
}

export const I_LABEL: Record<IdentityStatus, string> = { UNBOUND: "未綁定", PENDING_REVIEW: "待審核", VERIFIED: "已驗證", REJECTED: "未通過" };
const I_TONE: Record<IdentityStatus, "neutral" | "warning" | "success" | "danger"> = { UNBOUND: "neutral", PENDING_REVIEW: "warning", VERIFIED: "success", REJECTED: "danger" };
export function IBadge({ status }: { status: IdentityStatus }) {
  return <Badge tone={I_TONE[status]}>{I_LABEL[status]}</Badge>;
}

export const FLAG_LABEL: Record<string, string> = {
  NAME_MISMATCH: "姓名不符",
  NO_LEGAL_NAME: "未提供證件姓名",
  NO_LEGACY_NAME: "舊系統無姓名",
  DUPLICATE_IDENTITY: "同一身分綁定多個帳號",
  MANUAL_REVIEW: "人工審核模式",
};

export const T_LABEL: Record<TicketStatus, string> = { OPEN: "待回覆", ANSWERED: "已回覆", CLOSED: "已結案" };
export function TBadge({ status }: { status: TicketStatus }) {
  return <Badge tone={status === "OPEN" ? "warning" : status === "ANSWERED" ? "accent" : "neutral"}>{T_LABEL[status]}</Badge>;
}
