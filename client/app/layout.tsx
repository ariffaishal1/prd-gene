import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ruang PRD — AI Product Workshop",
  description: "Susun PRD terstruktur melalui percakapan discovery bersama AI."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
