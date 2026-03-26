import type { Metadata } from "next";
import localFont from "next/font/local";

import { ReaderStateProvider } from "../components/reader-state-provider";
import "./globals.css";

const codexSans = localFont({
  src: "./fonts/NotoSansSC-VF.ttf",
  variable: "--font-codex-sans",
  weight: "100 900",
  display: "swap",
});

const codexSerif = localFont({
  src: "./fonts/NotoSerifSC-VF.ttf",
  variable: "--font-codex-serif",
  weight: "200 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "5E 不全书 Codex",
    template: "%s · 5E 不全书 Codex",
  },
  description: "基于 Next.js 的 5E 不全书现代化静态阅读器。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-Hans"
      className={`${codexSans.variable} ${codexSerif.variable}`}
    >
      <body>
        <ReaderStateProvider>{children}</ReaderStateProvider>
      </body>
    </html>
  );
}
