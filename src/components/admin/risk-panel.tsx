import Link from "next/link";
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, ShieldCheck, ShieldQuestion, XCircle } from "lucide-react";
import clsx from "clsx";
import { Card, inputClass } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { analyzeWithdraw, type CheckStatus, type Verdict } from "@/lib/risk";
import { fmtDateTime } from "@/lib/format";
import { blacklistAddAction } from "@/app/admin/(console)/actions";

const ICON: Record<CheckStatus, React.ReactNode> = {
  fail: <XCircle size={16} className="mt-0.5 shrink-0 text-danger" aria-label="不通過" />,
  warn: <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" aria-label="注意" />,
  info: <Info size={16} className="mt-0.5 shrink-0 text-info" aria-label="資訊" />,
  ok: <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" aria-label="通過" />,
};

const VERDICT: Record<Verdict, { label: string; desc: string; cls: string; icon: React.ReactNode }> = {
  PASS: { label: "可放行", desc: "未發現異常", cls: "bg-success-soft text-success border-success/20", icon: <ShieldCheck size={22} /> },
  REVIEW: { label: "需人工確認", desc: "有需要注意的項目，確認後可放行", cls: "bg-warning-soft text-warning border-warning/20", icon: <ShieldQuestion size={22} /> },
  BLOCK: { label: "建議不放行", desc: "有不通過項目，請調查；若仍核准需填寫覆核理由", cls: "bg-danger-soft text-danger border-danger/20", icon: <ShieldAlert size={22} /> },
};

export async function RiskPanel({ withdrawId, address, memberId, canManage, fresh }: { withdrawId: bigint; address: string | null; memberId: bigint; canManage: boolean; fresh?: boolean }) {
  let report;
  try {
    report = await analyzeWithdraw(withdrawId, { fresh });
  } catch (e) {
    console.error("[risk]", e);
    return (
      <Card className="p-5 text-sm text-danger">
        風險分析執行失敗（詳見伺服器 log）。
      </Card>
    );
  }
  if (!report) return null;
  const v = VERDICT[report.verdict];
  const groups = [...new Set(report.checks.map((c) => c.group))];
  return (
    <Card className="overflow-hidden">
      <div className={clsx("flex items-start gap-3 border-b px-5 py-4", v.cls)}>
        {v.icon}
        <div className="flex-1">
          <p className="font-semibold">
            風險分析：{v.label}
            <span className="ml-2 text-xs font-normal opacity-80">風險分數 {report.score}</span>
          </p>
          <p className="text-xs opacity-90">{v.desc}</p>
        </div>
      </div>
      <div className="space-y-4 px-5 py-4">
        {groups.map((g) => (
          <div key={g}>
            <p className="mb-1.5 text-xs font-medium text-muted">{g}</p>
            <ul className="space-y-2">
              {report.checks
                .filter((c) => c.group === g)
                .map((c) => (
                  <li key={c.key} className="flex items-start gap-2 text-sm">
                    {ICON[c.status]}
                    <div className="min-w-0">
                      <p className={clsx(c.status === "fail" && "font-medium text-danger")}>{c.title}</p>
                      {c.detail && <p className="whitespace-pre-line break-words text-xs text-muted">{c.detail}</p>}
                      {c.links && c.links.length > 0 && (
                        <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs">
                          {c.links.map((l) =>
                            l.href.startsWith("http") ? (
                              <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                                {l.label} ↗
                              </a>
                            ) : (
                              <Link key={l.href} href={l.href} className="text-accent hover:underline">
                                {l.label}
                              </Link>
                            ),
                          )}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3 text-xs text-muted">
        <span>
          分析於 {fmtDateTime(new Date(report.analyzedAt))}（{report.ms} ms）
        </span>
        <Link href={`/admin/withdrawals/${withdrawId}?fresh=1`} className="text-accent hover:underline" prefetch={false}>
          重新分析
        </Link>
      </div>
      {canManage && (
        <details className="border-t border-border px-5 py-3 text-sm">
          <summary className="cursor-pointer text-muted hover:text-text">加入內部黑名單…</summary>
          <div className="mt-3 space-y-3">
            {address && (
              <ActionForm action={blacklistAddAction} className="space-y-2">
                <input type="hidden" name="type" value="address" />
                <input type="hidden" name="value" value={address} />
                <input type="hidden" name="back" value={`/admin/withdrawals/${withdrawId}`} />
                <input name="reason" required placeholder="原因（例：詐騙收款地址）" className={clsx(inputClass, "h-9")} />
                <SubmitButton variant="secondary" size="sm">將收款地址加入黑名單</SubmitButton>
              </ActionForm>
            )}
            <ActionForm action={blacklistAddAction} className="space-y-2">
              <input type="hidden" name="type" value="member" />
              <input type="hidden" name="value" value={String(memberId)} />
              <input type="hidden" name="back" value={`/admin/withdrawals/${withdrawId}`} />
              <input name="reason" required placeholder="原因" className={clsx(inputClass, "h-9")} />
              <SubmitButton variant="danger" size="sm">將此會員加入黑名單</SubmitButton>
            </ActionForm>
          </div>
        </details>
      )}
    </Card>
  );
}

export function RiskPanelSkeleton() {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-sm text-muted">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />
        正在分析資產與洗錢防制風險…
      </div>
      <div className="mt-4 space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-4 animate-pulse rounded bg-surface-2" style={{ width: `${85 - i * 12}%` }} />
        ))}
      </div>
    </Card>
  );
}
