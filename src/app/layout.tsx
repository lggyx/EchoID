import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "声音照妖镜 · VBTI",
  description:
    "60 秒声学取证。系统只听声音,不问对错,给你一份判决书。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#1A1A1A",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        {/* VBTI display fonts. Ma Shan Zheng = brushed calligraphy for
            headline; Noto Sans SC covers body + heading weights;
            JetBrains Mono is the data / Exhibit-tag typeface. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&family=Noto+Sans+SC:wght@400;500;700;900&family=Noto+Serif+SC:wght@400;700;900&family=JetBrains+Mono:wght@400;500;700&family=Cinzel:wght@600;800&display=swap"
        />
      </head>
      <body>
        <div className="grain" aria-hidden />
        <div className="spotlight" aria-hidden />
        {children}
      </body>
    </html>
  );
}
