"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorKey, imageUrl, type CaseView, type Meta, type Message } from "@/lib/api";
import {
  ArrowUp, BadgeCheck, BookOpen, Camera, CircleCheck, CircleHelp, Focus, Hand, Hourglass, Leaf, ScanSearch, Sun, UserRound,
} from "lucide-react";
import {
  ActionList, actionSteps, ConfidenceBar, cropName, englishShort, extentIcon, ListenButton, MoreDetails, optionIcon, PhotoCompare,
  PhotoHero, ResultSkeleton, shortName, Shortlist, Tag, UrgencyBlock, type HeroKind,
} from "./visuals";
import { Mark } from "@/components/SiteChrome";
import { useT, type Key, type T } from "@/lib/i18n";
import { useVisiblePoll } from "@/lib/poll";

// Tiny safe formatter: **bold**, "- " bullets and line breaks only (no HTML from the server is ever injected).
function Rich({ text }: { text: string }) {
  const bold = (line: string) =>
    line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
      part.startsWith("**") && part.endsWith("**") ? <strong key={j}>{part.slice(2, -2)}</strong> : part);
  const body = text.replace(/\n*Sources:[\s\S]*$/, "");      // sources are shown separately, below
  return (
    <>
      {body.split("\n").filter((l) => l.trim()).map((line, i) => {
        const bullet = /^\s*[-*•]\s+/.test(line);
        return bullet ? (
          <p key={i} className="mt-1.5 flex gap-2"><span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-2" /><span>{bold(line.replace(/^\s*[-*•]\s+/, ""))}</span></p>
        ) : (
          <p key={i} className={i ? "mt-2" : ""}>{bold(line)}</p>
        );
      })}
    </>
  );
}

function Bubble({ m, language }: { m: Message; language: string }) {
  const t = useT();
  const mine = m.role === "farmer";
  const expert = m.role === "expert";
  const text = t.server(m.text);     // fixed server sentences (template replies, options) in the farmer's language
  if (mine)
    return (
      <div className="flex justify-end">
        <div className={`max-w-[80%] rounded-[18px_18px_4px_18px] bg-brand text-base leading-[1.55] text-on-brand ${m.image ? "p-1" : "px-3.5 py-2.5"}`}>
          {m.image ? <img src={imageUrl(m.image)} alt={t("yourPhoto")} className="h-40 w-40 rounded-[15px_15px_3px_15px] object-cover" /> : <Rich text={text} />}
        </div>
      </div>
    );
  return (
    <div className="flex items-end gap-2">
      {expert ? (
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-expert-soft text-expert" aria-hidden="true"><UserRound className="h-4 w-4" /></span>
      ) : (
        <Mark size={30} corners={false} />
      )}
      <div className={`max-w-[85%] rounded-[18px_18px_18px_4px] border px-3.5 py-3 text-base leading-[1.6] text-ink ${expert ? "border-expert-solid bg-expert-soft" : "border-border bg-surface"}`}>
        {expert && <p className="mb-1 text-sm font-semibold text-expert">{t("expertAnswer")}</p>}
        {m.image ? <img src={imageUrl(m.image)} alt={t("yourPhoto")} className="h-40 w-40 rounded-xl object-cover" /> : <Rich text={text} />}
        {!m.image && <ListenButton text={text} language={language} />}
        {m.sources.length > 0 && (
          <div className="mt-2 flex flex-col gap-0.5 border-t border-border pt-2 text-[13px] text-ink-3">
            <span className="flex items-center gap-1.5 font-semibold text-ink-2"><BookOpen className="h-3.5 w-3.5" aria-hidden="true" />{t("sources")}</span>
            {m.sources.map((s) => {
              const url = s.match(/https?:\/\/\S+/)?.[0];
              const label = url ? s.replace(url, "").replace(/:\s*$/, "") : s;
              return url ? (
                <a key={s} className="text-ink-3 underline underline-offset-[3px] hover:text-ink" href={url} target="_blank" rel="noreferrer">{label}</a>
              ) : <span key={s}>{label}</span>;
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function heroKind(c: CaseView): HeroKind {
  const a = c.assessment;
  if (c.status === "expert_answered") return "answered";
  if (a.status === "retake") return "retake";
  if (a.status === "healthy") return "healthy";
  if (a.status === "diagnosis") return "diagnosis";
  if (a.status === "question") return "question";
  if (a.unfamiliar) return "unfamiliar";
  return "expert";
}

const TIPS: { icon: typeof Sun; text: Key }[] = [
  { icon: Sun, text: "tipLight" },
  { icon: Leaf, text: "tipFill" },
  { icon: Focus, text: "tipFocus" },
];

// The first sentence of a server message, as a heading ("The photo is blurry.").
const firstSentence = (s: string) => (s.match(/^[^.।!?]+[.।!?]?/)?.[0] ?? s).trim();

function since(from: string, to: string, t: T): string | null {
  const ms = Date.parse(to) - Date.parse(from);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const min = Math.round(ms / 60000);
  if (min < 60) return t("tMinutes", { n: Math.max(1, min) });
  const h = Math.round(min / 60);
  if (h < 48) return h === 1 ? t("tHour") : t("tHours", { n: h });
  return t("tDays", { n: Math.round(h / 24) });
}

/** Everything the big Listen button reads: the verdict, then what to do. */
function spokenSummary(c: CaseView, kind: HeroKind, t: T): string {
  const a = c.assessment;
  const parts: string[] = [];
  if (kind === "answered" && c.expert) parts.push(t("expertSays"), t.server(c.expert.name));
  else if ((kind === "diagnosis" || kind === "healthy") && a.disease) {
    const healthy = kind === "healthy";
    parts.push(healthy ? t("goodNews") : t("mostLikely"), t.server(a.disease.name));
    if (!healthy && a.urgency && a.urgency.level !== "none" && a.urgency.act_within) parts.push(t("actWithin", { t: t.server(a.urgency.act_within) }));
    parts.push(t(healthy ? "keepHealthy" : "whatToDo"), ...actionSteps(a.disease, healthy, a.urgency?.level === "urgent").map((s, i) => `${i + 1}. ${t(s.text)}`));
    if (!healthy && a.urgency?.why) parts.push(t.server(a.urgency.why));
    if (!healthy) parts.push(t("notCertain"));
  } else if (kind === "retake") {
    parts.push(t("retakeTag"), t.server(a.message), ...TIPS.map((tip) => t(tip.text)));
  } else if (kind === "question" && a.question) {
    parts.push(t("oneQuestion"), t.server(a.question.text), ...a.question.options.map((o) => t.server(o)));
  } else {
    parts.push(t(kind === "unfamiliar" ? "unusualTag" : "heroExpert"));
    if (c.status === "pending") parts.push(t("waitingNote"), t("waitSpray"));
  }
  // A full stop after each part so the voice pauses between them.
  return parts.filter(Boolean).map((p) => (/[.।?!]$/.test(p.trim()) ? p.trim() : `${p.trim()}.`)).join(" ");
}

function DontSpray({ full }: { full: boolean }) {
  const t = useT();
  return full ? (
    <div className="mx-4 mt-4 flex gap-3 rounded-[20px] border-[1.5px] border-soon-solid p-4">
      <Hand className="mt-0.5 h-[26px] w-[26px] shrink-0 text-soon" aria-hidden="true" />
      <div>
        <p className="text-lg font-bold text-ink">{t("dontSpray")}</p>
        <p className="mt-0.5 text-[15px] leading-normal text-ink-2">{t("waitSpray")}</p>
      </div>
    </div>
  ) : (
    <div className="mx-4 mt-2.5 flex items-center gap-3 rounded-[18px] border-[1.5px] border-soon-solid px-4 py-3.5">
      <Hand className="h-[22px] w-[22px] shrink-0 text-soon" aria-hidden="true" />
      <p className="font-semibold text-ink">{t("dontSpray")}</p>
    </div>
  );
}

/** The top of the result: what it found, in the shape of that kind of answer. */
function ResultBody({ c, kind, meta, busy, onAnswer, onNew }: {
  c: CaseView; kind: HeroKind; meta: Meta; busy: boolean;
  onAnswer: (option: number | null) => void; onNew: () => void;
}) {
  const t = useT();
  const a = c.assessment;
  const photo = c.image ? imageUrl(c.image) : undefined;
  const listen = <ListenButton big text={spokenSummary(c, kind, t)} language={t.hi ? "Hindi" : "English"} />;
  const pending = c.status === "pending";

  if (kind === "retake")
    return (
      <>
        <PhotoHero src={photo} alt={t("yourPhoto")} height={220} look="blur" />
        <div className="px-5 pt-[22px]">
          <Tag icon={Camera} tone="text-soon">{t("retakeTag")}</Tag>
          <h1 className="mt-1 text-4xl font-semibold leading-[1.05] tracking-[-0.035em] text-ink">{firstSentence(t.server(a.message))}</h1>
        </div>
        <ul className="px-5 pt-5">
          {TIPS.map((tip, i) => (
            <li key={tip.text} className={`flex min-h-16 items-center gap-3.5 border-b border-border ${i ? "" : "border-t"}`}>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink" aria-hidden="true"><tip.icon className="h-[22px] w-[22px]" /></span>
              <span className="text-lg text-ink">{t(tip.text)}</span>
            </li>
          ))}
        </ul>
        <div className="px-5 pt-5">
          <button type="button" onClick={onNew}
            className="flex h-[58px] w-full items-center justify-center gap-2.5 rounded-full bg-brand text-[19px] font-semibold text-on-brand hover:opacity-90">
            <Camera className="h-[22px] w-[22px]" aria-hidden="true" />{t("takeNew")}
          </button>
        </div>
      </>
    );

  if (kind === "answered" && c.expert) {
    const note = [...c.messages].reverse().find((m) => m.role === "expert");
    const after = note ? since(c.created_at, note.created_at, t) : null;
    return (
      <>
        <div className="px-5 pt-2">
          <Tag icon={BadgeCheck} tone="text-expert">{t("expertAnswered")}</Tag>
          <p className="mt-2.5 text-[15px] font-semibold text-ink-3">{t("expertSays")}</p>
          <h1 className="text-[46px] font-semibold leading-none tracking-[-0.04em] text-ink">{shortName(c.expert.name, c.crop, t)}</h1>
        </div>
        {note && (
          <div className="mx-4 mt-[18px] rounded-[22px] border-[1.5px] border-expert-solid bg-surface p-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-expert-soft text-expert" aria-hidden="true"><UserRound className="h-5 w-5" /></span>
              <div>
                <p className="font-semibold text-ink">{t("agriExpert")}</p>
                {after && <p className="text-[13px] text-ink-3">{t("answeredAfter", { t: after })}</p>}
              </div>
            </div>
            <div className="mt-3 text-[17px] leading-[1.55] text-ink"><Rich text={t.server(note.text)} /></div>
          </div>
        )}
        {listen}
        <PhotoCompare photo={photo} disease={c.expert} short />
        <MoreDetails d={c.expert} />
      </>
    );
  }

  if ((kind === "diagnosis" || kind === "healthy") && a.disease) {
    const healthy = kind === "healthy";
    const urgent = a.urgency?.level === "urgent";
    if (healthy)
      return (
        <>
          <PhotoHero src={photo} alt={t("yourPhoto")} height={220} />
          <div className="px-5 pt-[22px]">
            <Tag icon={CircleCheck} tone="text-ok" size={18}>{t("goodNews")}</Tag>
            <h1 className="mt-1 text-[44px] font-semibold leading-none tracking-[-0.04em] text-ink">{t("heroHealthy")}</h1>
            <p className="mt-2 text-[17px] leading-[1.45] text-ink-2">{t("healthyT", { crop: t.hi ? cropName(c.crop, t) : cropName(c.crop, t).toLowerCase() })}</p>
          </div>
          {listen}
          <ActionList title={t("keepHealthy")} steps={actionSteps(a.disease, true, false)} />
        </>
      );
    const name = shortName(a.disease.name, c.crop, t);
    const en = englishShort(a.disease.name, c.crop);
    return (
      <>
        <PhotoHero src={photo} alt={t("yourPhoto")} chip={t("yourLeaf")} />
        <div className="px-5 pt-[22px]">
          <p className="text-[15px] font-semibold text-ink-3">{t("mostLikely")} · {cropName(c.crop, t)}</p>
          <h1 className="mt-0.5 text-[46px] font-semibold leading-none tracking-[-0.04em] text-ink">{name}</h1>
          {t.hi && en !== name && <p className="text-base text-ink-3" lang="en">{en}</p>}
          <ConfidenceBar p={a.probability ?? 0} />
        </div>
        {a.urgency && a.urgency.level !== "none" && <UrgencyBlock u={a.urgency} />}
        {listen}
        <ActionList title={t("whatToDo")} steps={actionSteps(a.disease, false, urgent)} note={t("notCertain")} />
        <PhotoCompare photo={photo} disease={a.disease} />
        <MoreDetails d={a.disease} fraction={a.severity_estimate?.fraction ?? null} />
        {c.audit && (
          <p className="mx-5 mt-4 flex items-center gap-2 text-sm font-semibold text-expert">
            <UserRound className="h-5 w-5 shrink-0" aria-hidden="true" />{t("doubleCheck")}
          </p>
        )}
      </>
    );
  }

  if (kind === "question" && a.question)
    return (
      <>
        <div className="flex items-center gap-3.5 px-5 pt-2">
          {photo && <img src={photo} alt={t("yourPhoto")} className="h-[88px] w-[88px] shrink-0 rounded-[18px] object-cover" />}
          <div>
            <Tag icon={CircleHelp} tone="text-ask" size={16}>{t("almost")}</Tag>
            <h1 className="mt-0.5 text-[28px] font-semibold leading-[1.05] tracking-[-0.03em] text-ink">{t("oneQuestion")}</h1>
          </div>
        </div>
        <section aria-labelledby="q" className="rise mx-4 mt-5 rounded-[22px] border-[1.5px] border-ask-solid bg-surface p-4">
          <h2 id="q" className="text-xl font-semibold leading-[1.3] text-ink">{t.server(a.question.text)}</h2>
          <p className="mb-3.5 mt-1 text-[15px] text-ink-2">{t("pickClosest")}</p>
          <div className="flex flex-col gap-2">
            {a.question.options.map((o, i) => {
              const Icon = optionIcon(o);
              return (
                <button key={o} type="button" disabled={busy} onClick={() => onAnswer(i)}
                  className="flex min-h-[76px] items-center gap-3 rounded-2xl border border-border bg-background p-2 text-left text-[17px] font-semibold text-ink transition hover:border-ask-solid disabled:opacity-50">
                  <span className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink-2" aria-hidden="true"><Icon className="h-[26px] w-[26px]" /></span>
                  <span className="flex-1 leading-[1.3]">{t.server(o)}</span>
                </button>
              );
            })}
            <button type="button" disabled={busy} onClick={() => onAnswer(null)}
              className="flex min-h-[60px] items-center gap-3 rounded-2xl p-2 text-left text-[17px] font-semibold text-ink-2 hover:bg-surface-2 disabled:opacity-50">
              <span className="ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-expert-soft text-expert" aria-hidden="true"><UserRound className="h-[22px] w-[22px]" /></span>
              {t("notSureExpert")}
            </button>
          </div>
        </section>
        {listen}
      </>
    );

  const known = meta.diseases.filter((d) => !d.label.endsWith("healthy") && !d.label.endsWith("something_else")).length;
  if (kind === "unfamiliar")
    return (
      <>
        <PhotoHero src={photo} alt={t("yourPhoto")} height={220} look="dashed" />
        <div className="px-5 pt-[22px]">
          <Tag icon={ScanSearch} tone="text-expert">{t("unusualTag")}</Tag>
          <h1 className="mt-1 text-[34px] font-semibold leading-[1.05] tracking-[-0.035em] text-ink">{t("unusualTitle")}</h1>
          <p className="mt-2.5 text-[17px] leading-normal text-ink-2">{t(pending ? "unusualText" : "unusualSoon", { n: known })}</p>
        </div>
        {pending && (
          <>
            <div className="mx-4 mt-[18px] flex items-center gap-3 rounded-[18px] bg-expert-soft px-4 py-3.5" role="status">
              <Hourglass className="h-[22px] w-[22px] shrink-0 text-expert" aria-hidden="true" />
              <div>
                <p className="font-semibold text-ink">{t("waitingExpert")}</p>
                <p className="text-sm text-ink-2">{t("waitingShort")}</p>
              </div>
            </div>
            <DontSpray full={false} />
          </>
        )}
        {listen}
      </>
    );

  // Sent to an expert: the progress, "don't spray yet", and what it might be.
  const options = a.top.filter((o) => a.shortlist.some((s) => s.label === o.label));
  const answered = c.status !== "pending";
  return (
    <>
      <div className="mx-4 mt-1 rounded-[26px] bg-expert-soft px-5 py-[22px]">
        <div className="flex items-center gap-3.5">
          {photo && <img src={photo} alt={t("yourPhoto")} className="h-[72px] w-[72px] shrink-0 rounded-2xl object-cover" />}
          <div>
            <Tag icon={UserRound} tone="text-expert" size={16}>{t("heroExpert")}</Tag>
            <h1 className="mt-0.5 text-[26px] font-semibold leading-[1.1] tracking-[-0.025em] text-ink">{t("personWill")}</h1>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-1.5" role="img" aria-label={t("stWithExpert")}>
          <div><div className="h-1 rounded-full bg-expert-solid" /><p className="mt-1.5 text-[13px] font-semibold text-ink">{t("stReceived")}</p></div>
          <div><div className={`h-1 rounded-full bg-expert-solid ${answered ? "" : "opacity-55"}`} /><p className="mt-1.5 text-[13px] font-semibold text-expert">{t("stWithExpert")}</p></div>
          <div><div className={`h-1 rounded-full ${answered ? "bg-expert-solid" : "bg-border"}`} /><p className="mt-1.5 text-[13px] text-ink-3">{t("stAnswer")}</p></div>
        </div>
        <p className="mt-3.5 text-[15px] leading-normal text-ink-2">{t("waitingNote")}</p>
      </div>
      {pending && <DontSpray full />}
      {options.length > 0 ? (
        <div className="px-5 pt-6">
          <p className="text-lg font-semibold text-ink">{t("couldBe")}</p>
          <Shortlist items={options} />
        </div>
      ) : (
        <p className="px-5 pt-6 text-ink-2">{t("unknownPhoto")}</p>
      )}
      {listen}
    </>
  );
}

type Props = { id: number; meta: Meta; language: string; initial: CaseView | null; onNew: () => void };

export default function CaseScreen({ id, meta, language, initial, onNew }: Props) {
  const [c, setC] = useState<CaseView | null>(initial);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<Key | null>(null);
  const [text, setText] = useState("");
  const t = useT();
  const endRef = useRef<HTMLDivElement>(null);

  // Background check for the expert's answer. A failed poll is ignored (the next one retries), and a poll that
  // lands while the farmer's own action is running must not overwrite that action's newer result.
  const load = useCallback(async () => {
    try {
      const v = await api.getCase(id);
      if (!busyRef.current) setC(v);
    } catch {}
  }, [id]);

  useEffect(() => {
    if (initial) return;
    let alive = true;
    api.getCase(id)
      .then((v) => alive && setC(v))
      .catch((e) => alive && setError(errorKey(e, "case")));
    return () => {
      alive = false;
    };
  }, [id, initial]);

  // Waiting for an expert: check for their answer every 15 seconds (only while this tab is on screen).
  useVisiblePoll(load, 15000, c?.status === "pending" || (!!c?.audit && c.status === "answered"));

  // Scroll to new chat messages, but not on first load: the farmer should see the result first.
  const seen = useRef<number | null>(null);
  useEffect(() => {
    const n = c?.messages.length ?? 0;
    if (seen.current !== null && n > seen.current) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    if (n) seen.current = n;
  }, [c?.messages.length]);

  const act = async (fn: () => Promise<CaseView>, onFail?: () => void) => {
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      setC(await fn());
    } catch (e) {
      setError(errorKey(e));
      onFail?.();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  if (!c)
    return error ? (
      <p role="alert" className="mx-3 mt-2 rounded-[18px] border border-border bg-surface p-4 font-semibold text-ink">{t(error)}</p>
    ) : <ResultSkeleton label={t("loadingCase")} />;

  const kind = heroKind(c);
  // The expert's note is shown in its own card at the top, so the chat doesn't repeat it.
  const shownNote = kind === "answered" ? [...c.messages].reverse().find((m) => m.role === "expert") : undefined;
  const chat = c.messages.filter((m) => m !== shownNote);

  return (
    <div className="pb-4">
      <ResultBody c={c} kind={kind} meta={meta} busy={busy} onNew={onNew}
        onAnswer={(option) => act(() => api.answerQuestion(c.id, option, language))} />

      {c.ask_extent && c.status !== "expert_answered" && (
        <section aria-labelledby="ext" className="rise mx-4 mt-[22px] rounded-[20px] border border-border bg-surface p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ask"><CircleHelp className="h-[18px] w-[18px]" aria-hidden="true" />{t("oneQuestionTag")}</p>
          <h2 id="ext" className="mb-1 mt-1 text-lg font-semibold leading-normal text-ink">{t.server(meta.extent_question.text)}</h2>
          <p className="mb-3 text-sm text-ink-3">{t("extentWhy")}</p>
          <div className="grid grid-cols-3 gap-2">
            {meta.extent_question.options.map((o) => {
              const Icon = extentIcon(o.value);
              return (
                <button key={o.value} type="button" disabled={busy} onClick={() => act(() => api.answerExtent(c.id, o.value))}
                  className="flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-[14px] border border-border px-1.5 py-2 text-center text-[15px] font-semibold leading-[1.3] text-ink transition hover:border-ask-solid disabled:opacity-50">
                  <Icon className="h-[18px] w-[18px]" aria-hidden="true" />{t.server(o.text)}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {(chat.length > 0 || kind !== "retake") && (
        <section aria-labelledby="chat" className="flex flex-col gap-3 px-4 pt-[26px]" aria-live="polite">
          <h2 id="chat" className="text-xl font-semibold tracking-[-0.01em] text-ink">{t("askAbout")}</h2>
          {chat.map((m, i) => <Bubble key={i} m={m} language={language} />)}
          {busy && (
            <div className="flex items-end gap-2">
              <Mark size={30} corners={false} />
              <div className="rounded-[18px_18px_18px_4px] border border-border bg-surface px-3.5 py-3">
                <span className="dot-pulse text-ink-3" aria-label={t("writing")}><span>●</span> <span>●</span> <span>●</span></span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </section>
      )}

      {error && <p role="alert" className="mx-4 mt-3 rounded-[18px] border border-border bg-surface p-3 font-semibold text-urgent">{t(error)}</p>}

      {kind !== "retake" && (
        <form className="sticky bottom-3 z-10 mx-3 mt-6 flex gap-2 rounded-full border border-border bg-surface py-1.5 pl-[18px] pr-1.5 shadow-float"
          onSubmit={(e) => {
            e.preventDefault();
            const q = text.trim();
            if (!q) return;
            setText("");
            // If sending fails, give the farmer their question back instead of losing it.
            act(() => api.ask(c.id, q, language), () => setText((cur) => cur || q));
          }}>
          <label htmlFor="ask" className="sr-only">{t("askPlaceholder")}</label>
          <input id="ask" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder={t("askPlaceholder")}
            className="h-12 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-3" />
          <button type="submit" disabled={busy || !text.trim()} aria-label={t("send")}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand text-on-brand transition disabled:opacity-40">
            <ArrowUp className="h-[22px] w-[22px]" aria-hidden="true" />
          </button>
        </form>
      )}
    </div>
  );
}
