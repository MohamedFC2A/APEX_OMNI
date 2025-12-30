import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Cairo } from "next/font/google";
import { LiquidGlassProvider } from "@/components/LiquidGlassProvider";
import "./globals.css";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const cairo = Cairo({
  variable: "--font-ar",
  subsets: ["arabic", "latin"],
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: "NEXUS AI - Made by Mohamed Matany",
  description: "Multi-Stage Hyper-Reasoning Engine by Mohamed Matany",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${jetBrainsMono.variable} ${cairo.variable} antialiased`}
        suppressHydrationWarning
      >
        <LiquidGlassProvider>{children}</LiquidGlassProvider>
      </body>
    </html>
  );
}
