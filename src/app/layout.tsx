import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EchoID · 你说话像谁",
  description:
    "对着麦克风说 20 秒,EchoID 用真实声学特征为你画出一张说话风格卡片。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#120F17",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="dark">
      <head>
        {/* Fonts inspired by reactbits.dev — Bricolage for display, Noto SC for CJK. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&family=Noto+Sans+SC:wght@300;400;500;700&family=Google+Sans+Code:wght@300..700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
