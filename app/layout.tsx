import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SLEEVE — A personal record collection",
  description:
    "A quiet place for your records. An immersive, personal album collection.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
