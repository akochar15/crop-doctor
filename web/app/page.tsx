"use client";

import Link from "next/link";
import { AlarmClock, Camera, CircleCheck, CircleHelp, MessageCircle, ScanSearch, UserRound, type LucideIcon } from "lucide-react";
import { shortName } from "@/components/check/visuals";
import { useT, type Key } from "@/lib/i18n";
import { RESULTS as R } from "@/lib/results";

// Round DOWN so a result is never overstated (99.5% shows as 99%, not 100%).
const pct = (x: number) => `${Math.floor(x * 100 + 1e-9)}%`;

// Phone: short line under each step. Laptop: the longer sentence and an icon.
const FLOW: { icon: LucideIcon; title: Key; text: Key; long: Key }[] = [
  { icon: Camera, title: "flow1t", text: "flow1", long: "flow1L" },
  { icon: ScanSearch, title: "flow2t", text: "flow2", long: "flow2L" },
  { icon: MessageCircle, title: "flow3t", text: "flow3", long: "flow3L" },
];

// The three outcomes use the same colours as the result screen: green answer, blue question, violet expert.
const OUTCOMES: { icon: LucideIcon; tone: string; title: Key; text: Key; long: Key }[] = [
  { icon: CircleCheck, tone: "bg-ok-soft text-ok", title: "sure", text: "sureT", long: "sureL" },
  { icon: CircleHelp, tone: "bg-ask-soft text-ask", title: "almost", text: "almostT", long: "almostL" },
  { icon: UserRound, tone: "bg-expert-soft text-expert", title: "notSure", text: "notSureT", long: "notSureL" },
];

const h2 = "text-[28px] font-semibold tracking-[-0.03em] text-ink lg:text-4xl lg:leading-[1.05]";
// Laptop: each section is a heading column and a content column, split by a hairline.
const band = "px-5 pt-10 lg:mx-14 lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-[72px] lg:border-t lg:border-border lg:px-0 lg:py-14";

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

/** One bar of the "why honesty" comparison. `tick` marks how sure the model claimed to be. */
function Bar({ value, tick, strong }: { value: number; tick?: number; strong?: boolean }) {
  return (
    <div className="relative h-2.5 rounded-full bg-surface-2 lg:h-3" aria-hidden="true">
      {tick != null && <div className="absolute -bottom-1 -top-1 left-0 border-r-2 border-ink-3" style={{ width: pct(tick) }} />}
      <div className={`absolute inset-y-0 left-0 rounded-full ${strong ? "bg-ink" : "bg-ink-3"}`} style={{ width: pct(value) }} />
    </div>
  );
}

export default function Home() {
  const t = useT();
  return (
    <div className="mx-auto max-w-xl lg:max-w-[1280px]">
      {/* ---------- The promise, a real diseased leaf, one big action ----------
          Phone: text, photo, buttons, numbers in one column. Laptop: text, buttons and numbers left, photo right. */}
      <div className="grid [grid-template-areas:'text'_'photo'_'cta'_'stats'] lg:grid-cols-[minmax(0,1fr)_560px] lg:items-center lg:gap-x-[72px] lg:px-14 lg:pb-16 lg:pt-12 lg:[grid-template-areas:'text_photo'_'cta_photo'_'stats_photo']">
        <section className="rise px-5 pt-[18px] [grid-area:text] lg:self-end lg:px-0 lg:pt-0">
          <p className="hidden text-base font-semibold text-ink-3 lg:block">{t("heroEyebrow")}</p>
          <h1 className="text-[42px] font-semibold leading-none tracking-[-0.04em] text-ink [text-wrap:balance] sm:text-5xl lg:mt-[18px] lg:text-[80px] lg:leading-[0.98] lg:tracking-[-0.045em]">
            {t("heroA")}<span className={t.hi ? "" : "serif-i lg:tracking-[-0.03em]"}>{t("heroB")}</span>{t("heroC")}
          </h1>
          <p className="mt-3.5 text-lg leading-[1.45] text-ink-2 lg:hidden">{t("heroText")}</p>
          <p className="mt-6 hidden max-w-[500px] text-xl leading-[1.55] text-ink-2 lg:block">{t("heroTextLong")}</p>
        </section>

        <div className="relative mx-5 mt-[22px] h-80 [grid-area:photo] lg:mx-0 lg:mt-0 lg:h-[600px]">
          <div className="absolute inset-0 overflow-hidden rounded-[26px] bg-surface-2 lg:rounded-[36px]">
            <picture>
              <source media="(min-width: 1024px)" srcSet="/hero-field.jpg" />
              <img src="/hero-leaf.jpg" alt="Potato leaf with late blight" className="block h-full w-full object-cover" fetchPriority="high" />
            </picture>
            <span className="vf vf-lg vf-tl" aria-hidden="true" /><span className="vf vf-lg vf-tr" aria-hidden="true" />
            <span className="vf vf-lg vf-bl" aria-hidden="true" /><span className="vf vf-lg vf-br" aria-hidden="true" />
          </div>
          {/* Laptop only: what a result looks like, floating over the photo. */}
          <div className="absolute bottom-20 -left-11 hidden rounded-[20px] bg-surface px-5 py-4 shadow-float lg:block" aria-hidden="true">
            <p className="text-sm text-ink-3">{t("mostLikely")}</p>
            <p className="mt-0.5 text-[22px] font-bold leading-[1.1] text-ink">{shortName("Potato late blight", "potato", t)}</p>
            <p className="mt-2 flex items-center gap-1.5 text-[15px] font-semibold text-urgent">
              <AlarmClock className="h-4 w-4" />{t("actToday")}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-1 px-5 pt-4 [grid-area:cta] lg:flex-row lg:items-center lg:gap-6 lg:self-start lg:px-0 lg:pt-9">
          <Link href="/check"
            className="flex h-[58px] items-center justify-center gap-2.5 rounded-full bg-brand text-[19px] font-semibold text-on-brand transition hover:opacity-90 hover:text-on-brand lg:h-[60px] lg:pl-[26px] lg:pr-[30px]">
            <Camera className="h-[22px] w-[22px]" aria-hidden="true" /> {t("checkNow")}
          </Link>
          <Link href="/check?sample=1"
            className="flex h-12 items-center justify-center text-[17px] font-semibold text-ink underline underline-offset-[5px] lg:border-b-[1.5px] lg:border-ink lg:text-lg lg:no-underline">
            {t("trySample")}
          </Link>
        </div>

        {/* Only numbers the project has measured. */}
        <dl className="mx-5 mt-3 grid grid-cols-3 border-y border-border py-[18px] [grid-area:stats] lg:mx-0 lg:mt-14 lg:flex lg:gap-16 lg:self-start lg:border-0 lg:py-0">
          {[
            { v: pct(R.finalFieldAccuracy), l: t("statAccuracy"), long: t("statAccuracyLong") },
            { v: "8", l: t("statLanguages"), long: t("statLanguages") },
            { v: t("free"), l: t("statFree"), long: t("statFree") },
          ].map((s, i) => (
            <div key={s.l} className={i ? "pl-3.5 lg:pl-0" : ""}>
              <dt className="sr-only">{s.long}</dt>
              <dd className="text-[32px] font-semibold leading-none tracking-[-0.03em] text-ink lg:text-[46px]">{s.v}</dd>
              <dd className="mt-1.5 text-sm leading-[1.3] text-ink-2 lg:mt-2 lg:text-[15px]" aria-hidden="true">
                <span className="lg:hidden">{s.l}</span><span className="hidden lg:inline">{s.long}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <section id="how" aria-labelledby="how-h" className={`scroll-mt-4 ${band}`}>
        <h2 id="how-h" className={h2}>{t("howItWorks")}</h2>
        <ol className="mt-2.5 lg:hidden">
          {FLOW.map((f, i) => (
            <Row key={f.title} last={i === FLOW.length - 1} title={t(f.title)} text={t(f.text)}
              lead={<span className="serif-i w-[18px] text-2xl text-ink-3" aria-hidden="true">{i + 1}</span>} />
          ))}
        </ol>
        <ol className="hidden grid-cols-3 gap-10 lg:grid">
          {FLOW.map((f, i) => (
            <li key={f.title}>
              <span className="serif-i text-[34px] text-ink-3" aria-hidden="true">{i + 1}</span>
              <p className="mt-2 flex items-center gap-2 text-xl font-semibold text-ink"><f.icon className="h-5 w-5 shrink-0" aria-hidden="true" />{t(f.title)}</p>
              <p className="mt-1.5 text-base leading-[1.55] text-ink-2">{t(f.long)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="answers" className={band}>
        <div>
          <h2 id="answers" className={h2}>{t("kinds")}</h2>
          <p className="mt-2.5 hidden text-base leading-normal text-ink-2 lg:block">{t("kindsSub")}</p>
        </div>
        <ul className="mt-2.5 lg:hidden">
          {OUTCOMES.map((o, i) => (
            <Row key={o.title} last={i === OUTCOMES.length - 1} title={t(o.title)} text={t(o.text)}
              lead={<span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${o.tone}`} aria-hidden="true"><o.icon className="h-[22px] w-[22px]" /></span>} />
          ))}
        </ul>
        <ul className="hidden grid-cols-3 gap-4 lg:grid">
          {OUTCOMES.map((o) => (
            <li key={o.title} className="rounded-[22px] border border-border bg-surface p-[22px]">
              <span className={`flex h-11 w-11 items-center justify-center rounded-full ${o.tone}`} aria-hidden="true"><o.icon className="h-[22px] w-[22px]" /></span>
              <p className="mt-4 text-xl font-semibold text-ink">{t(o.title)}</p>
              <p className="mt-1 text-base leading-normal text-ink-2">{t(o.long)}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- Why honesty matters: the measured results ---------- */}
      <section id="why" aria-labelledby="why-h" className={`scroll-mt-4 ${band}`}>
        <div>
          <h2 id="why-h" className={h2}>{t("whyTitle")}</h2>
          <p className="mt-2.5 hidden text-base leading-normal text-ink-2 lg:block">{t("whyTested", { n: R.fieldTestPhotos.toLocaleString("en-IN") })}</p>
        </div>

        {/* Phone */}
        <div className="mt-4 flex flex-col gap-[18px] lg:hidden">
          <div>
            <div className="flex items-baseline justify-between">
              <span className="font-semibold text-ink">{t("whyLab")}</span>
              <span className="text-[28px] font-semibold text-ink-3">{pct(R.labOnlyFieldAccuracy)}</span>
            </div>
            <div className="mt-1.5"><Bar value={R.labOnlyFieldAccuracy} tick={R.labOnlyFieldConfidence} /></div>
            <p className="mt-1.5 text-sm text-ink-2">{t("whyLabNote", { conf: pct(R.labOnlyFieldConfidence) })}</p>
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <span className="font-semibold text-ink">{t("whyOursTag")}</span>
              <span className="text-[28px] font-semibold text-ink">{pct(R.finalFieldAccuracy)}</span>
            </div>
            <div className="mt-1.5"><Bar value={R.finalFieldAccuracy} strong /></div>
            <p className="mt-1.5 text-sm text-ink-2">{t("whyOursNote", { cov: pct(R.coverage), alone: pct(R.accuracyWhenAnswered) })}</p>
          </div>
          <p className="text-sm text-ink-3">{t("whyTested", { n: R.fieldTestPhotos.toLocaleString("en-IN") })}</p>
        </div>

        {/* Laptop */}
        <div className="hidden flex-col gap-[26px] lg:flex">
          <div className="grid grid-cols-[220px_minmax(0,1fr)_90px] items-center gap-6">
            <div>
              <p className="text-[17px] font-semibold text-ink">{t("whyLab")}</p>
              <p className="mt-0.5 text-sm text-ink-3">{t("whyLabSays", { conf: pct(R.labOnlyFieldConfidence) })}</p>
            </div>
            <Bar value={R.labOnlyFieldAccuracy} tick={R.labOnlyFieldConfidence} />
            <p className="text-right text-[34px] font-semibold text-ink-3">{pct(R.labOnlyFieldAccuracy)}</p>
          </div>
          <div className="grid grid-cols-[220px_minmax(0,1fr)_90px] items-center gap-6">
            <div>
              <p className="text-[17px] font-semibold text-ink">{t("whyOursTag")}</p>
              <p className="mt-0.5 text-sm text-ink-3">{t("whyFirstLabel")}</p>
            </div>
            <Bar value={R.finalFieldAccuracy} strong />
            <p className="text-right text-[34px] font-semibold text-ink">{pct(R.finalFieldAccuracy)}</p>
          </div>
          <div className="grid grid-cols-2 gap-6 border-t border-border pt-5">
            <div>
              <p className="text-[34px] font-semibold leading-none text-ink">{pct(R.coverage)}</p>
              <p className="mt-1.5 text-[15px] leading-normal text-ink-2">{t("whyCoverDesk")}</p>
            </div>
            <div>
              <p className="text-[34px] font-semibold leading-none text-ink">{pct(R.accuracyWhenAnswered)}</p>
              <p className="mt-1.5 text-[15px] leading-normal text-ink-2">{t("whyAloneDesk", { answered: pct(R.answeredByAssistant) })}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
