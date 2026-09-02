import type { Metadata } from "next";
import { Inter, Poppins } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

/* §9.3 — Inter carries everything; Poppins 600 is reserved for the wordmark,
   workspace titles, and the morning-brief headline. Self-hosted by next/font,
   so there is no layout shift and no third-party font request. */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Growth Studio",
  description: "Partner-led sales intelligence for Kognoz and Konverz AI.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${poppins.variable} h-full`}>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
