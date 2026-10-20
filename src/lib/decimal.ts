// 前端用的簡易十進位運算（以 BigInt 固定 16 位小數），避免浮點誤差

const SCALE = 16;
const F = 10n ** BigInt(SCALE);

export function parseUnits(s: string): bigint | null {
  const v = s.trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(v) && !/^\d+\.$/.test(v)) return null;
  const [i, f = ""] = v.split(".");
  return BigInt(i) * F + BigInt((f + "0".repeat(SCALE)).slice(0, SCALE) || "0");
}

export function formatUnits(u: bigint): string {
  const neg = u < 0n;
  const a = neg ? -u : u;
  const i = a / F;
  const f = (a % F).toString().padStart(SCALE, "0").replace(/0+$/, "");
  return (neg ? "-" : "") + i.toString() + (f ? "." + f : "");
}

export function decimals(s: string): number {
  const f = s.trim().split(".")[1];
  return f ? f.length : 0;
}

/** 截斷到 dp 位小數 */
export function truncate(u: bigint, dp: number): bigint {
  const step = 10n ** BigInt(SCALE - dp);
  return (u / step) * step;
}
