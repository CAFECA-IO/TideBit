"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/client";
import type { DictKey } from "@/i18n/dict/zh-TW";
import type { CafecaRequest } from "@/app/app/actions";
import { Alert, Button } from "./ui";

type SignInOpts = { nonce: string | (() => Promise<string>); statement?: string; claims?: string[]; redirectUri?: string };
type CafecaClient = {
  signIn(o: SignInOpts): Promise<unknown>;
  redirect(o: SignInOpts): Promise<void>;
};
declare global {
  interface Window {
    CafecaConnect?: {
      create(o: { wallet: string }): CafecaClient;
      handleRedirect(): { response?: unknown; error?: { code: string } } | null;
    };
  }
}

/** 取得 CAFECA 簽署請求（nonce 由伺服器發出並綁定目前 session） */
export type GetRequest = () => Promise<{ ok: true; request: CafecaRequest } | { ok: false; error: string }>;

/**
 * 「以 CAFECA 簽署」按鈕：預設彈出視窗，被擋時可改用整頁導向。
 * 回應交給 onResponse（Server Action）在後端驗證；前端拿到的結果不可信任。
 */
export function CafecaButton({
  wallet,
  mock,
  getRequest,
  onResponse,
  children,
  disabled,
  size = "lg",
  className,
}: {
  wallet: string;
  mock: boolean;
  getRequest: GetRequest;
  onResponse: (response: unknown) => Promise<{ ok: boolean; error?: string }>;
  children: ReactNode;
  disabled?: boolean;
  size?: "md" | "lg";
  className?: string;
}) {
  const { t } = useI18n();
  const [ready, setReady] = useState(mock || (typeof window !== "undefined" && !!window.CafecaConnect));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const client = useRef<CafecaClient | null>(null);
  const handled = useRef(false);

  const errText = useCallback(
    (code: string | undefined, fallback?: string) => {
      const key = `identity.err.${code}` as DictKey;
      const s = t(key);
      return s === key ? fallback || t("identity.err.verify_failed") : s;
    },
    [t],
  );

  const finish = useCallback(
    async (response: unknown) => {
      setBusy(true);
      try {
        const r = await onResponse(response);
        if (!r.ok) setError(r.error ?? t("common.error"));
      } catch {
        setError(t("common.error"));
      } finally {
        setBusy(false);
      }
    },
    [onResponse, t],
  );

  // 整頁導向回來：網址 #cafeca= 帶有結果
  useEffect(() => {
    if (!ready || mock || handled.current || !window.CafecaConnect) return;
    handled.current = true;
    const back = window.CafecaConnect.handleRedirect();
    // 與外部狀態（網址 fragment）同步
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (back?.error) setError(errText(back.error.code));
    else if (back?.response) void finish(back.response);
  }, [ready, mock, finish, errText]);

  function getClient() {
    if (!client.current && window.CafecaConnect) client.current = window.CafecaConnect.create({ wallet });
    return client.current;
  }

  async function run(mode: "popup" | "redirect") {
    setError(null);
    setBlocked(false);

    if (mock) {
      setBusy(true);
      const r = await getRequest();
      if (!r.ok) {
        setBusy(false);
        return setError(r.error);
      }
      await new Promise((res) => setTimeout(res, 600));
      return finish({ mock: true, account: r.request.mock?.account, message: { nonce: r.request.nonce }, claims: r.request.mock?.claims });
    }

    const c = getClient();
    if (!c) return setError(t("identity.err.sdk"));
    // SDK 先同步開啟視窗、再等待 nonce，並在 nonce 取得後才讀取 statement / claims 組成請求，
    // 因此在 nonce 函式中把伺服器決定的說明與 claims 寫回 opts。
    const opts: SignInOpts = {
      nonce: async () => {
        const r = await getRequest();
        if (!r.ok) throw Object.assign(new Error(r.error), { code: "server" });
        opts.statement = r.request.statement;
        opts.claims = r.request.claims;
        return r.request.nonce;
      },
    };
    try {
      if (mode === "redirect") {
        setBusy(true);
        opts.redirectUri = window.location.href.split("#")[0];
        await c.redirect(opts);
        return;
      }
      const response = await c.signIn(opts);
      await finish(response);
    } catch (e) {
      const err = e as { code?: string; message?: string };
      if (err.code === "popup_blocked") setBlocked(true);
      setError(err.code === "server" ? (err.message ?? t("common.error")) : errText(err.code, err.message));
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      {!mock && <Script src={`${wallet}/sdk/cafeca-connect.js`} strategy="afterInteractive" onReady={() => setReady(true)} onError={() => setError(t("identity.err.sdk"))} />}
      {mock && <Alert tone="warning" className="mb-3">{t("identity.mockNotice")}</Alert>}
      {error && <Alert tone="danger" className="mb-3">{error}</Alert>}
      <Button type="button" size={size} className="w-full" disabled={disabled || busy || !ready} onClick={() => run("popup")} aria-busy={busy}>
        {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden /> : <CafecaGlyph />}
        {children}
      </Button>
      {blocked && (
        <button type="button" onClick={() => run("redirect")} className="mt-2 w-full text-center text-sm text-accent hover:underline">
          {t("identity.err.popup_blocked")} →
        </button>
      )}
    </div>
  );
}

function CafecaGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="6" stroke="currentColor" strokeWidth="2" />
      <path d="M15.5 9.2A4 4 0 1 0 15.5 14.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
