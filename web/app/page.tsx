"use client";

import Link from "next/link";
import { Camera, CircleCheck, CircleHelp, UserRound, type LucideIcon } from "lucide-react";
import { useT, type Key } from "@/lib/i18n";
import { RESULTS as R } from "@/lib/results";

// Round DOWN so a result is never overstated (99.5% shows as 99%, not 100%).
const pct = (x: number) => `${Math.floor(x * 100 + 1e-9)}%`;

const FLOW: { title: Key; text: Key }[] = [
  { title: "flow1t", text: "flow1" },
  { title: "flow2t", text: "flow2" },
  { title: "flow3t", text: "flow3" },
];

// The three outcomes use the same colours as the result screen: green answer, blue question, violet expert.
const OUTCOMES: { icon: LucideIcon; tone: string; title: Key; text: Key }[] = [
  { icon: CircleCheck, tone: "bg-ok-soft text-ok", title: "sure", text: "sureT" },
  { icon: CircleHelp, tone: "bg-ask-soft text-ask", title: "almost", text: "almostT" },
  { icon: UserRound, tone: "bg-expert-soft text-expert", title: "notSure", text: "notSureT" },
];

const h2 = "text-[28px] font-semibold tracking-[-0.03em] text-ink";

/** A row in a hairline list: a leading mark, a bold line and a quiet line. */
function Row({ lead, title, text, last }: { lead: React.ReactNode; title: string; text: string; last?: boolean }) {
  return (
    <li className={`flex min-h-16 items-center gap-3.5 py-2 ${last ? "" : "border-b border-border"}`}>
      {lead}
      <div>
        <p className="text-[17px] font-semibold text-ink">{title}</p>
        <p className="text-[15px] text-ink-2">{text}</p>
      </div>
    </li>
  );
}

export default function Home() {
  const t = useT();
  return (
    <div className="mx-auto max-w-xl">
      {/* ---------- The promise, a real diseased leaf, one big action ---------- */}
      <section className="rise px-5 pt-[18px]">
        <h1 className="text-[42px] font-semibold leading-none tracking-[-0.04em] text-ink [text-wrap:balance] sm:text-5xl">
          {t("heroA")}<span className={t.hi ? "" : "serif-i"}>{t("heroB")}</span>{t("heroC")}
        </h1>
        <p className="mt-3.5 text-lg leading-[1.45] text-ink-2">{t("heroText")}</p>
      </section>

      <div className="relative mx-5 mt-[22px] h-80 overflow-hidden rounded-[26px] bg-surface-2">
        <img src="/hero-leaf.jpg" alt="Potato leaf with late blight" className="block h-full w-full object-cover" fetchPriority="high" />
        <span className="vf vf-tl" aria-hidden="true" /><span className="vf vf-tr" aria-hidden="true" />
        <span className="vf vf-bl" aria-hidden="true" /><span className="vf vf-br" aria-hidden="true" />
      </div>

      <div className="flex flex-col gap-1 px-5 pt-4">
        <Link href="/check"
          className="flex h-[58px] items-center justify-center gap-2.5 rounded-full bg-brand text-[19px] font-semibold text-on-brand transition hover:opacity-90 hover:text-on-brand">
          <Camera className="h-[22px] w-[22px]" aria-hidden="true" /> {t("checkNow")}
        </Link>
        <Link href="/check?sample=1" className="flex h-12 items-center justify-center text-[17px] font-semibold text-ink underline underline-offset-[5px]">
          {t("trySample")}
        </Link>
      </div>

      {/* Only numbers the project has measured. */}
      <dl className="mx-5 mt-3 grid grid-cols-3 border-y border-border py-[18px]">
        {[
          { v: pct(R.finalFieldAccuracy), l: t("statAccuracy") },
          { v: "8", l: t("statLanguages") },
          { v: t("free"), l: t("statFree") },
        ].map((s, i) => (
          <div key={s.l} className={i ? "pl-3.5" : ""}>
            <dt className="sr-only">{s.l}</dt>
            <dd className="text-[32px] font-semibold leading-none tracking-[-0.03em] text-ink">{s.v}</dd>
            <dd className="mt-1.5 text-sm leading-[1.3] text-ink-2">{s.l}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="how" className="px-5 pt-10">
        <h2 id="how" className={h2}>{t("howItWorks")}</h2>
        <ol className="mt-2.5">
          {FLOW.map((f, i) => (
            <Row key={f.title} last={i === FLOW.length - 1} title={t(f.title)} text={t(f.text)}
              lead={<span className="serif-i w-[18px] text-2xl text-ink-3" aria-hidden="true">{i + 1}</span>} />
          ))}
        </ol>
      </section>

      <section aria-labelledby="answers" className="px-5 pt-10">
        <h2 id="answers" className={h2}>{t("kinds")}</h2>
        <ul className="mt-2.5">
          {OUTCOMES.map((o, i) => (
            <Row key={o.title} last={i === OUTCOMES.length - 1} title={t(o.title)} text={t(o.text)}
              lead={<span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${o.tone}`} aria-hidden="true"><o.icon className="h-[22px] w-[22px]" /></span>} />
          ))}
        </ul>
      </section>

      {/* ---------- Why honesty matters: the measured results ---------- */}
      <section aria-labelledby="why" className="px-5 pt-10">
        <h2 id="why" className={h2}>{t("whyTitle")}</h2>
        <div className="mt-4 flex flex-col gap-[18px]">
          <div>
            <div className="flex items-baseline justify-between">
              <span className="font-semibold text-ink">{t("whyLab")}</span>
              <span className="text-[28px] font-semibold text-ink-3">{pct(R.labOnlyFieldAccuracy)}</span>
            </div>
            <div className="relative mt-1.5 h-2.5 rounded-full bg-surface-2" aria-hidden="true">
              <div className="absolute -bottom-1 -top-1 left-0 border-r-2 border-ink-3" style={{ width: pct(R.labOnlyFieldConfidence) }} />
              <div className="absolute inset-y-0 left-0 rounded-full bg-ink-3" style={{ width: pct(R.labOnlyFieldAccuracy) }} />
            </div>
            <p className="mt-1.5 text-sm text-ink-2">{t("whyLabNote", { conf: pct(R.labOnlyFieldConfidence) })}</p>
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <span className="font-semibold text-ink">{t("whyOursTag")}</span>
              <span className="text-[28px] font-semibold text-ink">{pct(R.finalFieldAccuracy)}</span>
            </div>
            <div className="mt-1.5 h-2.5 rounded-full bg-surface-2" aria-hidden="true">
              <div className="h-full rounded-full bg-ink" style={{ width: pct(R.finalFieldAccuracy) }} />
            </div>
            <p className="mt-1.5 text-sm text-ink-2">{t("whyOursNote", { cov: pct(R.coverage), alone: pct(R.accuracyWhenAnswered) })}</p>
          </div>
          <p className="text-sm text-ink-3">{t("whyTested", { n: R.fieldTestPhotos.toLocaleString("en-IN") })}</p>
        </div>
      </section>
    </div>
  );
}
