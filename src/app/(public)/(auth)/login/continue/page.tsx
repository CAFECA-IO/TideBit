import { redirect } from "next/navigation";
import { getMemberSession } from "@/lib/auth";

/**
 * 登入後的中繼頁：確認瀏覽器確實保存並送回了 session cookie。
 * 若沒有（瀏覽器封鎖 Cookie、或在 http 頁面拒收 Secure cookie），導回登入頁並顯示提示，
 * 避免「按下登入後又回到登入頁、卻沒有任何訊息」。
 */
export default async function LoginContinue() {
  redirect((await getMemberSession()) ? "/app" : "/login?expired=1");
}
