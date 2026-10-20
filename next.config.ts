import type { NextConfig } from "next";

// 所有允許網址都是 https 才加 HSTS（未設定時預設 legacy.tidebit-defi.com、tidebit.com）
const allHttps = (process.env.APP_ORIGINS || process.env.APP_ORIGIN || "https://legacy.tidebit-defi.com,https://tidebit.com")
  .split(/[,\s]+/)
  .filter(Boolean)
  .every((o) => !/^http:\/\//i.test(o));

const nextConfig: NextConfig = {
  // 此站幾乎所有頁面都依登入狀態與即時餘額產生，不使用 Cache Components，維持逐次請求動態渲染。
  cacheComponents: false,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // 正式環境強制 HTTPS（與舊系統 config.force_ssl 相同的保護）；本機 http://localhost 開發不加
          ...(process.env.NODE_ENV === "production" && allHttps
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
