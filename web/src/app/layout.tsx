import type { Metadata } from "next";
import "./globals.css";
import { getLocale } from "@/lib/i18n";

export const metadata: Metadata = {
  title: { default: "FastRobox Smart Classroom", template: "%s · FastRobox" },
  description: "AI-powered smart classroom: safety, access and vision.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
