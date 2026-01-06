import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/sections/Footer";
import { SuppressFastRefreshLogs } from "@/components/SuppressFastRefreshLogs";
import { ConditionalLayout } from "@/components/ConditionalLayout";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://moonjapan.com"),
  title: "株式会社MoonJapan",
  description: "株式会社MoonJapanの公式サイト",
  openGraph: {
    title: "株式会社MoonJapan",
    description: "株式会社MoonJapanの公式サイト",
    url: process.env.NEXT_PUBLIC_SITE_URL || "https://moonjapan.com",
    siteName: "MoonJapan",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
      },
    ],
    locale: "ja_JP",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>
        <SuppressFastRefreshLogs />
        <ConditionalLayout>
          {children}
        </ConditionalLayout>
      </body>
    </html>
  );
}

