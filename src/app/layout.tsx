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
    <html lang="en" className={`${inter.variable} ${poppins.variable} h-full`} suppressHydrationWarning>
      <head>
        {/*
          Applies the saved theme BEFORE React hydrates and before first paint.
          Doing this in an effect instead causes a hydration mismatch (the
          server renders no data-theme, the client adds one) and a flash of the
          wrong theme. suppressHydrationWarning on <html> covers the attribute
          this script writes, and nothing else.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("gs-theme");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
