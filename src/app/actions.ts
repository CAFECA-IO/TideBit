"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { destroySession } from "@/lib/session";
import { LOCALE_COOKIE, isLocale } from "@/i18n/config";

export async function setLocaleAction(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 365 * 86400, sameSite: "lax" });
  revalidatePath("/", "layout");
}

export async function logoutAction() {
  await destroySession("M");
  redirect("/");
}

export async function adminLogoutAction() {
  await destroySession("A");
  redirect("/admin/login");
}
