import Link from "next/link";
import clsx from "clsx";

/** 舊站 Logo：深色底用白字版、淺色底用深藍字版 */
export function Logo({ tone = "dark", height = 28, href = "/", className }: { tone?: "dark" | "light"; height?: number; href?: string; className?: string }) {
  const src = tone === "light" ? "/brand/wordmark-white.png" : "/brand/wordmark-dark.png";
  return (
    <Link href={href} className={clsx("inline-flex items-center", className)} aria-label="TideBit">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="TideBit" style={{ height, width: "auto" }} />
    </Link>
  );
}

export function Mark({ size = 40, className }: { size?: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/mark.png" alt="" width={size} height={size} className={className} aria-hidden />;
}
