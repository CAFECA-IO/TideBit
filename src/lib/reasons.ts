import type { DictKey } from "@/i18n/dict/zh-TW";

// 舊系統 AccountVersion::REASON_CODES
export const REASON = {
  FIX: 1,
  STRIKE_FEE: 100,
  STRIKE_ADD: 110,
  STRIKE_SUB: 120,
  STRIKE_UNLOCK: 130,
  ORDER_SUBMIT: 600,
  ORDER_CANCEL: 610,
  ORDER_FULLFILLED: 620,
  WITHDRAW_LOCK: 800,
  WITHDRAW_UNLOCK: 810,
  WITHDRAW_FEE_LOCK: 820,
  WITHDRAW_FEE_UNLOCK: 830,
  WITHDRAW_REFUND: 840,
  WITHDRAW_FEE_REFUND: 850,
  DEPOSIT: 1000,
  INTEREST: 1001,
  WITHDRAW: 2000,
  WITHDRAW_FEE: 2001,
  REFUND: 3001,
  GIFT: 3005,
  MANUAL_LOCK: 7001,
  MANUAL_UNLOCK: 7002,
} as const;

const MAP: Record<number, DictKey> = {
  1: "reason.fix",
  100: "reason.strike_fee",
  110: "reason.strike_add",
  120: "reason.strike_sub",
  130: "reason.strike_unlock",
  600: "reason.order_submit",
  610: "reason.order_cancel",
  620: "reason.order_fullfilled",
  800: "reason.withdraw_lock",
  810: "reason.withdraw_unlock",
  820: "reason.withdraw_lock",
  830: "reason.withdraw_unlock",
  840: "reason.withdraw_unlock",
  850: "reason.withdraw_unlock",
  1000: "reason.deposit",
  1001: "reason.interest",
  2000: "reason.withdraw",
  2001: "reason.withdraw_fee",
  3001: "reason.refund",
  3005: "reason.gift",
  7001: "reason.manual",
  7002: "reason.manual",
};

export function reasonKey(code: number | bigint | null | undefined): DictKey {
  return MAP[Number(code ?? -1)] ?? "reason.other";
}
