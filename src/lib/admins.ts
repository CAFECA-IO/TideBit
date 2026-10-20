import "server-only";
import { db } from "./db";
import { env } from "./env";
import { CAFECA_ADMIN_PROVIDER } from "./members";
import { isRole, type AdminRole } from "./roles";
import { CONFIG_NS } from "./settings";

/**
 * 管理員名單有兩個來源：
 *  1. 環境變數 ADMINS（初始／緊急用，後台無法修改，優先權最高）
 *  2. 超級管理員在後台指派，存於既有的 system_configs（key_1 = "tidebit", key_2 = "admin", key_3 = 會員 ID）
 * 不新增資料表、不變更結構。
 */
const KEY2 = "admin";

type Stored = { role: AdminRole; by?: string; at?: number };

export type AdminEntry = {
  memberId: bigint | null;
  email: string;
  name: string | null;
  role: AdminRole;
  source: "env" | "db";
  assignedBy: string | null;
  assignedAt: Date | null;
  disabled: boolean;
  cafecaBound: boolean;
};

const where = (memberId: bigint) => ({ key1_key2_key3_key4_key5_key6: { key1: CONFIG_NS, key2: KEY2, key3: memberId.toString(), key4: "", key5: "", key6: "" } });

function parse(v: string | null): Stored | null {
  try {
    const s = JSON.parse(v ?? "") as Stored;
    return isRole(s.role) ? s : null;
  } catch {
    return null;
  }
}

/** 角色查詢：ADMINS 環境變數優先，其次為後台指派 */
export async function roleOf(m: { id: bigint; email: string }): Promise<AdminRole | null> {
  const fromEnv = env.admins.get(m.email.toLowerCase());
  if (fromEnv) return fromEnv;
  const r = await db.systemConfig.findUnique({ where: where(m.id) });
  return r ? (parse(r.value)?.role ?? null) : null;
}

export async function listAdmins(): Promise<AdminEntry[]> {
  const rows = await db.systemConfig.findMany({ where: { key1: CONFIG_NS, key2: KEY2 } });
  const dbEntries = rows
    .map((r) => ({ id: /^\d+$/.test(r.key3) ? BigInt(r.key3) : null, s: parse(r.value), updatedAt: r.updatedAt }))
    .filter((x): x is { id: bigint; s: Stored; updatedAt: Date | null } => !!x.id && !!x.s);
  const envEmails = [...env.admins.keys()];
  const members = await db.member.findMany({
    where: { OR: [{ id: { in: dbEntries.map((x) => x.id) } }, { email: { in: envEmails, mode: "insensitive" } }] },
    select: { id: true, email: true, nickname: true, name: true, disabled: true },
  });
  const bound = new Set(
    (await db.authentication.findMany({ where: { provider: CAFECA_ADMIN_PROVIDER, memberId: { in: members.map((m) => m.id) } }, select: { memberId: true } })).map((a) => String(a.memberId)),
  );
  const byId = new Map(members.map((m) => [m.id.toString(), m]));
  const byEmail = new Map(members.map((m) => [(m.email ?? "").toLowerCase(), m]));
  const out: AdminEntry[] = [];
  for (const [email, role] of env.admins) {
    const m = byEmail.get(email);
    out.push({ memberId: m?.id ?? null, email, name: m?.nickname || m?.name || null, role, source: "env", assignedBy: "ADMINS", assignedAt: null, disabled: !!m?.disabled, cafecaBound: !!m && bound.has(m.id.toString()) });
  }
  for (const x of dbEntries) {
    const m = byId.get(x.id.toString());
    const email = (m?.email ?? "").toLowerCase();
    if (env.admins.has(email)) continue; // 環境變數優先
    out.push({
      memberId: x.id,
      email: email || `#${x.id}`,
      name: m?.nickname || m?.name || null,
      role: x.s.role,
      source: "db",
      assignedBy: x.s.by ?? null,
      assignedAt: x.s.at ? new Date(x.s.at) : x.updatedAt,
      disabled: !m || !!m.disabled,
      cafecaBound: bound.has(x.id.toString()),
    });
  }
  const order: Record<AdminRole, number> = { SUPER: 0, OPERATOR: 1, SUPPORT: 2, AUDITOR: 3 };
  return out.sort((a, b) => order[a.role] - order[b.role] || a.email.localeCompare(b.email));
}

export async function setAdminRole(memberId: bigint, role: AdminRole, by: string) {
  const now = new Date();
  const value = JSON.stringify({ role, by, at: now.getTime() } satisfies Stored);
  await db.systemConfig.upsert({
    where: where(memberId),
    create: {
      key1: CONFIG_NS, key2: KEY2, key3: memberId.toString(), key4: "", key5: "", key6: "",
      description: "TideBit 管理員角色", isReadonly: 0, isVisible: 0, dataType: "json", inputType: "text",
      value, createdAt: now, updatedAt: now,
    },
    update: { value, updatedAt: now },
  });
}

export async function removeAdmin(memberId: bigint) {
  await db.systemConfig.deleteMany({ where: { key1: CONFIG_NS, key2: KEY2, key3: memberId.toString() } });
}

/** 清除管理員的 CAFECA 第二因素綁定，下次登入時重新綁定 */
export async function resetAdminCafeca(memberId: bigint) {
  return (await db.authentication.deleteMany({ where: { provider: CAFECA_ADMIN_PROVIDER, memberId } })).count;
}
