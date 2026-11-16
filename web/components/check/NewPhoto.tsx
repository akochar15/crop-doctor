"use client";

import { useEffect, useRef, useState } from "react";
import { api, API_URL, ApiError, CANCELLED, errorKey, type CaseView, type Meta } from "@/lib/api";
import { NATIVE, useT, type Key } from "@/lib/i18n";
import { Camera, Check, ChevronDown, CircleCheck, CloudAlert, Image as ImageIcon, RotateCcw, ScanSearch, X } from "lucide-react";
import { shrinkPhoto } from "@/lib/photo";
import { REFERENCES } from "@/lib/references";
import { Mark } from "@/components/SiteChrome";
import RecentChecks from "./RecentChecks";

const CROP_PHOTO: Record<string, string | undefined> = {
  tomato: REFERENCES.tomato_healthy?.src,
  potato: REFERENCES.potato_healthy?.src,
};
// The good / retake examples: the same real field photo, sharp and then dark and blurred.
const EXAMPLE = REFERENCES.potato_early_blight?.src;

type Phase = "preparing" | "sending" | "checking";
const PHASES: Phase[] = ["preparing", "sending", "checking"];
const PHASE_TEXT: Record<Phase, Key> = { preparing: "upPreparing", sending: "upSending", checking: "upChecking" };

type Props = {
  meta: Meta;
  language: string;
  onLanguage: (l: string) => void;
  onOpened: (c: CaseView) => void;
  showSamples: boolean;
};

function StepTitle({ n, id, children }: { n: number; id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mb-2.5 flex items-center gap-2.5 text-[17px] font-semibold text-ink">
      <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-brand text-sm text-on-brand" aria-hidden="true">{n}</span>
      {children}
    </h2>
  );
}

const kb = (b: number) => Math.max(1, Math.round(b / 1024));

export default function NewPhoto({ meta, language, onLanguage, onOpened, showSamples }: Props) {
  const [crop, setCrop] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase | null>(null);       // null = not sending
  const [steps, setSteps] = useState<Phase[]>(PHASES);
  const [sent, setSent] = useState<{ loaded: number; total: number } | null>(null);
  const [slow, setSlow] = useState(false);
  const [busyPreview, setBusyPreview] = useState<string | null>(null);
  const [error, setError] = useState<Key | null>(null);
  const [lastSample, setLastSample] = useState<{ file: string; crop: string } | null>(null);   // what "Try again" resends
  const samplesRef = useRef<HTMLDetailsElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const t = useT();

  useEffect(() => {
    if (showSamples && samplesRef.current) {
      samplesRef.current.open = true;
      samplesRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [showSamples]);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const pick = (f: File | undefined) => {
    if (!f) return;
    setError(null);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  // Honest progress: shrink the photo here, send it (real upload progress), then wait while the server checks it.
  const submit = async (sample?: { file: string; crop: string }) => {
    const form = new FormData();
    form.set("language", language);
    const own = file;
    if (sample) {
      form.set("crop", sample.crop);
      form.set("sample", sample.file);
      setBusyPreview(`${API_URL}/api/samples/${sample.file}`);
      setSteps(PHASES.filter((p) => p !== "preparing"));
    } else {
      if (!crop || !own) return;
      form.set("crop", crop);
      setBusyPreview(preview);
      setSteps(PHASES);
    }
    setLastSample(sample ?? null);
    setError(null);
    setSent(null);
    setSlow(false);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let slowTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!sample && own) {
        setPhase("preparing");
        const small = await shrinkPhoto(own);
        if (ctrl.signal.aborted) throw new ApiError(CANCELLED, "Cancelled");
        form.set("file", small, small === own ? own.name : "photo.jpg");
      }
      setPhase("sending");
      slowTimer = setTimeout(() => setSlow(true), 12000);   // the free server may be starting up
      const c = await api.createCase(form, (_f, loaded, total) => setSent({ loaded, total }), () => setPhase("checking"), ctrl.signal);
      onOpened(c);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === CANCELLED)) setError(errorKey(e, "photo"));
      setPhase(null);
    } finally {
      clearTimeout(slowTimer);
      if (abortRef.current === ctrl) abortRef.current = null;
    }
  };
  const retry = () => submit(lastSample ?? undefined);

  /* ---------- Checking: the photo inside a turning ring, and three honest steps ---------- */
  if (phase) {
    const current = steps.indexOf(phase);
    return (
      <div className="rise flex min-h-[calc(100dvh-140px)] flex-col items-center">
        <div className="relative mt-8 h-60 w-60">
          <div className="cd-ring absolute inset-0 rounded-full" aria-hidden="true" />
          <div className="absolute inset-0 rounded-full shadow-[inset_0_0_0_6px_var(--surface-2)]" aria-hidden="true" />
          {busyPreview ? (
            <img src={busyPreview} alt={t("yourPhoto")} className="absolute inset-4 h-52 w-52 rounded-full object-cover" />
          ) : (
            <span className="absolute inset-4 flex items-center justify-center rounded-full bg-surface-2"><Mark size={56} corners={false} /></span>
          )}
        </div>
        <h1 className="mt-9 text-[28px] font-semibold tracking-[-0.03em] text-ink">{t("checkingTitle")}</h1>
        <p className="mt-1 px-8 text-center text-base text-ink-2">{slow ? t("upSlow") : t("checkingSub")}</p>

        <ol className="mt-7 flex w-full flex-col px-3" role="status" aria-live="polite">
          {steps.map((p, i) => {
            const done = i < current;
            const now = i === current;
            const last = i === steps.length - 1;
            return (
              <li key={p} className={`${now ? "py-2.5" : ""} ${last ? "" : "border-b border-border"}`}>
                <div className={`flex items-center gap-3 ${now ? "min-h-8" : "min-h-[52px]"}`}>
                  {done ? (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-on-brand" aria-hidden="true"><Check className="h-4 w-4" /></span>
                  ) : now ? (
                    <span className="cd-spin h-7 w-7 shrink-0 rounded-full border-[2.5px] border-surface-2 border-t-ink" aria-hidden="true" />
                  ) : (
                    <span className="h-7 w-7 shrink-0 rounded-full border-[1.5px] border-dashed border-border" aria-hidden="true" />
                  )}
                  <span className={`flex-1 text-[17px] ${now ? "font-semibold text-ink" : done ? "text-ink" : "text-ink-3"}`}>{t(PHASE_TEXT[p])}</span>
                  {done && <span className="text-sm text-ink-3">{t("done")}</span>}
                  {now && p === "sending" && sent && (
                    <span className="text-sm tabular-nums text-ink-2">{kb(sent.loaded)} / {kb(sent.total)} KB</span>
                  )}
                </div>
                {now && p === "sending" && (
                  <div className="ml-10 mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label={t("upSending")}
                    aria-valuemin={0} aria-valuemax={100} aria-valuenow={sent ? Math.round((sent.loaded / sent.total) * 100) : 0}>
                    <div className="h-full rounded-full bg-ink transition-[width]" style={{ width: `${sent ? Math.round((sent.loaded / sent.total) * 100) : 0}%` }} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        <button type="button" onClick={() => abortRef.current?.abort()}
          className="mb-7 mt-auto flex min-h-12 items-center px-4 font-semibold text-ink-2 underline underline-offset-4 hover:text-ink">
          {t("cancel")}
        </button>
      </div>
    );
  }

  /* ---------- Check a leaf: crop, photo, language ---------- */
  const ready = !!crop && !!file;
  return (
    <div className="rise">
      <h1 className="mx-5 mt-2 text-[34px] font-semibold tracking-[-0.035em] text-ink">{t("checkLeaf")}</h1>

      <section aria-labelledby="s1" className="px-5 pt-6">
        <StepTitle n={1} id="s1">{t("whichCrop")}</StepTitle>
        <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-labelledby="s1">
          {meta.crops.map((c) => {
            const on = crop === c;
            return (
              <button key={c} type="button" role="radio" aria-checked={on} onClick={() => setCrop(c)}
                className={`relative overflow-hidden rounded-[20px] bg-surface text-left transition ${on ? "shadow-[0_0_0_2px_var(--ink)]" : "border border-border hover:border-ink-3"}`}>
                {CROP_PHOTO[c] ? <img src={CROP_PHOTO[c]} alt="" className="block aspect-[4/3] w-full object-cover" /> : <span className="block aspect-[4/3] w-full bg-surface-2" />}
                <span className="block px-3 py-2.5 text-[17px] font-semibold text-ink">{c === "tomato" || c === "potato" ? t(c) : c}</span>
                {on && (
                  <span className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-brand text-on-brand" aria-hidden="true">
                    <Check className="h-4 w-4" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="s2" className="px-5 pt-7">
        <StepTitle n={2} id="s2">{t("photoOf")}</StepTitle>
        {preview ? (
          <div className="flex items-center gap-3.5 rounded-[20px] border border-border bg-surface p-2.5">
            <img src={preview} alt={t("yourPhoto")} className="h-[84px] w-[84px] shrink-0 rounded-[14px] object-cover" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[17px] font-semibold text-ok"><CircleCheck className="h-[18px] w-[18px]" aria-hidden="true" />{t("photoReady")}</p>
              <p className="text-sm text-ink-2">{t("photoReadyT")}</p>
            </div>
            <button type="button" onClick={() => { setFile(null); setPreview(null); }}
              className="flex h-12 shrink-0 items-center rounded-full border border-border px-3.5 font-semibold text-ink hover:bg-surface-2">
              {t("change")}
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              <label className="flex h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[20px] bg-brand text-[17px] font-semibold text-on-brand hover:opacity-90">
                <Camera className="h-[26px] w-[26px]" aria-hidden="true" />{t("takePhoto")}
                <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
              </label>
              <label className="flex h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[20px] border border-border bg-surface text-[17px] font-semibold text-ink hover:bg-surface-2">
                <ImageIcon className="h-[26px] w-[26px]" aria-hidden="true" />{t("gallery")}
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
              </label>
            </div>
            {EXAMPLE && (
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                {[
                  { ok: true, title: t("goodPhoto"), text: t("goodPhotoT") },
                  { ok: false, title: t("retakeEx"), text: t("retakeExT") },
                ].map((x) => (
                  <div key={x.title} className="flex flex-col gap-1.5">
                    <div className="relative overflow-hidden rounded-[14px]">
                      <img src={EXAMPLE} alt="" className={`block aspect-[4/3] w-full object-cover ${x.ok ? "" : "blur-[3px] brightness-[.45]"}`} />
                      <span className={`absolute left-2 top-2 flex h-[26px] w-[26px] items-center justify-center rounded-full ${x.ok ? "bg-ok-solid text-on-ok" : "bg-soon-solid text-on-soon"}`} aria-hidden="true">
                        {x.ok ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                      </span>
                    </div>
                    <p className={`text-[15px] font-semibold ${x.ok ? "text-ok" : "text-soon"}`}>{x.title}</p>
                    <p className="text-sm leading-[1.4] text-ink-2">{x.text}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="s3" className="px-5 pt-7">
        <StepTitle n={3} id="s3">{t("yourLanguage")}</StepTitle>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby="s3">
          {meta.languages.map((l) => {
            const on = language === l;
            return (
              <button key={l} type="button" role="radio" aria-checked={on} onClick={() => onLanguage(l)}
                className={`flex min-h-[50px] items-center justify-between gap-2 rounded-[14px] border border-border bg-surface px-3.5 text-left text-base font-semibold text-ink transition hover:border-ink-3 ${on ? "shadow-[0_0_0_2px_var(--ink)]" : ""}`}>
                {NATIVE[l] ?? l}
                <span className="text-[13px] font-medium text-ink-3">{l}</span>
              </button>
            );
          })}
        </div>
        {!meta.llm_enabled && language !== "English" && <p className="mt-2 text-sm text-ink-3">{t("aiOff")}</p>}
      </section>

      <div className="px-5 pt-6">
        {error && (
          <div role="alert" className="mb-4 rounded-[18px] border border-border bg-surface p-4">
            <p className="flex items-center gap-2 text-[17px] font-semibold text-ink"><CloudAlert className="h-[22px] w-[22px] shrink-0" aria-hidden="true" />{t(error)}</p>
            {(lastSample || file) && (
              <button type="button" onClick={retry}
                className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand font-semibold text-on-brand hover:opacity-90">
                <RotateCcw className="h-[18px] w-[18px]" aria-hidden="true" />{t("retry")}
              </button>
            )}
          </div>
        )}
        <button type="button" disabled={!ready} onClick={() => submit()}
          className="flex h-[58px] w-full items-center justify-center gap-2.5 rounded-full bg-brand text-[19px] font-semibold text-on-brand transition enabled:hover:opacity-90 disabled:bg-surface-2 disabled:text-ink-3">
          <ScanSearch className="h-[22px] w-[22px]" aria-hidden="true" /> {t("checkThis")}
        </button>
        {!ready && <p className="mt-2 text-center text-sm text-ink-3">{t(crop ? "addPhotoFirst" : "cropFirst")}</p>}
      </div>

      <details ref={samplesRef} className="group mx-5 mb-7 mt-6 border-t border-border">
        <summary className="flex h-14 cursor-pointer list-none items-center justify-between text-base font-semibold text-ink">
          {t("noPlant")}
          <ChevronDown className="h-5 w-5 text-ink-3 transition group-open:rotate-180" aria-hidden="true" />
        </summary>
        <p className="mb-3 text-sm text-ink-3">{t("samplesNote")}</p>
        <div className="grid grid-cols-4 gap-1.5">
          {meta.samples.map((s) => (
            <button key={s.file} type="button" onClick={() => submit(s)} title={t.server(s.title)}
              className="overflow-hidden rounded-xl transition hover:opacity-85">
              <img src={`${API_URL}/api/samples/${s.file}`} alt={t.server(s.title)} loading="lazy" className="block aspect-square w-full object-cover" />
            </button>
          ))}
        </div>
      </details>
      <RecentChecks />
    </div>
  );
}
