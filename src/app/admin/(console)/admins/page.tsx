import { Card, CardHeader, EmptyState, Field, Input, Select, Badge } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { ROLE_LABEL } from "@/components/admin/labels";
import { requireAdmin } from "@/lib/auth";
import { listAdmins } from "@/lib/admins";
import { fmtDateTime } from "@/lib/format";
import { ROLES } from "@/lib/roles";
import { adminAssignAction, adminRemoveAction, adminResetCafecaAction } from "../actions";

export const metadata = { title: "管理員" };

const ROLE_DESC: Record<(typeof ROLES)[number], string> = {
  SUPER: "全部權限，含指派管理員、系統設定",
  OPERATOR: "提領審核與出款、實名審核、會員管理、洗錢防制名單",
  SUPPORT: "客服回覆、查看會員、備註",
  AUDITOR: "唯讀：會員資料與稽核紀錄",
};

export default async function AdminsPage() {
  const { admin } = await requireAdmin("admin.manage");
  const admins = await listAdmins();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">管理員</h1>
        <p className="mt-1 text-sm text-muted">管理員以自己的 TideBit 會員帳號登入後台，並以 CAFECA 完成第二因素。環境變數 ADMINS 指定的帳號無法在此修改。</p>
      </div>

      <Card className="p-5 sm:p-6">
        <h2 className="font-semibold">指派或變更角色</h2>
        <ActionForm action={adminAssignAction} className="mt-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_200px_auto] sm:items-end">
            <Field label="會員 Email 或 ID" htmlFor="member">
              <Input id="member" name="member" required placeholder="name@example.com" />
            </Field>
            <Field label="角色" htmlFor="role">
              <Select id="role" name="role" defaultValue="SUPPORT">
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}（{r}）
                  </option>
                ))}
              </Select>
            </Field>
            <SubmitButton>儲存</SubmitButton>
          </div>
        </ActionForm>
        <ul className="mt-4 grid gap-1 text-xs text-muted sm:grid-cols-2">
          {ROLES.map((r) => (
            <li key={r}>
              <span className="font-medium text-text">{ROLE_LABEL[r]}</span>：{ROLE_DESC[r]}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader title="目前管理員" desc={`${admins.length} 位`} />
        {admins.length === 0 ? (
          <EmptyState title="尚無管理員" />
        ) : (
          <div className="overflow-x-auto">
            <table className="tb-table">
              <thead>
                <tr>
                  <th>帳號</th>
                  <th>角色</th>
                  <th>來源</th>
                  <th>CAFECA</th>
                  <th>指派</th>
                  <th className="r">操作</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => {
                  const self = a.memberId === admin.id;
                  return (
                    <tr key={`${a.source}:${a.email}`}>
                      <td data-label="帳號">
                        {a.memberId ? (
                          <a href={`/admin/members/${a.memberId}`} className="font-medium hover:text-accent hover:underline">
                            {a.email}
                          </a>
                        ) : (
                          <span className="font-medium">{a.email}</span>
                        )}
                        {a.name && <span className="ml-1 text-xs text-muted">{a.name}</span>}
                        {self && <Badge tone="info" className="ml-2">你</Badge>}
                        {!a.memberId && <Badge tone="danger" className="ml-2">找不到會員</Badge>}
                        {a.memberId && a.disabled && <Badge tone="danger" className="ml-2">已停權</Badge>}
                      </td>
                      <td data-label="角色">{ROLE_LABEL[a.role]}</td>
                      <td data-label="來源">{a.source === "env" ? <Badge>ADMINS 環境變數</Badge> : <Badge tone="info">後台指派</Badge>}</td>
                      <td data-label="CAFECA">{a.cafecaBound ? <Badge tone="success">已綁定</Badge> : <Badge>未綁定</Badge>}</td>
                      <td data-label="指派" className="text-xs text-muted">
                        {a.source === "db" ? (
                          <>
                            {a.assignedBy ?? "—"}
                            <br />
                            {fmtDateTime(a.assignedAt)}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td data-label="操作" className="r">
                        {!self && a.memberId && (
                          <div className="flex flex-wrap justify-end gap-2">
                            {a.cafecaBound && (
                              <ActionForm action={adminResetCafecaAction}>
                                <input type="hidden" name="memberId" value={String(a.memberId)} />
                                <SubmitButton variant="secondary" size="sm">重設 CAFECA</SubmitButton>
                              </ActionForm>
                            )}
                            {a.source === "db" && (
                              <ActionForm action={adminRemoveAction}>
                                <input type="hidden" name="memberId" value={String(a.memberId)} />
                                <SubmitButton variant="danger" size="sm">移除</SubmitButton>
                              </ActionForm>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
