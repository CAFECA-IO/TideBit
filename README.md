# TideBit（結束營運版）

TideBit 交易所已停止交易與入金。本專案以 **Next.js 16 + Prisma 7** 重構，**直接使用舊系統（Peatio）轉成 PostgreSQL 的既有資料庫**，只保留：

- 會員以原 Email／密碼登入（`identities`，bcrypt 沿用），查看資產、帳本、入金／提領／委託／成交紀錄（可匯出 CSV）
- 以 **Sign in with CAFECA** 綁定數位身分並完成實名（L2），系統自動比對舊系統已審核證件姓名
- **僅限加密貨幣**提領：會員以 CAFECA 簽署確認 → 管理員審核 → 另一位管理員人工出款並回填 txid
- 客服對話（`ticket_topics`／`ticket_comments`）與 Email 通知
- 管理後台：提領審核／出款、實名審核、會員管理、客服、幣種提領設定、系統設定、稽核紀錄
- 介面語系：繁中（台灣）、繁中（香港）、簡中、English、日本語、한국어（後台為繁中）

## ⚠️ 資料庫原則

- **不做任何 migration**：專案沒有 migration 檔，也沒有 `migrate`／`db push` 指令。`prisma/schema.prisma` 只是把既有資料表「對應」到程式。
- 程式只讀寫既有資料表的**資料列**，不建立、不修改任何資料表或欄位。
- 驗證 schema 對應是否正確（唯讀，只輸出比較結果，不會執行）：`npm run db:pull-check`，輸出中**不應出現** `CREATE TABLE` 或 `ADD COLUMN`。

### 新系統寫入的位置

| 用途 | 既有資料表 | 說明 |
| --- | --- | --- |
| 登入失敗鎖定、改密碼 | `identities` | `retry_count`、`is_locked`、`locked_at`、`password_digest` |
| CAFECA 綁定與實名狀態 | `authentications` | `provider = cafeca`；`uid` 身分地址、`nickname` 證件姓名、`token` pairwise_id、`secret` 狀態 JSON |
| 管理員 CAFECA 第二因素 | `authentications` | `provider = cafeca-admin` |
| 提領申請 | `withdraws` | `aasm_state` 沿用舊值：submitted → accepted → processing → done／rejected／canceled／failed |
| 資金凍結／出帳 | `accounts`、`account_versions` | 與舊系統相同的 reason（800／810／2000）與 fun 欄位 |
| 提領狀態歷程 | `audit_logs` | `type = Audit::TransferAuditLog`，`operator_id` 為操作者會員 id |
| 退回原因、內部備註、實名審核說明 | `active_admin_comments` | `resource_type` = Withdraw／Member／MemberIdentity |
| 地址簿 | `fund_sources` | |
| 客服 | `ticket_topics`、`ticket_comments` | topic 內容第一行為主旨；state = open／replied／closed |
| 系統與提領設定 | `system_configs` | `key_1 = tidebit`；`key_2` = settings／withdraw |
| 後台指派的管理員 | `system_configs` | `key_2 = admin`、`key_3` = 會員 ID、`value` = `{"role":…}` |
| 洗錢防制參數、內部黑名單 | `system_configs` | `key_2 = aml`、`key_3` = settings／blacklist |
| 公告 | `announcements` | `platform = tidebit-v2`、`lang` 為語系 |
| 操作紀錄（稽核） | `versions` | `item_type = TideBit` |

Session 與 CAFECA 一次性 nonce 使用簽章 cookie（`SESSION_SECRET`），不需要資料表；變更密碼後所有舊 session 自動失效。站內通知改為 Email。

## 開始使用

```bash
cp .env.example .env     # 設定 DATABASE_URL、APP_ORIGINS、SESSION_SECRET、ADMINS
npm install              # 會自動 prisma generate
npm run db:check         # 唯讀檢查：資料表／欄位、id 序號、幣種對應、管理員設定
npm run dev              # http://localhost:3000，後台 /admin
```

正式環境：`npm run build && npm start`。

### `npm run db:check`

唯讀檢查（交易設為 READ ONLY），會列出：

1. 新系統用到的資料表與欄位是否都存在
2. **id 序號是否落後**：從 MySQL 轉檔後，序號有時停在 1，新增提領、帳本、客服單時會因 id 重複而失敗。檢查會列出需要的 `setval` SQL（只調整序號，不改結構），請確認後由 DBA 執行
3. `accounts.currency` 是否都能對到 `asset_bases.id`；若對不上，請設定 `COINS_FILE` 指向舊系統正式環境的 `config/markets/coins.yml`
4. `ADMINS` 中的 Email 是否有登入帳號、`APP_ORIGINS`、`SESSION_SECRET`、市場設定檔

### 管理員

管理員以自己的 TideBit 會員帳密登入 `/admin`（production 會再要求 CAFECA 簽署，首次登入時綁定為第二因素）。角色來源有兩個：

1. `.env` 的 `ADMINS="email:角色,..."`：初始／緊急用，優先權最高，後台無法修改
2. 超級管理員在後台「管理員」頁以會員 Email 或 ID 指派、變更、移除，並可「重設 CAFECA」讓該管理員下次登入重新綁定第二因素。角色在每次請求時讀取，移除後立即失效；所有異動寫入稽核紀錄。

| 角色 | 權限 |
| --- | --- |
| SUPER | 全部，含幣種、系統設定與指派管理員 |
| OPERATOR | 提領核准／出款、實名審核、客服、會員管理、洗錢防制名單 |
| SUPPORT | 回覆客服、檢視會員、備註 |
| AUDITOR | 唯讀與稽核紀錄 |

### 幣種持有者

後台「幣種與提領設定」點選幣種後，預設顯示「持有用戶」：依（可用＋凍結）由多到少排序，含占比、負餘額統計與 Email／會員 ID 搜尋。點選會員可看到該幣種的帳本對帳（`account_versions` 變動量加總是否等於 `accounts` 餘額）、依帳本原因彙總的資金來源與去向，以及帳務明細、提領、入金、委託、成交。

### 提領風險與洗錢防制分析

提領詳情頁會自動分析（結果快取 5 分鐘，可按「重新分析」），判定「可放行／需人工確認／建議不放行」：

| 類別 | 檢查項目 |
| --- | --- |
| 制裁與黑名單 | 收款地址與姓名比對 OFAC SDN（含別名與加密貨幣地址）、內部黑名單（地址、會員、Email、姓名、CAFECA 身分） |
| 身分 | FATF 高風險／加強監控國家、CAFECA 實名、證件姓名與舊系統一致、同一 CAFECA 身分綁定多帳號、停權／禁止提領、提領簽署者 |
| 帳務 | 負餘額帳戶、帳本對帳、資金來源（入金、交易以外的人工調整／贈送占比） |
| 交易行為 | 大額（需幣種參考價格）、24 小時提領頻率、快進快出、提領前密碼重設或剛綁定 CAFECA |
| 收款地址 | 地址格式、是否被其他會員（含停權／黑名單帳號）使用、是否曾成功提領至此地址 |

「建議不放行」時仍可核准，但必須在核准備註填寫至少 10 字的覆核理由，備註會加上風險等級一併記錄。參數與黑名單在後台「洗錢防制」頁管理，該頁也提供手動篩查。

- OFAC 名單預設下載 `https://www.treasury.gov/ofac/downloads/sdn.csv` 與 `alt.csv`，記憶體快取 12 小時。伺服器無法連外時，可下載後以 `AML_OFAC_SDN_URL`／`AML_OFAC_ALT_URL` 指向本機檔案；`AML_ADDRESS_LIST_URLS` 可加入其他地址清單（每行一個地址）。
- OFAC 為英文拼音，中文姓名無法比對；系統會改用舊系統資料中的英文姓名。部分相符僅列為「需人工確認」，請比對出生日期與國籍。
- 預設國家名單為 FATF 2026 年 6 月公布（高風險：IR、KP，另 MM 需加強審查；灰名單 22 國）。FATF 每年 2、6、10 月更新，請定期調整。
- 分析僅供審核參考，不能取代法遵人員的判斷。

### 上線前

1. 執行 `npm run db:check` 並處理所有 ✗
2. 到後台「幣種與提領設定」逐一確認網路、手續費、最低數量、地址 regex 後**開啟提領**（預設全部關閉）
3. 舊系統還在 submitted／accepted／processing 的提領會直接出現在提領審核佇列，可照新流程處理；`submitting`、`almost_done` 等舊狀態只能檢視
4. 舊系統「指定手續費資產」的提領（`fee_account_id ≠ account_id`）需人工處理帳務，後台會提示

## 架構

```
src/
  app/(public)/        首頁、登入、忘記密碼、重設密碼
  app/app/             會員區：總覽、資產、紀錄、提領、客服、帳戶、身分驗證
  app/admin/           管理後台
  app/api/export/      CSV 匯出
  lib/
    session.ts         簽章 cookie session
    auth.ts / roles.ts 會員與管理員權限
    admins.ts          管理員名單（ADMINS + 後台指派）
    holders.ts         幣種持有者、帳本對帳、資金流向
    risk.ts            提領風險分析
    aml/               洗錢防制參數、內部黑名單、OFAC 名單
    members.ts         會員、CAFECA 綁定（authentications）
    identity.ts        CAFECA 實名比對規則
    currencies.ts      幣種（asset_bases + system_configs 提領設定）、市場（markets.yml）
    withdraw.ts        提領狀態機與帳本
    tickets.ts         客服
    cafeca/            Sign in with CAFECA（verify.ts / signin.ts / kyc-credential.ts 取自 CAFECA-IO/cafeca）
  i18n/                六種語系字典
prisma/schema.prisma   既有資料表的對應（不用於 migration）
config/markets.yml     舊系統市場設定
scripts/db-check.ts    唯讀資料庫檢查
```

### 多個網址

`APP_ORIGINS` 可設定多個網址（逗號分隔，未寫協定視為 https），預設 `legacy.tidebit-defi.com, tidebit.com`；舊的單一 `APP_ORIGIN` 仍可使用。CAFECA 簽署的網址必須在清單內且與目前網址相同；寄信連結使用會員當時造訪的網址，無法判斷時用清單第一個。所有網址需指向同一個服務；cookie 依網域各自獨立，在不同網址需分別登入。

### CAFECA 串接

- 依 [CAFECA README](https://github.com/CAFECA-IO/cafeca)：後端發 nonce（綁定 session、一次性）→ 前端以 `cafeca-connect.js` 彈出視窗（被擋時可改整頁導向）→ 後端以 ERC-1271 `isValidSignature` 與 IdentityRegistry v2 驗證。
- 綁定時請求 `kyc_level`、`legal_name`、`doc_type`、`nationality`、`pairwise_id`；需 ≥ L2、非法人、不在恢復中。證件姓名與舊系統一致且無重複身分時自動通過，否則進入人工審核。
- 每筆提領都要以已綁定的 CAFECA 身分再簽署；提領內容以伺服器簽發的草稿為準，提領編號由 nonce 推導，同一次簽署不會產生兩筆。
- 已綁定 CAFECA 的會員可在登入頁「使用 CAFECA 登入」：以 `authentications`（`provider = cafeca`）的 `uid` 找到會員，綁定未通過、一個身分綁定多個帳號、帳號停權或鎖定時不允許，需改用 Email 與密碼。管理員仍需密碼＋CAFECA 兩個因素。
- 開發時可設 `CAFECA_MOCK=true`（僅非 production 有效）以模擬身分完成整個流程。
