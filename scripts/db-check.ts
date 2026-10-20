/**
 * 唯讀檢查：確認既有資料庫可供新系統使用（不會修改任何資料或結構）
 *   npm run db:check
 *
 * 檢查項目：
 *   1. 新系統用到的資料表與欄位是否存在
 *   2. 會新增資料的資料表，其 id 序號是否落後於現有最大 id（轉檔後常見，會導致新增失敗）
 *   3. accounts.currency 是否都能在 asset_bases 找到對應幣種
 *   4. ADMINS、APP_ORIGIN、SESSION_SECRET 等設定
 */
import "dotenv/config";
import fs from "node:fs";
import pg from "pg";

const REQUIRED: Record<string, string[]> = {
  members: ["id", "sn", "email", "identity_id", "name", "disabled", "disable_withdraw", "created_at"],
  identities: ["id", "email", "password_digest", "retry_count", "is_locked", "locked_at", "last_verify_at"],
  id_documents: ["id", "member_id", "name", "aasm_state"],
  authentications: ["id", "provider", "uid", "token", "secret", "member_id", "nickname", "created_at"],
  asset_bases: ["id", "key", "reference", "name", "precision", "is_fiat", "explorer_url"],
  asset_tokens: ["id", "asset_key", "token_type"],
  accounts: ["id", "member_id", "currency", "balance", "locked"],
  account_versions: ["id", "member_id", "account_id", "reason", "balance", "locked", "fee", "amount", "modifiable_id", "modifiable_type", "currency", "fun"],
  deposits: ["id", "member_id", "currency", "amount", "txid", "aasm_state"],
  withdraws: ["id", "member_id", "sn", "amount", "account_id", "fee", "fee_account_id", "fund_uid", "fund_extra", "txid", "aasm_state", "sum", "type", "memo", "currency"],
  fund_sources: ["id", "member_id", "currency", "extra", "uid", "deleted_at"],
  orders: ["id", "currency", "price", "volume", "origin_volume", "state", "type", "member_id", "ord_type"],
  trades: ["id", "price", "volume", "currency", "ask_member_id", "bid_member_id", "funds"],
  ticket_topics: ["id", "author_id", "content", "state", "last_reply_at"],
  ticket_comments: ["id", "topic_id", "author_id", "content"],
  active_admin_comments: ["id", "namespace", "body", "resource_id", "resource_type", "author_id"],
  audit_logs: ["id", "type", "operator_id", "auditable_id", "auditable_type", "source_state", "target_state"],
  versions: ["id", "item_type", "item_id", "event", "whodunnit", "object"],
  system_configs: ["id", "key_1", "key_2", "key_3", "key_4", "key_5", "key_6", "data_type", "input_type", "value"],
  announcements: ["id", "text", "link", "is_active", "lang", "platform"],
};

// 新系統會新增資料列的資料表
const INSERTS = ["withdraws", "account_versions", "authentications", "fund_sources", "ticket_topics", "ticket_comments", "active_admin_comments", "audit_logs", "versions", "system_configs", "announcements"];

let problems = 0;
const ok = (s: string) => console.log(`  ✓ ${s}`);
const bad = (s: string) => {
  problems++;
  console.log(`  ✗ ${s}`);
};
const warn = (s: string) => console.log(`  ! ${s}`);

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("SET TRANSACTION READ ONLY").catch(() => {});
  await client.query("BEGIN READ ONLY");

  console.log("1. 資料表與欄位");
  const cols = await client.query<{ table_name: string; column_name: string }>(
    "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema()",
  );
  const have = new Map<string, Set<string>>();
  for (const r of cols.rows) {
    if (!have.has(r.table_name)) have.set(r.table_name, new Set());
    have.get(r.table_name)!.add(r.column_name);
  }
  for (const [t, cs] of Object.entries(REQUIRED)) {
    const h = have.get(t);
    if (!h) bad(`缺少資料表 ${t}`);
    else {
      const missing = cs.filter((c) => !h.has(c));
      if (missing.length) bad(`${t} 缺少欄位：${missing.join(", ")}`);
    }
  }
  if (problems === 0) ok(`${Object.keys(REQUIRED).length} 張資料表的欄位都存在`);

  console.log("\n2. id 序號（新增資料用）");
  const fixes: string[] = [];
  for (const t of INSERTS) {
    if (!have.has(t)) continue;
    const seq = (await client.query<{ s: string | null }>("SELECT pg_get_serial_sequence($1, 'id') AS s", [t])).rows[0]?.s;
    if (!seq) {
      bad(`${t}.id 沒有序號（無法自動產生 id）`);
      continue;
    }
    const max = BigInt((await client.query<{ m: string | null }>(`SELECT MAX(id)::text AS m FROM "${t}"`)).rows[0]?.m ?? "0");
    const s = (await client.query<{ last_value: string; is_called: boolean }>(`SELECT last_value::text, is_called FROM ${seq}`)).rows[0];
    const next = BigInt(s.last_value) + (s.is_called ? 1n : 0n);
    if (next <= max) {
      bad(`${t}：序號下一個值 ${next} ≤ 目前最大 id ${max}，新增資料會失敗`);
      fixes.push(`SELECT setval('${seq}', (SELECT MAX(id) FROM "${t}"));`);
    } else ok(`${t}（下一個 id ${next}，最大 ${max}）`);
  }

  console.log("\n3. 幣種對應");
  const unknown = await client.query<{ currency: string; n: string }>(
    "SELECT a.currency::text, COUNT(*)::text AS n FROM accounts a LEFT JOIN asset_bases b ON b.id = a.currency WHERE b.id IS NULL GROUP BY a.currency ORDER BY a.currency",
  );
  if (unknown.rows.length === 0) ok("所有 accounts.currency 都對得到 asset_bases.id");
  else if (process.env.COINS_FILE) warn(`有 ${unknown.rows.length} 個幣種 id 不在 asset_bases，將以 COINS_FILE（${process.env.COINS_FILE}）對應`);
  else bad(`accounts.currency 有 ${unknown.rows.length} 個 id 不在 asset_bases：${unknown.rows.map((r) => `${r.currency}(${r.n} 筆)`).join(", ")}。請設定 COINS_FILE 指向舊系統正式環境的 coins.yml`);
  const nonEmpty = await client.query<{ n: string }>("SELECT COUNT(DISTINCT currency)::text AS n FROM accounts WHERE balance > 0 OR locked > 0");
  ok(`有餘額的幣種：${nonEmpty.rows[0].n} 種`);

  console.log("\n4. 環境設定");
  const admins = (process.env.ADMINS ?? "").split(",").filter((x) => x.includes("@"));
  if (admins.length === 0) bad("ADMINS 未設定（格式：email:SUPER,email2:OPERATOR）");
  else {
    for (const a of admins) {
      const email = a.split(":")[0].trim();
      const r = await client.query("SELECT 1 FROM identities WHERE lower(email) = lower($1)", [email]);
      if (r.rowCount) ok(`管理員 ${a.trim()}`);
      else bad(`管理員 ${email} 在 identities 找不到登入帳號`);
    }
  }
  const origins = process.env.APP_ORIGINS || process.env.APP_ORIGIN;
  if (origins) ok(`網站網址 ${origins}`);
  else warn("APP_ORIGINS 未設定，使用預設 https://legacy.tidebit-defi.com、https://tidebit.com");
  if ((process.env.SESSION_SECRET ?? "").length < 32) bad("SESSION_SECRET 未設定或少於 32 字元");
  const mf = process.env.MARKETS_FILE || "config/markets.yml";
  if (fs.existsSync(mf)) ok(`市場設定 ${mf}`);
  else warn(`找不到市場設定 ${mf}（委託與成交只會顯示市場代碼）`);

  await client.query("ROLLBACK");
  await client.end();

  console.log("");
  if (fixes.length) {
    console.log("序號落後的修正 SQL（只調整序號，不改變資料表結構；請確認後由 DBA 執行）：\n");
    console.log(fixes.join("\n") + "\n");
  }
  console.log(problems ? `發現 ${problems} 個問題` : "全部檢查通過");
  process.exit(problems ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
