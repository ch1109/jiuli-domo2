import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "九立 Demo",
  description: "九立新流程 Demo 智能核对工作台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
