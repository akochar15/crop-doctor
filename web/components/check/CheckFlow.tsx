"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CloudAlert, RotateCcw } from "lucide-react";
import { api, errorKey, type CaseView, type Meta } from "@/lib/api";
import { setLanguage, useLanguage, useT, type Key } from "@/lib/i18n";
import { rememberCase } from "@/lib/recent";
import CaseScreen from "./CaseScreen";
import { ResultSkeleton } from "./visuals";
import NewPhoto from "./NewPhoto";

/** Suspense fallback for the check page (translated once the browser has the saved language). */
export function CheckLoading() {
  const t = useT();
  return <ResultSkeleton label={t("loadingCase")} />;
}

export default function CheckFlow() {
  const params = useSearchParams();
  const router = useRouter();
  const caseId = Number(params.get("case")) || null;
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<Key | null>(null);
  const [attempt, setAttempt] = useState(0);   // bumped by "Try again"
  const language = useLanguage();            // shared with the header switch; also the AI reply language
  const [initialCase, setInitialCase] = useState<CaseView | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async (n = 0): Promise<void> => {
      try {
        const m = await api.meta();
        if (!cancelled) setMeta(m);
      } catch (e) {
        // The free server may still be starting: keep trying for about a minute (not when offline).
        const offline = typeof navigator !== "undefined" && navigator.onLine === false;
        if (!cancelled && n < 12 && !offline) {
          await new Promise((r) => setTimeout(r, 5000));
          return load(n + 1);
        }
        if (!cancelled) setError(errorKey(e));
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const opened = (c: CaseView) => {
    setInitialCase(c);
    rememberCase(c.id);
    router.push(`/check?case=${c.id}`);
  };

  if (caseId)
    return meta ? (
      <CaseScreen
        key={caseId}
        id={caseId}
        meta={meta}
        language={language}
        initial={initialCase?.id === caseId ? initialCase : null}
        onNew={() => router.push("/check")}
      />
    ) : (
      <Waiting error={error} onRetry={() => { setError(null); setAttempt((a) => a + 1); }} />
    );

  return (
    <div>
      {meta ? (
        <NewPhoto meta={meta} language={language} onLanguage={setLanguage} onOpened={opened}
          showSamples={params.get("sample") === "1"} />
      ) : (
        <Waiting error={error} onRetry={() => { setError(null); setAttempt((a) => a + 1); }} />
      )}
    </div>
  );
}

/** While the app data loads (the server may be starting), or a translated error with Try again. */
export function Waiting({ error, onRetry }: { error: Key | null; onRetry: () => void }) {
  const t = useT();
  if (error)
    return (
      <div role="alert" className="mx-3 mt-2 rounded-[18px] border border-border bg-surface p-4">
        <p className="flex items-center gap-2 text-[17px] font-semibold text-ink"><CloudAlert className="h-[22px] w-[22px] shrink-0" aria-hidden="true" />{t(error)}</p>
        <button type="button" onClick={onRetry}
          className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand font-semibold text-on-brand hover:opacity-90">
          <RotateCcw className="h-[18px] w-[18px]" aria-hidden="true" />{t("retry")}
        </button>
      </div>
    );
  return <ResultSkeleton label={t("loading")} />;
}
