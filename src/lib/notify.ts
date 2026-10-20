import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { db, type Tx } from "./db";
import { env } from "./env";
import { siteOrigin } from "./session";

let transport: Transporter | null = null;

export async function sendMail(to: string, subject: string, text: string) {
  if (!env.smtp.url) {
    console.info(`[mail:dev] to=${to} subject=${subject}\n${text}`);
    return;
  }
  transport ??= nodemailer.createTransport(env.smtp.url);
  await transport.sendMail({ from: env.smtp.from, to, subject, text });
}

/** Email 通知會員（舊資料庫沒有站內通知表；寄信失敗不影響主流程） */
export async function notifyMember(p: { memberId: bigint; title: string; body?: string; link?: string }, tx: Tx | typeof db = db) {
  const m = await tx.member.findUnique({ where: { id: p.memberId }, select: { email: true } });
  if (!m?.email) return;
  const link = p.link ? `\n\n${await siteOrigin()}${p.link}` : "";
  sendMail(m.email, `[TideBit] ${p.title}`, `${p.body ?? p.title}${link}`).catch((e) => console.error("[mail]", e));
}

/** 操作紀錄：寫入既有的 versions 表（item_type = "TideBit"） */
export const AUDIT_ITEM_TYPE = "TideBit";

export async function audit(
  p: {
    actorType: "MEMBER" | "ADMIN" | "SYSTEM";
    actorId?: bigint | number | null;
    actorName?: string | null;
    action: string;
    targetType?: string;
    targetId?: string | number | bigint;
    data?: unknown;
    ip?: string | null;
  },
  tx: Tx | typeof db = db,
) {
  const run = async () => {
    const targetNum = p.targetId !== undefined && /^\d+$/.test(String(p.targetId)) ? BigInt(String(p.targetId)) : 0n;
    await tx.version.create({
      data: {
        itemType: AUDIT_ITEM_TYPE,
        itemId: targetNum,
        event: p.action.slice(0, 255),
        whodunnit: `${p.actorType}:${p.actorId ?? ""}:${p.actorName ?? ""}`.slice(0, 255),
        object: JSON.stringify(
          { target: p.targetType ? `${p.targetType}#${p.targetId ?? ""}` : undefined, ip: p.ip ?? undefined, data: p.data },
          (_, v) => (typeof v === "bigint" ? v.toString() : v),
        ),
        createdAt: new Date(),
      },
    });
  };
  // 不在交易內（例如登入紀錄）時，寫入失敗只記 log，不中斷主流程；
  // 在交易內（提領、綁定）時照常拋出，讓整筆交易回滾。
  if (tx !== db) return run();
  try {
    await run();
  } catch (e) {
    console.error(`[audit] 寫入 versions 失敗（${p.action}）。若為 Unique constraint，請執行 npm run db:check 修正序號。`, (e as Error).message);
  }
}
