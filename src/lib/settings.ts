import "server-only";
import { db } from "./db";
import { LOCALES, type Locale } from "@/i18n/config";

/**
 * 設定存在既有的 system_configs 表（key_1 = "tidebit"），公告存在 announcements（platform = "tidebit-v2"）。
 * 只新增／更新資料列，不變更資料表結構。
 */
export const CONFIG_NS = "tidebit";
export const ANNOUNCEMENT_PLATFORM = "tidebit-v2";

export type Settings = {
  withdrawPaused: boolean;
  identityAutoApprove: boolean;
  announcement: Partial<Record<Locale, string>>;
  supportEmail: string;
  cafecaSignupUrl: string;
};

const DEFAULTS: Omit<Settings, "announcement"> = {
  withdrawPaused: false,
  identityAutoApprove: true,
  supportEmail: "support@tidebit.com",
  cafecaSignupUrl: "https://cafeca.io",
};

export async function getConfig<T>(key2: string, key3 = ""): Promise<T | undefined> {
  const r = await db.systemConfig.findFirst({ where: { key1: CONFIG_NS, key2, key3, key4: "", key5: "", key6: "" } });
  if (!r?.value) return undefined;
  try {
    return JSON.parse(r.value) as T;
  } catch {
    return undefined;
  }
}

export async function listConfigs<T>(key2: string) {
  const rows = await db.systemConfig.findMany({ where: { key1: CONFIG_NS, key2 } });
  const out = new Map<string, T>();
  for (const r of rows) {
    try {
      if (r.value) out.set(r.key3, JSON.parse(r.value) as T);
    } catch {
      /* 略過格式錯誤的設定 */
    }
  }
  return out;
}

export async function setConfig(key2: string, key3: string, value: unknown, description?: string) {
  const now = new Date();
  const where = { key1_key2_key3_key4_key5_key6: { key1: CONFIG_NS, key2, key3, key4: "", key5: "", key6: "" } };
  await db.systemConfig.upsert({
    where,
    create: {
      key1: CONFIG_NS, key2, key3, key4: "", key5: "", key6: "",
      description: description ?? `TideBit ${key2} ${key3}`.trim(),
      isReadonly: 0, isVisible: 0, dataType: "json", inputType: "text_area",
      value: JSON.stringify(value), createdAt: now, updatedAt: now,
    },
    update: { value: JSON.stringify(value), updatedAt: now },
  });
}

export async function getSettings(): Promise<Settings> {
  const [general, anns] = await Promise.all([
    getConfig<Partial<Settings>>("settings"),
    db.announcement.findMany({ where: { platform: ANNOUNCEMENT_PLATFORM, isActive: 1 } }),
  ]);
  const now = Date.now();
  const announcement: Settings["announcement"] = {};
  for (const a of anns) {
    if ((a.start && a.start.getTime() > now) || (a.end && a.end.getTime() < now)) continue;
    if ((LOCALES as readonly string[]).includes(a.lang)) announcement[a.lang as Locale] = a.text;
  }
  return { ...DEFAULTS, ...(general ?? {}), announcement };
}

export async function saveSettings(s: Settings, adminId: bigint) {
  const { announcement, ...general } = s;
  await setConfig("settings", "", general, "TideBit 結束營運版系統設定");
  const now = new Date();
  for (const l of LOCALES) {
    const text = announcement[l]?.trim().slice(0, 255) ?? "";
    const existing = await db.announcement.findFirst({ where: { platform: ANNOUNCEMENT_PLATFORM, lang: l } });
    if (existing) {
      await db.announcement.update({ where: { id: existing.id }, data: { text, isActive: text ? 1 : 0, updatedAt: now } });
    } else if (text) {
      await db.announcement.create({
        data: { text, link: "", isActive: 1, lang: l, platform: ANNOUNCEMENT_PLATFORM, createdById: adminId, createdAt: now, updatedAt: now },
      });
    }
  }
}
