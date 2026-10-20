/**
 * 唯讀診斷：檢查某個帳號為何無法登入（不會修改任何資料，也不會印出密碼或雜湊）
 *   npm run check:login -- someone@example.com
 * 執行後輸入密碼（輸入時不顯示）。
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import pg from "pg";

const email = (process.argv[2] ?? "").trim();
if (!email) {
  console.error("用法：npm run check:login -- <email>");
  process.exit(1);
}

function askHidden(q: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(q);
    const stdin = process.stdin;
    let buf = "";
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === "\r" || c === "\n") {
          stdin.setRawMode?.(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          return resolve(buf);
        }
        if (c === "\u0003") process.exit(130);
        if (c === "\u007f") buf = buf.slice(0, -1);
        else buf += c;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const password = await askHidden("密碼：");
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await c.query("BEGIN READ ONLY");

  const ids = await c.query(
    `SELECT id, email, password_digest, is_active, retry_count, is_locked, locked_at, last_verify_at, created_at
       FROM identities WHERE lower(email) = lower($1) ORDER BY id`,
    [email],
  );
  console.log(`\nidentities 符合 ${ids.rowCount} 筆（多筆時新系統會採用密碼相符的那一筆）`);
  for (const r of ids.rows) {
    const d: string = r.password_digest ?? "";
    let match: string;
    try {
      match = d ? String(await bcrypt.compare(password, d)) : "（無密碼）";
    } catch (e) {
      match = `比對失敗：${(e as Error).message}`;
    }
    const members = await c.query("SELECT id, email, disabled FROM members WHERE identity_id = $1", [r.id]);
    console.log(
      [
        `- identity #${r.id} email="${r.email}"`,
        `  雜湊格式：${d.slice(0, 7) || "—"}（長度 ${d.length}，正常 bcrypt 為 $2a$10$ 開頭、長度 60）`,
        `  密碼比對：${match}`,
        `  is_active=${r.is_active} retry_count=${r.retry_count} is_locked=${r.is_locked} locked_at=${r.locked_at?.toISOString?.() ?? r.locked_at}`,
        `  last_verify_at=${r.last_verify_at?.toISOString?.() ?? "—"} created_at=${r.created_at?.toISOString?.() ?? "—"}`,
        `  對應會員（members.identity_id）：${members.rows.map((m) => `#${m.id} ${m.email} disabled=${m.disabled}`).join("、") || "無"}`,
      ].join("\n"),
    );
  }
  const byEmail = await c.query("SELECT id, email, identity_id, disabled FROM members WHERE lower(email) = lower($1) ORDER BY id", [email]);
  console.log(`\nmembers 以 Email 符合 ${byEmail.rowCount} 筆：${byEmail.rows.map((m) => `#${m.id} identity_id=${m.identity_id} disabled=${m.disabled}`).join("、") || "無"}`);
  await c.query("ROLLBACK");
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
