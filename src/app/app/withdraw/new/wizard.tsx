"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { AlertTriangle, Check, ChevronRight, Trash2 } from "lucide-react";
import clsx from "clsx";
import { CafecaButton } from "@/components/cafeca-button";
import { Alert, Button, Card, CoinIcon, EmptyState, Field, Input } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import { decimals, formatUnits, parseUnits, truncate } from "@/lib/decimal";
import { fmtAmount } from "@/lib/format";
import { completeWithdrawAction, deleteFundSourceAction, prepareWithdrawAction } from "../../actions";

export type WithdrawAsset = {
  code: string;
  name: string | null;
  balance: string;
  precision: number;
  fee: string;
  min: string;
  max: string | null;
  network: string | null;
  memoRequired: boolean;
  memoLabel: string | null;
  notice: string | null;
  addressPattern: string | null;
  sources: { id: string; label: string | null; address: string; memo: string | null }[];
};

type Step = 0 | 1 | 2;

export function WithdrawWizard({ assets, initial, wallet, mock }: { assets: WithdrawAsset[]; initial: string; wallet: string; mock: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const initialAsset = assets.find((a) => a.code === initial.toLowerCase());
  const [step, setStep] = useState<Step>(initialAsset ? 1 : 0);
  const [code, setCode] = useState(initialAsset?.code ?? "");
  const [sourceId, setSourceId] = useState<string | "new">(initialAsset?.sources[0]?.id ?? "new");
  const [address, setAddress] = useState("");
  const [memo, setMemo] = useState("");
  const [amount, setAmount] = useState("");
  const [save, setSave] = useState(true);
  const [label, setLabel] = useState("");
  const [agree, setAgree] = useState(false);
  const [restored, setRestored] = useState(false);
  const [, startDelete] = useTransition();

  const asset = assets.find((a) => a.code === code);

  // 整頁導向回來時直接進入簽署步驟（草稿保存在伺服器）
  useEffect(() => {
    if (window.location.hash.includes("cafeca=")) {
      // 與外部狀態（網址 fragment）同步，只在掛載時執行一次
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRestored(true);
      setStep(2);
    }
  }, []);

  const src = asset?.sources.find((s) => s.id === sourceId);
  const effAddress = src ? src.address : address.trim();
  const effMemo = src ? (src.memo ?? "") : memo.trim();

  const calc = useMemo(() => {
    if (!asset) return null;
    const amt = parseUnits(amount);
    const fee = parseUnits(asset.fee) ?? 0n;
    const bal = parseUnits(asset.balance) ?? 0n;
    const min = parseUnits(asset.min) ?? 0n;
    const max = asset.max ? parseUnits(asset.max) : null;
    let error: string | null = null;
    if (amount && amt === null) error = t("withdraw.err.amount");
    else if (amt !== null && decimals(amount) > asset.precision) error = t("withdraw.err.precision", { dp: asset.precision });
    else if (amt !== null && amt <= 0n) error = t("withdraw.err.amount");
    else if (amt !== null && amt < min) error = t("withdraw.err.min");
    else if (amt !== null && max !== null && amt > max) error = t("withdraw.err.max");
    else if (amt !== null && amt + fee > bal) error = t("withdraw.err.balance");
    const maxAmt = bal > fee ? truncate(bal - fee, asset.precision) : 0n;
    return { amt, fee, sum: amt !== null ? amt + fee : null, error, maxAmt: max !== null && maxAmt > max ? max : maxAmt };
  }, [asset, amount, t]);

  const addressError = useMemo(() => {
    if (!asset || !effAddress) return null;
    if (effAddress.length < 10 || /\s/.test(effAddress)) return t("withdraw.err.address");
    if (asset.addressPattern) {
      try {
        if (!new RegExp(asset.addressPattern).test(effAddress)) return t("withdraw.err.address");
      } catch {
        /* 後台設定錯誤時交給伺服器判斷 */
      }
    }
    return null;
  }, [asset, effAddress, t]);

  const memoMissing = !!asset?.memoRequired && !effMemo;
  const detailsValid = !!asset && !!effAddress && !addressError && !memoMissing && calc?.amt != null && !calc.error;

  if (assets.length === 0 && !restored) {
    return (
      <Card>
        <EmptyState title={t("withdraw.noAssets")} />
      </Card>
    );
  }

  const steps = [t("withdraw.step.asset"), t("withdraw.step.details"), t("withdraw.step.confirm")];
  const up = asset?.code.toUpperCase() ?? "";

  return (
    <div className="space-y-6">
      {/* 步驟列 */}
      <ol className="flex items-center gap-2 text-sm">
        {steps.map((s, i) => (
          <li key={i} className="flex flex-1 items-center gap-2 last:flex-none">
            <span
              className={clsx(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                i < step ? "bg-brand-gradient text-white" : i === step ? "border-2 border-brand-blue text-brand-blue" : "border border-border text-muted",
              )}
            >
              {i < step ? <Check size={14} /> : i + 1}
            </span>
            <span className={clsx("hidden sm:inline", i === step ? "font-medium" : "text-muted")}>{s}</span>
            {i < 2 && <span className={clsx("h-px flex-1", i < step ? "bg-brand-teal" : "bg-border")} />}
          </li>
        ))}
      </ol>

      {/* 步驟一：幣種 */}
      {step === 0 && (
        <Card>
          <div className="border-b border-border px-5 py-4 font-semibold">{t("withdraw.chooseAsset")}</div>
          <ul className="divide-y divide-border">
            {assets.map((a) => (
              <li key={a.code}>
                <button
                  type="button"
                  onClick={() => {
                    setCode(a.code);
                    setSourceId(a.sources[0]?.id ?? "new");
                    setAmount("");
                    setStep(1);
                  }}
                  className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-surface-2"
                >
                  <CoinIcon code={a.code} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{a.code.toUpperCase()}</p>
                    <p className="truncate text-xs text-muted">{[a.name, a.network].filter(Boolean).join(" · ")}</p>
                  </div>
                  <div className="text-right">
                    <p className="num font-medium">{fmtAmount(a.balance, a.precision)}</p>
                    <p className="text-xs text-muted">{t("assets.available")}</p>
                  </div>
                  <ChevronRight size={16} className="text-muted" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* 步驟二：地址與數量 */}
      {step === 1 && asset && calc && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div className="flex items-center gap-3">
              <CoinIcon code={asset.code} size={32} />
              <div>
                <p className="font-semibold">{up}</p>
                <p className="text-xs text-muted">{t("withdraw.available", { amount: fmtAmount(asset.balance, asset.precision), code: up })}</p>
              </div>
            </div>
            <button type="button" onClick={() => setStep(0)} className="text-sm text-accent hover:underline">
              {t("withdraw.step.asset")}
            </button>
          </div>

          <div className="space-y-5 px-5 py-5">
            {asset.network && (
              <div className="flex gap-3 rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />
                <div>
                  <p className="font-medium">
                    {t("withdraw.network")}：{asset.network}
                  </p>
                  <p className="mt-0.5 text-text/80">{t("withdraw.networkWarn", { network: asset.network })}</p>
                  {asset.notice && <p className="mt-1 whitespace-pre-line text-text/80">{asset.notice}</p>}
                </div>
              </div>
            )}

            {asset.sources.length > 0 && (
              <fieldset className="space-y-2">
                <legend className="mb-1.5 text-sm font-medium">{t("withdraw.addressBook")}</legend>
                {asset.sources.map((s) => (
                  <label
                    key={s.id}
                    className={clsx(
                      "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5",
                      sourceId === s.id ? "border-brand-blue bg-info-soft" : "border-border hover:bg-surface-2",
                    )}
                  >
                    <input type="radio" name="source" checked={sourceId === s.id} onChange={() => setSourceId(s.id)} className="accent-[var(--brand-blue)]" />
                    <span className="min-w-0 flex-1">
                      {s.label && <span className="block text-sm font-medium">{s.label}</span>}
                      <span className="block break-all font-mono text-xs text-muted">{s.address}</span>
                      {s.memo && <span className="block font-mono text-xs text-muted">Memo: {s.memo}</span>}
                    </span>
                    <button
                      type="button"
                      aria-label="delete"
                      onClick={(e) => {
                        e.preventDefault();
                        startDelete(async () => {
                          await deleteFundSourceAction(s.id);
                          if (sourceId === s.id) setSourceId("new");
                          router.refresh();
                        });
                      }}
                      className="rounded p-1 text-muted hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 size={15} />
                    </button>
                  </label>
                ))}
                <label
                  className={clsx(
                    "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm",
                    sourceId === "new" ? "border-brand-blue bg-info-soft" : "border-border hover:bg-surface-2",
                  )}
                >
                  <input type="radio" name="source" checked={sourceId === "new"} onChange={() => setSourceId("new")} className="accent-[var(--brand-blue)]" />
                  {t("withdraw.newAddress")}
                </label>
              </fieldset>
            )}

            {sourceId === "new" && (
              <>
                <Field label={t("common.address")} htmlFor="address" error={addressError}>
                  <Input
                    id="address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono"
                    placeholder={asset.network ?? ""}
                  />
                </Field>
                {(asset.memoRequired || asset.memoLabel) && (
                  <Field
                    label={`${asset.memoLabel || t("common.memo")}${asset.memoRequired ? "" : ` (${t("common.optional")})`}`}
                    htmlFor="memo"
                    error={memoMissing && memo !== "" ? t("withdraw.err.memo", { label: asset.memoLabel || "Memo" }) : undefined}
                  >
                    <Input id="memo" value={memo} onChange={(e) => setMemo(e.target.value)} autoComplete="off" className="font-mono" />
                  </Field>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
                    {t("withdraw.saveAddress")}
                  </label>
                  {save && (
                    <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("withdraw.addressLabel")} className="h-9 max-w-56" maxLength={40} />
                  )}
                </div>
              </>
            )}

            <Field
              label={t("withdraw.amount")}
              htmlFor="amount"
              error={calc.error}
              hint={[t("withdraw.min", { amount: fmtAmount(asset.min, asset.precision), code: up }), asset.max ? t("withdraw.maxLimit", { amount: fmtAmount(asset.max, asset.precision), code: up }) : null]
                .filter(Boolean)
                .join(" · ")}
            >
              <div className="relative">
                <Input
                  id="amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                  className="num pr-28 text-lg"
                  placeholder="0.00"
                  autoComplete="off"
                />
                <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-2">
                  <span className="text-sm text-muted">{up}</span>
                  <button type="button" onClick={() => setAmount(formatUnits(calc.maxAmt))} className="rounded-md bg-accent-soft px-2 py-1 text-xs font-medium text-accent">
                    {t("withdraw.max")}
                  </button>
                </div>
              </div>
            </Field>

            <div className="rounded-lg bg-surface-2 px-4 py-3 text-sm">
              <div className="flex justify-between py-1">
                <span className="text-muted">{t("common.fee")}</span>
                <span className="num">
                  {fmtAmount(asset.fee, asset.precision)} {up}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted">{t("withdraw.deduct")}</span>
                <span className="num">{calc.sum !== null ? `${fmtAmount(formatUnits(calc.sum), asset.precision)} ${up}` : "—"}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2 mt-1">
                <span className="font-medium">{t("withdraw.receive")}</span>
                <span className="num text-base font-semibold">{calc.amt !== null ? `${fmtAmount(formatUnits(calc.amt), asset.precision)} ${up}` : "—"}</span>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="secondary" type="button" onClick={() => setStep(0)}>
                {t("common.back")}
              </Button>
              <Button type="button" disabled={!detailsValid} onClick={() => setStep(2)}>
                {t("common.next")}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* 步驟三：確認並以 CAFECA 簽署 */}
      {step === 2 && (
        <Card className="overflow-hidden">
          {asset && calc && !restored && (
            <div className="border-b border-border px-5 py-5">
              <h2 className="font-semibold">{t("withdraw.review")}</h2>
              <div className="mt-4 rounded-xl bg-navy p-5 text-white">
                <p className="text-xs text-white/60">{t("withdraw.receive")}</p>
                <p className="num mt-1 text-3xl font-semibold">
                  {fmtAmount(formatUnits(calc.amt ?? 0n), asset.precision)} <span className="text-lg font-normal text-white/70">{up}</span>
                </p>
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-white/60">{t("withdraw.network")}</dt>
                    <dd>{asset.network ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="shrink-0 text-white/60">{t("common.address")}</dt>
                    <dd className="break-all text-right font-mono text-xs">{effAddress}</dd>
                  </div>
                  {effMemo && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-white/60">{asset.memoLabel || t("common.memo")}</dt>
                      <dd className="font-mono text-xs">{effMemo}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-4">
                    <dt className="text-white/60">{t("common.fee")}</dt>
                    <dd className="num">
                      {fmtAmount(asset.fee, asset.precision)} {up}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-white/60">{t("withdraw.deduct")}</dt>
                    <dd className="num">
                      {fmtAmount(formatUnits(calc.sum ?? 0n), asset.precision)} {up}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          )}
          <div className="space-y-4 px-5 py-5">
            <div>
              <h3 className="font-semibold">{t("withdraw.signTitle")}</h3>
              <p className="mt-1 text-sm text-muted">{t("withdraw.signDesc")}</p>
            </div>
            {!restored && (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
                {t("withdraw.agree")}
              </label>
            )}
            {restored && <Alert tone="info">{t("common.loading")}</Alert>}
            <CafecaButton
              wallet={wallet}
              mock={mock}
              disabled={!restored && !agree}
              getRequest={async () => {
                const r = await prepareWithdrawAction({
                  currencyCode: code,
                  address: effAddress,
                  memo: effMemo || undefined,
                  amount,
                  saveAddress: sourceId === "new" && save,
                  label: label || undefined,
                });
                return r.ok ? { ok: true, request: r.request } : r;
              }}
              onResponse={async (response) => {
                const r = await completeWithdrawAction(response);
                if (r.ok) {
                  router.push(`/app/withdraw/${r.id}?created=1`);
                  router.refresh();
                }
                return r;
              }}
            >
              {t("withdraw.signButton")}
            </CafecaButton>
            {!restored && (
              <div className="flex justify-start">
                <Button variant="ghost" type="button" onClick={() => setStep(1)}>
                  {t("common.back")}
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
