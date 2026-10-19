import type { Metadata } from "next";
import "./globals.css";
import "./elements.css";
export const metadata: Metadata = {
  title: "ZeroCode · Test çalışma alanı",
  description: "İş niyetinden kanıtlanabilir web testine.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
