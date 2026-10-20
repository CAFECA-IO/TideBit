import type { Metadata, Viewport } from "next";
import { getI18n } from "@/i18n/server";
import { I18nProvider } from "@/i18n/client";
import { env } from "@/lib/env";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    metadataBase: new URL(env.appOrigin),
    title: { default: "TideBit", template: "%s · TideBit" },
    description: t("landing.lead"),
    robots: { index: false, follow: false },
    openGraph: { images: ["/brand/og.jpg"], title: "TideBit", description: t("landing.lead") },
  };
}

export const viewport: Viewport = {
  themeColor: "#2a3560",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { locale, dict } = await getI18n();
  return (
    <html lang={locale} className="h-full">
      <body className="min-h-full">
        <I18nProvider locale={locale} dict={dict}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
