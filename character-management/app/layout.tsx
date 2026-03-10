import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DND Character Management",
  description: "Basic DND utility interface",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-50 text-slate-900`}
      >
        <div className="flex flex-col min-h-dvh">
          <header className="border-b border-slate-200 bg-white sticky top-0 z-50">
            <nav className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
              <Link href="/" className="text-lg font-semibold tracking-tight">
                DND Utils
              </Link>
              <div className="flex items-center gap-5 text-sm font-medium text-slate-700">
                <Link href="/" className="hover:text-slate-900">
                  Home
                </Link>
                <Link href="/main" className="hover:text-slate-900">
                  Characters
                </Link>
              </div>
            </nav>
          </header>
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
