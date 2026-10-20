import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import clsx from "clsx";
import type { T } from "@/i18n/server";

export function Pagination({
  page,
  hasNext,
  basePath,
  params,
  t,
}: {
  page: number;
  hasNext: boolean;
  basePath: string;
  params: Record<string, string | undefined>;
  t: T;
}) {
  if (page === 1 && !hasNext) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    if (p > 1) sp.set("page", String(p));
    const q = sp.toString();
    return q ? `${basePath}?${q}` : basePath;
  };
  const cls = "inline-flex h-8 items-center gap-1 rounded-lg border border-border px-3 text-sm";
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
      {page > 1 ? (
        <Link href={href(page - 1)} className={clsx(cls, "hover:bg-surface-2")}>
          <ChevronLeft size={14} /> {t("common.prev")}
        </Link>
      ) : (
        <span className={clsx(cls, "opacity-40")}>
          <ChevronLeft size={14} /> {t("common.prev")}
        </span>
      )}
      <span className="text-muted">{t("common.page", { page })}</span>
      {hasNext ? (
        <Link href={href(page + 1)} className={clsx(cls, "hover:bg-surface-2")}>
          {t("common.nextPage")} <ChevronRight size={14} />
        </Link>
      ) : (
        <span className={clsx(cls, "opacity-40")}>
          {t("common.nextPage")} <ChevronRight size={14} />
        </span>
      )}
    </div>
  );
}
