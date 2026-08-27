import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Health Dashboard",
  description: "Estado y costos de todos los proyectos",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-[#f7f7f8] text-zinc-900 font-[family-name:var(--font-geist-mono)]">
        <main className="max-w-6xl mx-auto px-4 py-8 sm:px-6">
          {children}
        </main>
      </body>
    </html>
  );
}
