import "server-only";
import bcrypt from "bcryptjs";

// 舊系統（Rails has_secure_password）使用 bcrypt，雜湊可直接沿用
const DUMMY = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8Z8Jxq1rG9Ywq2nOsl0V2a9qkC1R5e";

export async function verifyPassword(password: string, hash: string | null | undefined) {
  if (!hash) {
    await bcrypt.compare(password, DUMMY); // 固定耗時，避免以回應時間探測帳號
    return false;
  }
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export function isStrongPassword(p: string) {
  return p.length >= 8 && p.length <= 72 && /[A-Za-z]/.test(p) && /\d/.test(p);
}
