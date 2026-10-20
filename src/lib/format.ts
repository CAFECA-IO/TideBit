// 前後端共用的格式化工具（數量一律以字串傳遞，避免浮點誤差）

type DecimalLike = { toFixed(dp?: number): string } | string | number | null | undefined;

function toPlain(v: DecimalLike): string {
  if (v === null || v === undefined) return "0";
  if (typeof v === "string") return v;
  if (typeof v === "number") return v.toString();
  return v.toFixed();
}

/** 截斷（不四捨五入）到指定位數，並以千分位分隔；trim=true 時去掉多餘的 0 */
export function fmtAmount(v: DecimalLike, dp = 8, opts: { trim?: boolean; sign?: boolean } = {}): string {
  const { trim = true, sign = false } = opts;
  let s = toPlain(v).trim();
  let neg = false;
  if (s.startsWith("-")) {
    neg = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  if (/e/i.test(s)) s = Number(s).toFixed(Math.min(dp + 2, 20));
  let [int, frac = ""] = s.split(".");
  int = int.replace(/^0+(?=\d)/, "") || "0";
  frac = frac.slice(0, dp).padEnd(dp, "0");
  if (trim) frac = frac.replace(/0+$/, "");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const isZero = /^0*$/.test(int + frac);
  const prefix = neg && !isZero ? "−" : sign && !isZero ? "+" : "";
  return prefix + grouped + (frac ? "." + frac : "");
}

export function isZeroAmount(v: DecimalLike): boolean {
  return /^-?0*(\.0*)?$/.test(toPlain(v));
}

export function fmtDateTime(d: Date | string | null | undefined, locale = "zh-TW"): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Taipei",
  }).format(date);
}

export function fmtDate(d: Date | string | null | undefined, locale = "zh-TW"): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Taipei" }).format(date);
}

export function shortAddr(a: string | null | undefined, head = 8, tail = 6): string {
  if (!a) return "—";
  return a.length <= head + tail + 1 ? a : `${a.slice(0, head)}…${a.slice(-tail)}`;
}

export function explorerUrl(template: string | null | undefined, kind: "txid" | "address", value: string | null | undefined) {
  if (!template || !value) return null;
  return template.replace(`{${kind}}`, encodeURIComponent(value)).replace(`#{${kind}}`, encodeURIComponent(value));
}

/** 姓名比對：去除空白、標點與大小寫差異 */
export function normalizeName(s: string | null | undefined): string {
  return (s ?? "").normalize("NFKC").toLowerCase().replace(/[\s·・.,，、'’\-_]/g, "");
}
