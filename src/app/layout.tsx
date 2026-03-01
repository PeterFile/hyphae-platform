import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";
import { ReactQueryProvider } from "./query-provider";
import { CompareFloatingBar } from "@/components/store/compare-floating-bar";
import { TopNav } from "@/components/layout/top-nav";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Hyphae — Agent Store",
  description:
    "Discover AI agents across Coinbase and Thirdweb. Unified search, real-time availability, and USDC price comparison.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.variable} antialiased`}>
        <ReactQueryProvider>
          <TopNav />
          {children}
          <CompareFloatingBar />
        </ReactQueryProvider>
      </body>
    </html>
  );
}
