"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, Check, Languages } from "lucide-react";
import { NATIVE, setLanguage, useLanguage, useT } from "@/lib/i18n";
import ThemeToggle from "./ThemeToggle";

/** The square mark: a leaf inside viewfinder corners. `size` is the outer square in px. */
export function Mark({ size = 34, corners = true }: { size?: number; corners?: boolean }) {
  const k = size / 34;
  return (
    <span aria-hidden="true" className="relative block shrink-0 bg-ink" style={{ width: size, height: size, borderRadius: 10 * k }}>
      <span className="absolute bg-background" style={{ left: 10 * k, top: 10 * k, width: 14 * k, height: 14 * k, borderRadius: "0 100% 0 100%" }} />
      {corners && (
        <>
          <span className="absolute border-background opacity-55" style={{ left: 5 * k, top: 5 * k, width: 6 * k, height: 6 * k, borderTopWidth: 1.5, borderLeftWidth: 1.5 }} />
          <span className="absolute border-background opacity-55" style={{ right: 5 * k, bottom: 5 * k, width: 6 * k, height: 6 * k, borderBottomWidth: 1.5, borderRightWidth: 1.5 }} />
        </>
      )}
    </span>
  );
}

// Short label for the header button: "EN" for English, the language's own name otherwise.
const SHORT = (l: string) => (l === "English" ? "EN" : NATIVE[l] ?? l);

/** One setting drives the screen text and the AI reply language, so the header offers all eight. */
function LanguageMenu() {
  const language = useLanguage();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="listbox"
        className="flex h-12 items-center gap-1.5 rounded-full px-2.5 text-base font-semibold text-ink hover:bg-surface-2">
        <Languages className="h-[18px] w-[18px]" aria-hidden="true" />
        <span className="sr-only">Language / भाषा: </span>{SHORT(language)}
      </button>
      {open && (
        <ul role="listbox" aria-label="Language / भाषा"
          className="absolute right-0 top-full z-40 mt-1 w-64 rounded-[18px] border border-border bg-surface p-1.5 shadow-float">
          {Object.entries(NATIVE).map(([value, name]) => {
            const on = value === language;
            return (
              <li key={value}>
                <button type="button" role="option" aria-selected={on} onClick={() => { setLanguage(value); setOpen(false); }}
                  className={`flex min-h-12 w-full items-center justify-between gap-2 rounded-xl px-3 text-left font-semibold text-ink hover:bg-surface-2 ${on ? "bg-surface-2" : ""}`}>
                  <span className="flex items-center gap-2">{on && <Check className="h-4 w-4" aria-hidden="true" />}{name}</span>
                  <span className="text-[13px] font-medium text-ink-3">{value}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex h-12 items-center gap-1.5 text-base font-semibold text-ink-2 hover:text-ink">
      <ArrowLeft className="h-5 w-5" aria-hidden="true" />{children}
    </Link>
  );
}

/** Home and expert: the mark, language and theme. A check: a back link. A result: back link and "New photo". */
export function SiteHeader() {
  const path = usePathname();
  const params = useSearchParams();
  const t = useT();
  const caseId = path === "/check" ? Number(params.get("case")) || null : null;
  const wide = path.startsWith("/expert");

  if (path === "/check")
    return (
      <header className="mx-auto flex w-full max-w-xl items-center justify-between gap-3 px-4 py-2.5">
        {caseId ? (
          <>
            <BackLink href="/check">{t("checkNo")} #{caseId}</BackLink>
            <Link href="/check" className="flex h-11 items-center gap-1.5 whitespace-nowrap rounded-full border border-border px-4 text-[15px] font-semibold text-ink hover:bg-surface-2">
              <Camera className="h-[18px] w-[18px]" aria-hidden="true" />{t("newPhoto")}
            </Link>
          </>
        ) : (
          <>
            <BackLink href="/">{t("home")}</BackLink>
            <LanguageMenu />
          </>
        )}
      </header>
    );

  return (
    <header className={`mx-auto flex w-full items-center justify-between gap-3 py-3 pl-5 pr-3 ${wide ? "max-w-5xl" : "max-w-xl"}`}>
      <Link href="/" className="flex min-h-12 items-center gap-2.5 text-xl font-bold tracking-[-0.02em] text-ink hover:text-ink">
        <Mark />
        <span>Crop Doctor</span>
      </Link>
      <nav className="flex items-center" aria-label="Settings">
        <LanguageMenu />
        <ThemeToggle />
      </nav>
    </header>
  );
}

/** Home and expert pages only: the result screens end with the chat box instead. */
export function SiteFooter() {
  const t = useT();
  const path = usePathname();
  if (path === "/check") return null;
  return (
    <footer className={`mx-auto w-full px-5 ${path.startsWith("/expert") ? "max-w-5xl" : "max-w-xl"}`}>
      <div className="mt-11 flex flex-col gap-2.5 border-t border-border pb-7 pt-5">
        <p className="text-sm leading-normal text-ink-3">{t("footerNote")}</p>
        <Link href="/expert" className="flex min-h-12 items-center self-start text-[15px] font-semibold text-ink-2 underline underline-offset-4 hover:text-ink">
          {t("expertLink")}
        </Link>
      </div>
    </footer>
  );
}
