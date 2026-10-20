import Link from "next/link";
import clsx from "clsx";

/**
 * 舊站 Logo：深色底用白字版、淺色底用深藍字版。
 * 預設 auto：依系統深淺色模式切換（深色模式時頁首背景為深色）。
 */
export function Logo({ tone = "auto", height = 28, href = "/", className }: { tone?: "auto" | "dark" | "light"; height?: number; href?: string; className?: string }) {
  const style = { height, width: "auto" } as const;
  return (
    <Link href={href} className={clsx("inline-flex items-center", className)} aria-label="TideBit">
      {tone === "auto" ? (
        <picture>
          <source srcSet="/brand/wordmark-white.png" media="(prefers-color-scheme: dark)" />
          <img src="/brand/wordmark-dark.png" alt="TideBit" style={style} />
        </picture>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={tone === "light" ? "/brand/wordmark-white.png" : "/brand/wordmark-dark.png"} alt="TideBit" style={style} />
      )}
    </Link>
  );
}

export function Mark({ size = 40, className }: { size?: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/mark.png" alt="" width={size} height={size} className={className} aria-hidden />;
}
