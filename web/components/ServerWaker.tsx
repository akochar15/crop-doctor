"use client";

// The backend sleeps after 15 minutes without visitors and takes about a minute to start again. We ping it as
// soon as anyone opens the site, and tell them (in their language) if it's starting or if they're offline.
import { useEffect, useState } from "react";
import { CloudAlert, WifiOff } from "lucide-react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";

type State = "checking" | "slow" | "offline" | "ok" | "down";

export default function ServerWaker() {
  const [state, setState] = useState<State>("checking");
  const t = useT();

  useEffect(() => {
    let done = false;
    const slow = setTimeout(() => !done && setState((s) => (s === "checking" ? "slow" : s)), 2500);
    const tryHealth = async (attempt: number): Promise<void> => {
      try {
        await api.health();
        done = true;
        setState("ok");
      } catch {
        if (done) return;
        const offline = typeof navigator !== "undefined" && navigator.onLine === false;
        setState(offline ? "offline" : "slow");
        if (attempt < 12) {
          await new Promise((r) => setTimeout(r, 5000));
          return tryHealth(attempt + 1);
        }
        done = true;
        setState(offline ? "offline" : "down");
      }
    };
    tryHealth(0);
    return () => {
      done = true;
      clearTimeout(slow);
    };
  }, []);

  if (state === "slow")
    return (
      <div className="mx-auto w-full max-w-xl px-3">
        <div role="status" className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-3.5 py-3">
          <span className="cd-spin h-[22px] w-[22px] shrink-0 rounded-full border-[2.5px] border-surface-2 border-t-ink" aria-hidden="true" />
          <div>
            <p className="font-semibold text-ink">{t("wakeTitle")}</p>
            <p className="text-sm text-ink-2">{t("wakeSlow")}</p>
          </div>
        </div>
      </div>
    );
  if (state === "offline")
    return (
      <div className="mx-auto w-full max-w-xl px-3">
        <div role="alert" className="flex items-center gap-3 rounded-2xl bg-brand px-3.5 py-3 text-on-brand">
          <WifiOff className="h-[22px] w-[22px] shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">{t("offlineTitle")}</p>
            <p className="text-sm opacity-85">{t("offline")}</p>
          </div>
        </div>
      </div>
    );
  if (state === "down")
    return (
      <div className="mx-auto w-full max-w-xl px-3">
        <div role="alert" className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-3.5 py-3">
          <CloudAlert className="h-[22px] w-[22px] shrink-0 text-urgent" aria-hidden="true" />
          <p className="font-semibold text-ink">{t("wakeDown")}</p>
        </div>
      </div>
    );
  return null;
}
