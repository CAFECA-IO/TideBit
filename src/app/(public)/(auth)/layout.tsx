import { Logo } from "@/components/brand";
import { LocaleSwitcher } from "@/components/locale-switcher";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo height={28} />
        <LocaleSwitcher />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:pt-16">
        <div className="w-full max-w-md">
          <div className="h-1 rounded-t-2xl bg-brand-gradient" />
          <div className="rounded-b-2xl border border-t-0 border-border bg-surface p-6 shadow-sm sm:p-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
