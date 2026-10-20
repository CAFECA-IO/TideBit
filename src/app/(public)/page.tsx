import { ArrowRight, BadgeCheck, KeyRound, Send, ShieldAlert } from "lucide-react";
import { Logo } from "@/components/brand";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ButtonLink } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { getSettings } from "@/lib/settings";
import { getCurrentMember } from "@/lib/auth";

export default async function Landing() {
  const [{ t, locale }, settings, member] = await Promise.all([getI18n(), getSettings(), getCurrentMember()]);
  const announcement = settings.announcement[locale] || settings.announcement["zh-TW"];

  const steps = [
    { icon: KeyRound, title: t("landing.step1.title"), desc: t("landing.step1.desc") },
    { icon: BadgeCheck, title: t("landing.step2.title"), desc: t("landing.step2.desc") },
    { icon: Send, title: t("landing.step3.title"), desc: t("landing.step3.desc") },
  ];
  const faqs = [1, 2, 3, 4].map((i) => ({
    q: t(`landing.faq${i}.q` as "landing.faq1.q"),
    a: t(`landing.faq${i}.a` as "landing.faq1.a"),
  }));

  return (
    <div className="min-h-screen">
      <section className="relative overflow-hidden bg-navy text-white">
        <div className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-brand-gradient opacity-25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-56 -left-40 h-[420px] w-[420px] rounded-full bg-brand-gradient opacity-15 blur-3xl" />
        <header className="relative mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
          <Logo tone="light" height={30} />
          <div className="flex items-center gap-2">
            <LocaleSwitcher tone="onDark" />
          </div>
        </header>

        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-10 sm:px-6 sm:pt-16">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-medium text-white/80">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-green" />
            {t("landing.badge")}
          </span>
          <h1 className="mt-5 max-w-3xl text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">{t("landing.title")}</h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/75 sm:text-lg">{t("landing.lead")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href={member ? "/app" : "/login"} size="lg" className="bg-white !text-navy hover:bg-white/90">
              {t("landing.login")}
              <ArrowRight size={18} />
            </ButtonLink>
          </div>
          {announcement && (
            <div className="mt-10 max-w-3xl rounded-xl border border-white/15 bg-white/5 px-5 py-4 text-sm leading-relaxed text-white/85 whitespace-pre-line">
              {announcement}
            </div>
          )}
        </div>
      </section>

      <section className="relative z-10 mx-auto -mt-10 max-w-6xl px-4 sm:px-6">
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
          <h2 className="text-lg font-semibold">{t("landing.stepsTitle")}</h2>
          <ol className="mt-6 grid gap-6 md:grid-cols-3">
            {steps.map((s, i) => (
              <li key={i} className="relative">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-gradient text-white">
                    <s.icon size={20} aria-hidden />
                  </span>
                  <span className="text-xs font-semibold tracking-wider text-muted">STEP {i + 1}</span>
                </div>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl items-start gap-6 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="rounded-2xl border border-warning/30 bg-warning-soft p-6">
          <div className="flex items-center gap-2 font-semibold text-warning">
            <ShieldAlert size={20} aria-hidden />
            {t("landing.noticeTitle")}
          </div>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-text">
            <li>• {t("landing.notice1")}</li>
            <li>• {t("landing.notice2")}</li>
            <li>• {t("landing.notice3")}</li>
          </ul>
        </div>
        <div>
          <h2 className="text-lg font-semibold">{t("landing.faqTitle")}</h2>
          <div className="mt-4 divide-y divide-border rounded-2xl border border-border bg-surface">
            {faqs.map((f, i) => (
              <details key={i} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {f.q}
                  <span className="text-muted transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-muted">{f.a}</p>
              </details>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted">
            {settings.supportEmail && (
              <a className="text-accent hover:underline" href={`mailto:${settings.supportEmail}`}>
                {settings.supportEmail}
              </a>
            )}
          </p>
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-xs text-muted">{t("landing.footer")}</footer>
    </div>
  );
}
