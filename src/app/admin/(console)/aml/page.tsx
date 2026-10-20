import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, Search, XCircle } from "lucide-react";
import clsx from "clsx";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, CardHeader, EmptyState, Field, Input, Select, Textarea, inputClass } from "@/components/ui";
import { can, requireAdmin } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { str } from "@/lib/queries";
import { BLACKLIST_LABEL, getAmlSettings, getBlacklist, matchBlacklist, type BlacklistType } from "@/lib/aml/config";
import { getSanctions, hasLatin, sanctionsStatus, screenAddress, screenName } from "@/lib/aml/sanctions";
import { amlSettingsAction, blacklistAddAction, blacklistRemoveAction, sanctionsRefreshAction } from "../actions";

export const metadata = { title: "洗錢防制" };

export default async function AmlPage({ searchParams }: PageProps<"/admin/aml">) {
  const { admin } = await requireAdmin();
  if (!can(admin.role, "aml.manage") && !can(admin.role, "audit.view")) redirect("/admin/forbidden");
  const editable = can(admin.role, "aml.manage");
  const sp = await searchParams;
  const qName = str(sp.name).trim();
  const qAddr = str(sp.address).trim();
  const [aml, list] = await Promise.all([getAmlSettings(), getBlacklist()]);
  const store = qName || qAddr ? (aml.ofacEnabled ? await getSanctions() : null) : null;
  const status = sanctionsStatus(aml.ofacEnabled);

  const nameHits = store && qName ? screenName(store, qName) : [];
  const addrHit = store && qAddr ? screenAddress(store, qAddr) : null;
  const blHits = qName || qAddr ? matchBlacklist(list, { name: [qName], address: [qAddr], email: [qName], member: [qName], cafeca: [qAddr] }) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">洗錢防制</h1>
        <p className="mt-1 text-sm text-muted">提領審核時會自動以下列名單與參數分析風險。所有設定存於既有 system_configs，異動會寫入稽核紀錄。</p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="OFAC 制裁名單" desc="美國財政部 SDN 名單（個人姓名、別名、加密貨幣地址）" />
          <dl className="grid grid-cols-2 gap-3 px-5 py-4 text-sm">
            <div>
              <dt className="text-muted">狀態</dt>
              <dd className="mt-0.5">
                {!status.enabled ? <Badge>未啟用</Badge> : status.loadedAt ? <Badge tone="success">已載入</Badge> : status.error ? <Badge tone="danger">載入失敗</Badge> : <Badge tone="warning">尚未載入</Badge>}
              </dd>
            </div>
            <div>
              <dt className="text-muted">更新時間</dt>
              <dd className="mt-0.5">{status.loadedAt ? fmtDateTime(status.loadedAt) : "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">個人／姓名與別名</dt>
              <dd className="num mt-0.5">
                {status.individuals.toLocaleString()} / {status.names.toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-muted">制裁地址</dt>
              <dd className="num mt-0.5">{status.addresses.toLocaleString()}</dd>
            </div>
            {status.error && <dd className="col-span-2 text-xs text-danger">{status.error}</dd>}
            <dd className="col-span-2 break-all font-mono text-[11px] text-muted">{status.sources.join("\n")}</dd>
          </dl>
          {editable && status.enabled && (
            <ActionForm action={sanctionsRefreshAction} className="border-t border-border px-5 py-3">
              <SubmitButton variant="secondary" size="sm" pendingText="下載中…">
                立即更新名單
              </SubmitButton>
            </ActionForm>
          )}
        </Card>

        <Card>
          <CardHeader title="手動篩查" desc="輸入英文姓名或錢包地址，比對 OFAC 與內部黑名單" />
          <form className="space-y-3 px-5 py-4" action="/admin/aml">
            <input name="name" defaultValue={qName} placeholder="英文姓名（例：CHEN Wei）" className={inputClass} />
            <input name="address" defaultValue={qAddr} placeholder="錢包地址" className={clsx(inputClass, "font-mono text-xs")} />
            <button className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-navy px-3 text-sm font-medium text-white hover:opacity-90">
              <Search size={15} /> 篩查
            </button>
          </form>
          {(qName || qAddr) && (
            <ul className="space-y-2 border-t border-border px-5 py-4 text-sm">
              {aml.ofacEnabled && !store && (
                <li className="flex gap-2 text-warning">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" /> OFAC 名單無法載入
                </li>
              )}
              {qName && store && !hasLatin(qName) && (
                <li className="flex gap-2 text-muted">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" /> 非拉丁字元姓名無法比對 OFAC，請改用英文拼音
                </li>
              )}
              {qName && store && hasLatin(qName) && nameHits.length === 0 && (
                <li className="flex gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" /> 姓名未命中 OFAC
                </li>
              )}
              {nameHits.map((h) => (
                <li key={h.ent} className="flex gap-2">
                  {h.strength === "exact" ? <XCircle size={16} className="mt-0.5 shrink-0 text-danger" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />}
                  <span>
                    {h.strength === "exact" ? "完全相符" : "部分相符"}：{h.listed}
                    {h.listed !== h.primary && <span className="text-muted">（主名 {h.primary}）</span>} · {h.program} ·{" "}
                    <a href={`https://sanctionssearch.ofac.treas.gov/Details.aspx?id=${h.ent}`} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                      SDN #{h.ent}
                    </a>
                  </span>
                </li>
              ))}
              {qAddr && store && (
                <li className="flex gap-2">
                  {addrHit ? <XCircle size={16} className="mt-0.5 shrink-0 text-danger" /> : <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />}
                  {addrHit ? `地址列於制裁名單：${addrHit.name ?? addrHit.source}（${addrHit.currency} ${addrHit.program ?? ""}）` : "地址未列於 OFAC 制裁名單"}
                </li>
              )}
              {blHits.map((e) => (
                <li key={e.id} className="flex gap-2 text-danger">
                  <XCircle size={16} className="mt-0.5 shrink-0" /> 內部黑名單（{BLACKLIST_LABEL[e.type]}）：{e.reason}
                </li>
              ))}
              {(qName || qAddr) && blHits.length === 0 && (
                <li className="flex gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" /> 未命中內部黑名單
                </li>
              )}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="內部黑名單" desc={`${list.length} 筆・命中時該筆提領會被判定為「建議不放行」`} />
        {editable && (
          <ActionForm action={blacklistAddAction} className="border-b border-border px-5 py-4">
            <div className="grid gap-3 sm:grid-cols-[160px_1fr_1fr_auto] sm:items-end">
              <Field label="類型" htmlFor="bl-type">
                <Select id="bl-type" name="type" defaultValue="address">
                  {(Object.keys(BLACKLIST_LABEL) as BlacklistType[]).map((k) => (
                    <option key={k} value={k}>
                      {BLACKLIST_LABEL[k]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="內容" htmlFor="bl-value">
                <Input id="bl-value" name="value" required placeholder="地址／會員 ID／Email／姓名／CAFECA 地址" />
              </Field>
              <Field label="原因" htmlFor="bl-reason">
                <Input id="bl-reason" name="reason" required placeholder="例：執法機關通報" />
              </Field>
              <SubmitButton>加入</SubmitButton>
            </div>
          </ActionForm>
        )}
        {list.length === 0 ? (
          <EmptyState title="尚無黑名單" />
        ) : (
          <div className="overflow-x-auto">
            <table className="tb-table">
              <thead>
                <tr>
                  <th>類型</th>
                  <th>內容</th>
                  <th>原因</th>
                  <th>加入者</th>
                  <th>時間</th>
                  {editable && <th />}
                </tr>
              </thead>
              <tbody>
                {[...list].reverse().map((e) => (
                  <tr key={e.id}>
                    <td>
                      <Badge>{BLACKLIST_LABEL[e.type]}</Badge>
                    </td>
                    <td className="break-all font-mono text-xs">
                      {e.type === "member" ? (
                        <a href={`/admin/members/${e.value}`} className="text-accent hover:underline">
                          #{e.value}
                        </a>
                      ) : (
                        e.value
                      )}
                    </td>
                    <td className="text-sm">{e.reason}</td>
                    <td className="text-xs text-muted">{e.by}</td>
                    <td className="whitespace-nowrap text-xs text-muted">{fmtDateTime(new Date(e.at))}</td>
                    {editable && (
                      <td className="r">
                        <ActionForm action={blacklistRemoveAction}>
                          <input type="hidden" name="id" value={e.id} />
                          <SubmitButton variant="ghost" size="sm">
                            移除
                          </SubmitButton>
                        </ActionForm>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="font-semibold">分析參數</h2>
        <ActionForm action={amlSettingsAction} className="mt-4 space-y-5">
          <fieldset disabled={!editable} className="space-y-5">
            <Field label="高風險國家（ISO 代碼，直接判定不放行）" htmlFor="highRiskCountries" hint="FATF「Call for Action」：伊朗、北韓；緬甸需加強審查">
              <Input id="highRiskCountries" name="highRiskCountries" defaultValue={aml.highRiskCountries.join(", ")} className="font-mono" />
            </Field>
            <Field label="加強監控國家（灰名單，需人工確認）" htmlFor="monitoredCountries" hint="預設為 FATF 2026 年 6 月名單；FATF 每年 2、6、10 月更新，請定期調整">
              <Textarea id="monitoredCountries" name="monitoredCountries" rows={2} defaultValue={aml.monitoredCountries.join(", ")} className="font-mono" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="大額提領門檻（USD）" htmlFor="largeWithdrawUsd" hint="需在幣種設定參考價格">
                <Input id="largeWithdrawUsd" name="largeWithdrawUsd" type="number" min={0} defaultValue={aml.largeWithdrawUsd} className="num" />
              </Field>
              <Field label="24 小時提領筆數上限" htmlFor="velocity24h">
                <Input id="velocity24h" name="velocity24h" type="number" min={1} defaultValue={aml.velocity24h} className="num" />
              </Field>
              <Field label="非入金／交易來源上限（%）" htmlFor="nonTradeShare" hint="人工調整、贈送等">
                <Input id="nonTradeShare" name="nonTradeShare" type="number" min={0} max={100} step="any" defaultValue={aml.nonTradeShare * 100} className="num" />
              </Field>
              <Field label="快進快出判定（小時）" htmlFor="quickTurnaroundHours">
                <Input id="quickTurnaroundHours" name="quickTurnaroundHours" type="number" min={0} defaultValue={aml.quickTurnaroundHours} className="num" />
              </Field>
              <Field label="帳號異動觀察期（小時）" htmlFor="recentChangeHours" hint="密碼重設、綁定 CAFECA 後">
                <Input id="recentChangeHours" name="recentChangeHours" type="number" min={0} defaultValue={aml.recentChangeHours} className="num" />
              </Field>
            </div>
            <label className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5">
              <input type="checkbox" name="ofacEnabled" defaultChecked={aml.ofacEnabled} className="mt-0.5 h-4 w-4" />
              <span>
                <span className="block text-sm font-medium">啟用 OFAC 制裁名單比對</span>
                <span className="block text-xs text-muted">伺服器需能連線 treasury.gov；離線環境可用 AML_OFAC_SDN_URL / AML_OFAC_ALT_URL 指向本機檔案</span>
              </span>
            </label>
          </fieldset>
          {editable && (
            <div className="flex justify-end">
              <SubmitButton>儲存</SubmitButton>
            </div>
          )}
        </ActionForm>
      </Card>
    </div>
  );
}
