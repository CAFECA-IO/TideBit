export type AdminRole = "SUPER" | "OPERATOR" | "SUPPORT" | "AUDITOR";

export type Permission =
  | "withdraw.review" // 核准 / 退回
  | "withdraw.process" // 出款、回填 txid
  | "identity.review"
  | "ticket.reply"
  | "member.view"
  | "member.edit" // 停權、禁止提領、寄送訊息
  | "member.note"
  | "currency.edit"
  | "settings.edit"
  | "audit.view"
  | "aml.manage" // 洗錢防制名單與參數
  | "admin.manage"; // 指派管理員

const ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  SUPER: ["withdraw.review", "withdraw.process", "identity.review", "ticket.reply", "member.view", "member.edit", "member.note", "currency.edit", "settings.edit", "audit.view", "aml.manage", "admin.manage"],
  OPERATOR: ["withdraw.review", "withdraw.process", "identity.review", "ticket.reply", "member.view", "member.edit", "member.note", "audit.view", "aml.manage"],
  SUPPORT: ["ticket.reply", "member.view", "member.note"],
  AUDITOR: ["member.view", "audit.view"],
};

export function can(role: AdminRole, p: Permission) {
  return ROLE_PERMISSIONS[role].includes(p);
}

export const ROLES: AdminRole[] = ["SUPER", "OPERATOR", "SUPPORT", "AUDITOR"];
export function isRole(v: unknown): v is AdminRole {
  return typeof v === "string" && (ROLES as string[]).includes(v);
}
