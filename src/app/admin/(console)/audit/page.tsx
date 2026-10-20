import clsx from "clsx";
import type { Prisma } from "@/generated/prisma/client";
import { Card, EmptyState, inputClass } from "@/components/ui";
import { Pagination } from "@/components/pagination";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { AUDIT_ITEM_TYPE } from "@/lib/notify";
import { pageOf, str } from "@/lib/queries";
import { getI18n } from "@/i18n/server";

export const metadata = { title: "稽核紀錄" };
const SIZE = 50;

/** 新系統的操作紀錄存於既有 versions 表（item_type = TideBit） */
export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await requireAdmin("audit.view");
  const { t } = await getI18n();
  const sp = await searchParams;
  const page = pageOf(sp);
  const action = str(sp.action).trim();
  const actor = str(sp.actor).trim();
  const target = str(sp.target).trim();
  const where: Prisma.VersionWhereInput = {
    itemType: AUDIT_ITEM_TYPE,
    ...(action ? { event: { startsWith: action } } : {}),
    ...(actor ? { whodunnit: { contains: actor, mode: "insensitive" } } : {}),
    ...(/^\d{1,18}$/.test(target) ? { itemId: BigInt(target) } : {}),
  };
  const rows = await db.version.findMany({ where, orderBy: { id: "desc" }, skip: (page - 1) * SIZE, take: SIZE + 1 });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">稽核紀錄</h1>
      <Card>
        <form className="flex flex-wrap gap-2 border-b border-border px-4 py-3" action="/admin/audit">
          <input name="action" defaultValue={action} placeholder="動作前綴，例：withdraw." className={clsx(inputClass, "h-9 w-56")} />
          <input name="actor" defaultValue={actor} placeholder="操作者 Email" className={clsx(inputClass, "h-9 w-56")} />
          <input name="target" defaultValue={target} placeholder="對象 ID" className={clsx(inputClass, "h-9 w-32")} />
          <button className="h-9 rounded-lg border border-border px-3 text-sm hover:bg-surface-2">篩選</button>
        </form>
        {rows.length === 0 ? (
          <EmptyState title="沒有紀錄" />
        ) : (
          <div className="overflow-x-auto">
            <table className="tb-table">
              <thead>
                <tr>
                  <th>時間</th>
                  <th>操作者</th>
                  <th>動作</th>
                  <th>對象 ID</th>
                  <th>資料</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, SIZE).map((r) => {
                  const [type, , name] = (r.whodunnit ?? "").split(":");
                  return (
                    <tr key={String(r.id)}>
                      <td data-label="時間" className="whitespace-nowrap text-muted">{fmtDateTime(r.createdAt)}</td>
                      <td data-label="操作者" className="whitespace-nowrap">
                        <span className="text-xs text-muted">{type}</span> {name}
                      </td>
                      <td data-label="動作" className="font-mono text-xs">{r.event}</td>
                      <td data-label="對象 ID" className="num text-xs">{r.itemId ? String(r.itemId) : "—"}</td>
                      <td data-label="資料" className="max-w-md">
                        {r.object ? (
                          <code className="line-clamp-2 break-all text-[11px] text-muted" title={r.object}>
                            {r.object}
                          </code>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} hasNext={rows.length > SIZE} basePath="/admin/audit" params={{ action: action || undefined, actor: actor || undefined, target: target || undefined }} t={t} />
      </Card>
    </div>
  );
}
