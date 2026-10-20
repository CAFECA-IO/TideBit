"use client";

import { useState } from "react";
import clsx from "clsx";

/** 幣種圖示：沿用舊站 public/coins/*.png，沒有圖示時顯示代號縮寫 */
export function CoinIcon({ code, size = 32, className }: { code: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold",
        failed ? "bg-navy text-white" : "bg-white",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.32) }}
      aria-hidden
    >
      {failed ? (
        code.slice(0, 3).toUpperCase()
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/coins/${code.toLowerCase()}.png`} alt="" width={size} height={size} className="h-full w-full object-contain" onError={() => setFailed(true)} />
      )}
    </span>
  );
}
