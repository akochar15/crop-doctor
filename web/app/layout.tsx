import type { Metadata, Viewport } from "next";
import { Anek_Devanagari, Anek_Latin, Noto_Serif } from "next/font/google";
import { Suspense } from "react";
import ServerWaker from "@/components/ServerWaker";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import "./globals.css";
import { cn } from "@/lib/utils";

// Anek has a Latin and a Devanagari cut drawn as one family, so mixed lines ("KVK से पुष्टि करें") match.
// Devanagari is not preloaded: its unicode-range means English-only visitors never download it.
const anek = Anek_Latin({ variable: "--font-anek", subsets: ["latin"], display: "swap" });
const anekDeva = Anek_Devanagari({ variable: "--font-anek-deva", subsets: ["devanagari"], display: "swap", preload: false });
// Only for the italic accent word and the step numbers.
const serif = Noto_Serif({ variable: "--font-serif-i", subsets: ["latin"], weight: "500", style: "italic", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Crop Doctor", template: "%s · Crop Doctor" },
  description:
    "An honest crop disease assistant for tomato and potato farmers: it answers when it's sure and asks an expert when it isn't.",
};

export const viewport: Viewport = { themeColor: "#f5f1e8", width: "device-width", initialScale: 1 };

// Runs before the first paint: saved choice, else the phone's setting. Prevents a white flash in dark mode.
const THEME_SCRIPT = `try{var t=localStorage.getItem("cd_theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t;if(localStorage.getItem("cd_language")==="Hindi")document.documentElement.lang="hi";if(t==="dark"){var m=document.querySelector('meta[name="theme-color"]');m&&m.setAttribute("content","#0b120e")}}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={cn("h-full antialiased font-sans", anek.variable, anekDeva.variable, serif.variable)} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-surface focus:px-3 focus:py-2">
          Skip to content
        </a>
        {/* The header reads ?case= to show the check's own back link, so it renders inside Suspense. */}
        <Suspense fallback={<div className="h-[72px]" />}>
          <SiteHeader />
        </Suspense>
        <ServerWaker />
        <main id="main" className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
