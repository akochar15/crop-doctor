"use client";

// Picture-first building blocks for farmers: every important fact is shown as an icon, a colour or a shape AND words.
// Colour only ever means status: ok (green), soon (amber), urgent (red), ask (blue), expert (violet).
import { useEffect, useState } from "react";
import {
  AlarmClock, Ban, Bug, CalendarClock, Camera, ChevronDown, CircleCheck, Clock, Cloud, Dna, Droplet, Droplets, Eye, Flame,
  Hand, Leaf, Megaphone, Microscope, Puzzle, RotateCcw, Scissors, ShieldAlert, Shovel, Sprout, Square, Target, Trees,
  UserRound, Volume2, Wind, type LucideIcon,
} from "lucide-react";
import type { Disease, Urgency } from "@/lib/api";
import { useT, type Key, type T } from "@/lib/i18n";
import { REFERENCES } from "@/lib/references";

export type HeroKind = "healthy" | "diagnosis" | "question" | "expert" | "answered" | "retake" | "unfamiliar";

/** "Potato late blight" on a potato check reads "Late blight": the crop is already in the line above. */
export function shortName(name: string, crop: string, t: T): string {
  const local = t.server(name);
  if (t.hi && local !== name) return local.replace(/^(आलू|टमाटर)\s+((का|की|के)\s+)?/, "") || local;
  const s = name.replace(new RegExp(`^${crop}\\s+`, "i"), "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** English short name, shown small under a Hindi name so a farmer can match it with what they hear elsewhere. */
export function englishShort(name: string, crop: string): string {
  const s = name.replace(new RegExp(`^${crop}\\s+`, "i"), "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function cropName(crop: string, t: T): string {
  return crop === "tomato" || crop === "potato" ? t(crop) : crop;
}

const likelyWord = (p: number): Key => (p >= 0.9 ? "veryLikely" : p >= 0.7 ? "likely" : p >= 0.5 ? "possible" : "lessLikely");

/* ---------- Your photo, large, with a small label ---------- */
export function PhotoHero({ src, chip, alt, height = 240, look = "plain" }: {
  src?: string; chip?: string; alt: string; height?: number; look?: "plain" | "blur" | "dashed";
}) {
  if (!src) return null;
  return (
    <div className="relative mx-4 mt-1 overflow-hidden rounded-3xl bg-surface-2" style={{ height }}>
      <img src={src} alt={alt}
        className={`block h-full w-full object-cover ${look === "blur" ? "scale-[1.08] blur-[5px] brightness-[.55]" : ""}`} />
      {look === "dashed" && <span className="absolute inset-2.5 rounded-[18px] border-2 border-dashed border-white/70" aria-hidden="true" />}
      {chip && <span className="absolute bottom-3.5 left-3.5 rounded-full bg-surface px-3 py-1 text-sm font-semibold text-ink">{chip}</span>}
    </div>
  );
}

/* ---------- Status line above a heading: icon + bold coloured words ---------- */
export function Tag({ icon: Icon, tone, children, size = 17 }: { icon: LucideIcon; tone: string; children: React.ReactNode; size?: number }) {
  return (
    <p className={`flex items-center gap-2 font-bold ${tone}`} style={{ fontSize: size }}>
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />{children}
    </p>
  );
}

/* ---------- Confidence: one thin bar, the number and a word ---------- */
export function ConfidenceBar({ p }: { p: number }) {
  const t = useT();
  const n = Math.round(p * 100);
  return (
    <div className="mt-3 flex items-center gap-3">
      <div className="h-1.5 flex-1 rounded-full bg-surface-2" aria-hidden="true">
        <div className="h-full rounded-full bg-ink" style={{ width: `${n}%` }} />
      </div>
      <span className="text-base text-ink-2"><b className="text-ink">{n}%</b> {t(likelyWord(p))}</span>
    </div>
  );
}

/* ---------- Urgency: the headline, three segments with the active one filled, and the reason ---------- */
const LEVELS: { key: Urgency["level"]; word: Key }[] = [
  { key: "routine", word: "canWait" },
  { key: "soon", word: "thisWeek" },
  { key: "urgent", word: "today" },
];
const URGENCY: Record<string, { icon: LucideIcon; title: Key; text: string; fill: string }> = {
  urgent: { icon: AlarmClock, title: "actToday", text: "text-urgent", fill: "bg-urgent-solid" },
  soon: { icon: CalendarClock, title: "actWeek", text: "text-soon", fill: "bg-soon-solid" },
  routine: { icon: Clock, title: "actRoutine", text: "text-ok", fill: "bg-ok-solid" },
};

export function UrgencyBlock({ u }: { u: Urgency }) {
  const t = useT();
  const k = URGENCY[u.level];
  if (!k) return null;
  return (
    <div className="mx-5 mt-5 border-y border-border py-4">
      <p className={`flex flex-wrap items-center gap-x-2 text-[19px] font-bold ${k.text}`}>
        <k.icon className="h-[22px] w-[22px] shrink-0" aria-hidden="true" />{t(k.title)}
        {u.act_within && <span className="text-base font-medium text-ink-2">· {t("within", { t: t.server(u.act_within) })}</span>}
      </p>
      <div className="mt-3 grid grid-cols-3 gap-1" aria-hidden="true">
        {LEVELS.map((l) => {
          const on = l.key === u.level;
          return (
            <div key={l.key}>
              <div className={`h-1 rounded-full ${on ? k.fill : "bg-surface-2"}`} />
              <p className={`mt-1.5 text-[13px] ${on ? `font-bold ${k.text}` : "text-ink-3"}`}>{t(l.word)}</p>
            </div>
          );
        })}
      </div>
      {u.why && <p className="mt-2.5 text-[15px] leading-[1.45] text-ink-2">{t.server(u.why)}</p>}
    </div>
  );
}

/* ---------- Leaf damage: a short bar that fills ---------- */
function damageWord(pct: number): Key {
  return pct < 10 ? "dmgLittle" : pct < 30 ? "dmgSome" : pct < 60 ? "dmgLot" : "dmgBad";
}

/* ---------- What causes it and how fast it spreads ---------- */
function causeOf(cause?: string | null): { icon: LucideIcon; word: Key } | null {
  const c = (cause ?? "").toLowerCase();
  if (c.includes("whitefl")) return { icon: Bug, word: "cWhitefly" };
  if (c.includes("virus")) return { icon: Dna, word: "cVirus" };
  if (c.includes("bacteri")) return { icon: Microscope, word: "cBacteria" };
  if (c.includes("water mould")) return { icon: Droplets, word: "cWater" };
  if (c.includes("fung")) return { icon: Sprout, word: "cFungus" };
  return null;
}
const SPREAD: Record<string, { icon: LucideIcon; word: Key }> = {
  fast: { icon: Flame, word: "spFast" },
  medium: { icon: Wind, word: "spMedium" },
  virus_insect: { icon: Bug, word: "spInsect" },
  virus_contact: { icon: Hand, word: "spContact" },
};

export function hasFacts(d: Disease) {
  return !!(causeOf(d.cause) || (d.spread && SPREAD[d.spread]) || d.signs);
}

function Fact({ lead, label, value }: { lead: React.ReactNode; label: string; value: string }) {
  return (
    <li className="flex items-center gap-3.5 py-2.5">
      {lead}
      <div className="min-w-0">
        <p className="text-[13px] text-ink-3">{label}</p>
        <p className="font-semibold leading-[1.35] text-ink">{value}</p>
      </div>
    </li>
  );
}
const factIcon = (Icon: LucideIcon) => <Icon className="mx-[13px] h-[22px] w-[22px] shrink-0 text-ink-2" aria-hidden="true" />;

/** Leaf damage, cause, spread and signs: useful, but not the first thing to read. */
export function MoreDetails({ d, fraction }: { d: Disease; fraction?: number | null }) {
  const t = useT();
  const cause = causeOf(d.cause);
  const spread = d.spread ? SPREAD[d.spread] : undefined;
  const pct = fraction != null ? Math.round(Math.min(Math.max(fraction, 0), 1) * 100) : null;
  if (pct == null && !cause && !spread && !d.signs) return null;
  return (
    <details className="group mx-5 mt-[18px] border-y border-border">
      <summary className="flex h-14 cursor-pointer list-none items-center justify-between text-base font-semibold text-ink">
        {t("details")}
        <ChevronDown className="h-5 w-5 text-ink-3 transition group-open:rotate-180" aria-hidden="true" />
      </summary>
      <ul className="pb-1.5">
        {pct != null && (
          <Fact label={t("leafDamage")} value={t("dmgShort", { p: pct, w: t(damageWord(pct)).toLowerCase() })}
            lead={<span className="h-2.5 w-12 shrink-0 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={t("dmgAbout", { p: pct })}>
              <span className="block h-full bg-ink-2" style={{ width: `${pct}%` }} />
            </span>} />
        )}
        {cause && <Fact lead={factIcon(cause.icon)} label={t("causedBy")} value={t(cause.word)} />}
        {spread && <Fact lead={factIcon(spread.icon)} label={t("spreads")} value={t(spread.word)} />}
        {d.signs && (
          <Fact lead={factIcon(Eye)} label={t("recognise")} value={t.hi ? t.server(d.signs) : d.signs.charAt(0).toUpperCase() + d.signs.slice(1)} />
        )}
      </ul>
    </details>
  );
}

/* ---------- What to do: a numbered list (safe, general steps; details are in the chat reply) ---------- */
export function actionSteps(d: Disease | null, healthy: boolean, urgent: boolean): { icon: LucideIcon; text: Key }[] {
  if (healthy)
    return [
      { icon: Eye, text: "aWeekly" },
      { icon: Droplet, text: "aWater" },
      { icon: Camera, text: "aNewPhoto" },
    ];
  if (d?.spread?.startsWith("virus"))
    return [
      { icon: Shovel, text: "aPull" },
      d.spread === "virus_insect" ? { icon: Bug, text: "aWhitefly" } : { icon: Hand, text: "aWash" },
      { icon: Ban, text: "aNoCure" },
    ];
  return [
    { icon: Scissors, text: "aRemove" },
    urgent ? { icon: Megaphone, text: "aTell" } : { icon: Droplet, text: "aWater" },
    { icon: UserRound, text: "aAsk" },
  ];
}

export function ActionList({ title, steps, note }: { title: string; steps: { icon: LucideIcon; text: Key }[]; note?: string }) {
  const t = useT();
  return (
    <section aria-labelledby="todo" className="px-5 pt-7">
      <h2 id="todo" className="text-2xl font-semibold tracking-[-0.02em] text-ink">{title}</h2>
      <ol className="mt-1.5">
        {steps.map((s, i) => (
          <li key={s.text} className={`flex min-h-[62px] items-center gap-3.5 py-1.5 ${i < steps.length - 1 ? "border-b border-border" : ""}`}>
            <span className="serif-i w-[18px] shrink-0 text-2xl text-ink-3" aria-hidden="true">{i + 1}</span>
            <span className="flex-1 text-lg leading-[1.3] text-ink">{t(s.text)}</span>
            <s.icon className="h-5 w-5 shrink-0 text-ink-3" aria-hidden="true" />
          </li>
        ))}
      </ol>
      {note && (
        <p className="mt-2.5 flex gap-2 text-[15px] leading-[1.45] text-ink-2">
          <ShieldAlert className="mt-0.5 h-[18px] w-[18px] shrink-0" aria-hidden="true" />{note}
        </p>
      )}
    </section>
  );
}

/* ---------- Your photo next to a typical photo of the disease ---------- */
export function PhotoCompare({ photo, disease, short = false }: { photo?: string; disease: Disease | null; short?: boolean }) {
  const t = useT();
  const ref = disease ? REFERENCES[disease.label] : undefined;
  if (!photo || !ref || !disease) return null;
  return (
    <div className="grid grid-cols-2 gap-2.5 px-4 pt-6">
      <figure>
        <img src={photo} alt={t("yourPhoto")} className="block aspect-square w-full rounded-2xl object-cover" />
        <figcaption className="mt-1.5 text-sm font-semibold text-ink">{t("yourLeaf")}</figcaption>
      </figure>
      <figure>
        <img src={ref.src} alt={t.server(disease.name)} loading="lazy" className="block aspect-square w-full rounded-2xl object-cover" />
        <figcaption className="mt-1.5 text-sm leading-[1.3] text-ink">
          <b>{t(short ? "usuallyLooks" : "typicalLook")}</b>
          {!short && <span className="mt-0.5 block text-[13px] text-ink-3">{t("photoFrom", { s: ref.credit })}</span>}
        </figcaption>
      </figure>
    </div>
  );
}

/* ---------- The shortlist when it isn't sure: reference thumb, a bar and a word ---------- */
export function Shortlist({ items }: { items: { label: string; name: string; probability: number }[] }) {
  const t = useT();
  return (
    <ul className="mt-2">
      {items.map((o, i) => {
        const ref = REFERENCES[o.label];
        return (
          <li key={o.label} className={`flex min-h-16 items-center gap-3 py-2 ${i < items.length - 1 ? "border-b border-border" : ""}`}>
            {ref ? <img src={ref.src} alt="" className="h-11 w-11 shrink-0 rounded-[10px] object-cover" /> : <span className="h-11 w-11 shrink-0 rounded-[10px] bg-surface-2" />}
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink">{t.server(o.name)}</p>
              <div className="mt-1 h-1 rounded-full bg-surface-2" aria-hidden="true">
                <div className="h-full rounded-full bg-ink-2" style={{ width: `${Math.round(o.probability * 100)}%` }} />
              </div>
            </div>
            <span className="text-sm text-ink-2">{t(likelyWord(o.probability))}</span>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------- Read text aloud ---------- */
const LANG: Record<string, string> = {
  English: "en-IN", Hindi: "hi-IN", Tamil: "ta-IN", Telugu: "te-IN", Marathi: "mr-IN",
  Kannada: "kn-IN", Bengali: "bn-IN", Punjabi: "pa-IN",
};

export function ListenButton({ text, language, big = false }: { text: string; language: string; big?: boolean }) {
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(false);
  const t = useT();
  useEffect(() => {
    // Feature check after mount (speech synthesis only exists in the browser).
    const ok = typeof window !== "undefined" && "speechSynthesis" in window;
    const id = requestAnimationFrame(() => setSupported(ok));
    return () => {
      cancelAnimationFrame(id);
      if (ok) window.speechSynthesis.cancel();
    };
  }, []);
  if (!supported) return null;
  const toggle = () => {
    const s = window.speechSynthesis;
    if (speaking) {
      s.cancel();
      setSpeaking(false);
      return;
    }
    s.cancel();
    const clean = text.replace(/\*\*/g, "").replace(/^Sources:[\s\S]*$/m, "").replace(/https?:\/\/\S+/g, "");
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = LANG[language] ?? "en-IN";
    u.rate = 0.95;
    const voice = s.getVoices().find((v) => v.lang === u.lang) ?? s.getVoices().find((v) => v.lang.startsWith(u.lang.slice(0, 2)));
    if (voice) u.voice = voice;
    u.onend = u.onerror = () => setSpeaking(false);
    s.speak(u);
    setSpeaking(true);
  };
  const Icon = speaking ? Square : Volume2;
  if (big)
    return (
      <div className="px-4 pt-4">
        <button type="button" onClick={toggle} aria-pressed={speaking}
          className="flex h-14 w-full items-center justify-center gap-2.5 rounded-full border-[1.5px] border-ink text-lg font-semibold text-ink transition hover:bg-surface-2">
          <Icon className="h-[22px] w-[22px]" aria-hidden="true" />{t(speaking ? "stop" : "listenAnswer")}
        </button>
      </div>
    );
  return (
    <button type="button" onClick={toggle} aria-pressed={speaking}
      className="mt-1 inline-flex min-h-10 items-center gap-1.5 text-[13px] font-semibold text-ink-2 hover:text-ink">
      <Icon className="h-4 w-4" aria-hidden="true" />{t(speaking ? "stop" : "listen")}
    </button>
  );
}

/* ---------- Small picture for follow-up question options ---------- */
export function optionIcon(text: string): LucideIcon {
  const t = text.toLowerCase();
  if (t.includes("ring")) return Target;
  if (t.includes("wet") || t.includes("water")) return Droplets;
  if (t.includes("fuzz") || t.includes("mould") || t.includes("mold") || t.includes("powder")) return Cloud;
  if (t.includes("curl")) return RotateCcw;
  if (t.includes("mosaic") || t.includes("patch") || t.includes("mottl")) return Puzzle;
  if (t.includes("insect") || t.includes("fly") || t.includes("flies")) return Bug;
  if (t.includes("no,") || t.includes("normal") || t.includes("nothing")) return CircleCheck;
  return Leaf;
}

/** Few / some / many plants. */
export function extentIcon(value: string): LucideIcon {
  return value === "many" ? Trees : value === "some" ? Sprout : Leaf;
}

/** Grey shapes where the result will be, gently pulsing. */
export function ResultSkeleton({ label }: { label: string }) {
  return (
    <div className="cd-shimmer mx-4 mt-1 flex flex-col gap-2.5" role="status" aria-label={label}>
      <div className="h-40 rounded-[22px] bg-surface-2" />
      <div className="h-3.5 w-2/5 rounded-full bg-surface-2" />
      <div className="h-[34px] w-3/4 rounded-xl bg-surface-2" />
      <div className="h-14 rounded-full bg-surface-2" />
    </div>
  );
}
