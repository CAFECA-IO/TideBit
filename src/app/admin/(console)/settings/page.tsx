import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, CardHeader, Field, Input, Textarea } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { env } from "@/lib/env";
import { LOCALES, LOCALE_LABELS } from "@/i18n/config";
import { settingsAction } from "../actions";

export const metadata = { title: "系統設定" };

export default async function SettingsPage() {
  await requireAdmin("settings.edit");
  const s = await getSettings();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">系統設定</h1>
      <ActionForm action={settingsAction} className="space-y-6">
        <Card>
          <CardHeader title="提領與實名" />
          <div className="space-y-3 px-5 py-4">
            <label className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5">
              <input type="checkbox" name="withdrawPaused" defaultChecked={s.withdrawPaused} className="mt-0.5 h-4 w-4" />
              <span>
                <span className="block text-sm font-medium">暫停受理新的提領申請</span>
                <span className="block text-xs text-muted">已送出的提領不受影響，仍可在後台處理。</span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5">
              <input type="checkbox" name="identityAutoApprove" defaultChecked={s.identityAutoApprove} className="mt-0.5 h-4 w-4" />
              <span>
                <span className="block text-sm font-medium">姓名比對一致時自動核准實名</span>
                <span className="block text-xs text-muted">關閉後所有 CAFECA 綁定都需要人工審核。</span>
              </span>
            </label>
          </div>
        </Card>

        <Card>
          <CardHeader title="公告" desc="顯示在首頁與會員總覽（存於 announcements，每則最多 255 字）；未填寫的語系會顯示繁體中文版本" />
          <div className="space-y-4 px-5 py-4">
            {LOCALES.map((l) => (
              <Field key={l} label={LOCALE_LABELS[l]} htmlFor={`a-${l}`}>
                <Textarea id={`a-${l}`} name={`announcement.${l}`} rows={2} maxLength={255} defaultValue={s.announcement[l] ?? ""} />
              </Field>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="聯絡資訊" />
          <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
            <Field label="客服信箱" htmlFor="supportEmail">
              <Input id="supportEmail" name="supportEmail" type="email" defaultValue={s.supportEmail} />
            </Field>
            <Field label="CAFECA 註冊連結" htmlFor="cafecaSignupUrl">
              <Input id="cafecaSignupUrl" name="cafecaSignupUrl" type="url" defaultValue={s.cafecaSignupUrl} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="環境設定（唯讀）" desc="以環境變數設定，需重新部署" />
          <dl className="grid gap-3 px-5 py-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">網站網址（APP_ORIGINS）</dt>
              <dd className="whitespace-pre-line font-mono text-xs">{env.appOrigins.join("\n")}</dd>
            </div>
            <div>
              <dt className="text-muted">CAFECA_WALLET_URL</dt>
              <dd className="font-mono text-xs">{env.cafecaWallet}</dd>
            </div>
            <div>
              <dt className="text-muted">提領雙人覆核（WITHDRAW_FOUR_EYES）</dt>
              <dd>{env.fourEyes ? "開啟" : "關閉"}</dd>
            </div>
            <div>
              <dt className="text-muted">管理員 CAFECA 第二因素</dt>
              <dd>{env.adminRequireCafeca ? "開啟" : "關閉"}</dd>
            </div>
            <div>
              <dt className="text-muted">要求正式 KYC 簽章者</dt>
              <dd>{env.requireProductionSigner ? "是" : "否（接受原型簽章）"}</dd>
            </div>
            <div>
              <dt className="text-muted">管理員（ADMINS）</dt>
              <dd className="text-xs">
                {[...env.admins.entries()].map(([e, r]) => `${e}（${r}）`).join("、") || "未設定"}
                <a href="/admin/admins" className="ml-2 text-accent hover:underline">管理員指派 →</a>
              </dd>
            </div>
            <div>
              <dt className="text-muted">寄信</dt>
              <dd>{env.smtp.url ? "SMTP 已設定" : "未設定（僅輸出至 log）"}</dd>
            </div>
          </dl>
        </Card>

        <div className="flex justify-end">
          <SubmitButton>儲存設定</SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}
