"use client";

import { useActionState, useState } from "react";
import type { WithdrawState } from "@/lib/withdraw";
import { Alert, Button, Card, CardHeader, Input, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/forms";
import { withdrawAction } from "../../actions";

type Props = {
  id: string;
  legacyFee: boolean;
  state: WithdrawState;
  canReview: boolean;
  canProcess: boolean;
  isApprover: boolean;
  isProcessor: boolean;
  fourEyes: boolean;
  amount: string;
  address: string;
};

export function WithdrawActions(p: Props) {
  const [result, action] = useActionState(withdrawAction, undefined);
  // 操作成功（result 改變）後自動回到預設畫面
  const [modeState, setModeState] = useState<{ mode: null | "reject" | "fail"; at: typeof result }>({ mode: null, at: undefined });
  const mode = modeState.at === result ? modeState.mode : null;
  const setMode = (m: null | "reject" | "fail") => setModeState({ mode: m, at: result });

  const hidden = (act: string) => (
    <>
      <input type="hidden" name="id" value={p.id} />
      <input type="hidden" name="action" value={act} />
    </>
  );

  let body: React.ReactNode = null;
  if (p.state === "OTHER") {
    return (
      <Card>
        <CardHeader title="操作" />
        <p className="px-5 py-4 text-sm text-muted">此提領處於舊系統狀態，新系統不提供操作；如需處理請記錄備註後人工處理帳務。</p>
      </Card>
    );
  }
  const canReject = p.canReview && ["SUBMITTED", "APPROVED", "FAILED"].includes(p.state);

  if (mode === "reject") {
    body = (
      <form action={action} className="space-y-3">
        {hidden("reject")}
        <p className="text-sm text-muted">退回後凍結資金會退回會員可用餘額。原因會顯示給會員。</p>
        <Textarea name="reason" rows={3} required placeholder="例如：收款地址格式不符，請確認網路後重新申請" />
        <div className="flex gap-2">
          <SubmitButton variant="danger">確認退回</SubmitButton>
          <Button type="button" variant="ghost" onClick={() => setMode(null)}>
            取消
          </Button>
        </div>
      </form>
    );
  } else if (mode === "fail") {
    body = (
      <form action={action} className="space-y-3">
        {hidden("fail")}
        <p className="text-sm text-muted">標記為異常（例如廣播失敗）。資金維持凍結，可重新出款或退回。</p>
        <Textarea name="note" rows={2} required placeholder="異常說明（內部）" />
        <div className="flex gap-2">
          <SubmitButton variant="danger">標記異常</SubmitButton>
          <Button type="button" variant="ghost" onClick={() => setMode(null)}>
            取消
          </Button>
        </div>
      </form>
    );
  } else if (p.state === "SUBMITTED") {
    body = p.canReview ? (
      <form action={action} className="space-y-3">
        {hidden("approve")}
        <p className="text-sm text-muted">確認風險檢查無誤後核准。{p.fourEyes && "核准後需由另一位管理員出款。"}</p>
        <Input name="note" placeholder="核准備註（內部；風險建議不放行時須填覆核理由）" />
        <SubmitButton className="w-full">核准提領</SubmitButton>
      </form>
    ) : (
      <p className="text-sm text-muted">您沒有審核權限</p>
    );
  } else if (p.state === "APPROVED") {
    body =
      p.canProcess && !(p.fourEyes && p.isApprover) ? (
        <form action={action} className="space-y-3">
          {hidden("process")}
          <p className="text-sm text-muted">開始出款後由您負責從錢包轉出，並回填 txid。其他管理員將無法同時處理。</p>
          <SubmitButton className="w-full">我來出款</SubmitButton>
        </form>
      ) : (
        <p className="text-sm text-muted">{p.isApprover && p.fourEyes ? "您核准了這筆提領，需由另一位管理員出款。" : "您沒有出款權限"}</p>
      );
  } else if (p.state === "PROCESSING") {
    body = p.isProcessor ? (
      <form action={action} className="space-y-3">
        {hidden("complete")}
        <Alert tone="info">
          請轉出 <b className="num">{p.amount}</b> 至
          <span className="mt-1 block break-all font-mono text-xs">{p.address}</span>
        </Alert>
        <Input name="txid" required minLength={8} placeholder="交易 ID（txid）" className="font-mono" autoComplete="off" />
        <SubmitButton className="w-full" variant="accent">
          回填 txid 並完成
        </SubmitButton>
        <button type="button" onClick={() => setMode("fail")} className="w-full text-center text-sm text-danger hover:underline">
          出款失敗？標記異常
        </button>
      </form>
    ) : (
      <p className="text-sm text-muted">由其他管理員出款中。</p>
    );
  } else if (p.state === "FAILED") {
    body = p.canProcess ? (
      <form action={action} className="space-y-3">
        {hidden("retry")}
        <p className="text-sm text-muted">確認未實際轉出後，可退回「待出款」重新處理。</p>
        <SubmitButton className="w-full" variant="secondary">
          重新出款
        </SubmitButton>
      </form>
    ) : null;
  } else {
    body = <p className="text-sm text-muted">此提領已結束，無可執行的操作。</p>;
  }

  return (
    <Card>
      <CardHeader title="操作" />
      <div className="space-y-3 px-5 py-4">
        {result?.error && <Alert tone="danger">{result.error}</Alert>}
        {result?.ok && <Alert tone="success">{result.ok}</Alert>}
        {p.legacyFee && <Alert tone="warning">此筆舊提領的手續費凍結在另一個資產帳戶，完成、退回需人工處理帳務。</Alert>}
        {body}
        {!mode && canReject && (
          <button type="button" onClick={() => setMode("reject")} className="w-full text-center text-sm text-danger hover:underline">
            退回提領
          </button>
        )}
      </div>
    </Card>
  );
}
