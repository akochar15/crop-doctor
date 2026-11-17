"use client";

// The expert dashboard (laptop first, English only): sign in with the key, then three tabs.
// Queue: photos to answer, list on the left, the selected case on the right. Trust meter: is the 90% promise
// holding? Answered: what experts said. Only data the server has is shown (no locations, no invented counts).
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight, Check, CircleAlert, CircleCheck, FlaskConical, KeyRound, LogOut, Plus, RotateCcw, Send, Sprout, UserRound,
} from "lucide-react";
import { api, ApiError, expertKey, imageUrl, type Answered, type QueueItem, type Trust } from "@/lib/api";
import { useVisiblePoll } from "@/lib/poll";
import { Mark } from "@/components/SiteChrome";
import ThemeToggle from "@/components/ThemeToggle";
import TrustChart from "./TrustChart";

type Tab = "queue" | "trust" | "answered";

const card = "rounded-[20px] border border-border bg-surface p-5";
const pctOf = (v: number) => `${Math.round(v * 100)}%`;

/** "Potato late blight" → "Late blight" (the crop is shown next to it). */
const short = (name: string | undefined, crop: string) => {
  if (!name) return "";
  const s = name.replace(new RegExp(`^${crop}\\s+`, "i"), "");
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function ago(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  const days = Math.floor((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 864e5);
  const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString("en-IN", { weekday: "short" });
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

const kindOf = (q: QueueItem) => (q.kind === "audit" ? "Random audit" : q.assessment.unfamiliar ? "Unusual photo" : "Assistant unsure");
const EXTENT: Record<string, string> = { few: "A few plants", some: "Some plants", many: "Many plants" };

/* ---------------- Sign in ---------------- */

function KeyGate({ onDone, error }: { onDone: () => void; error: string | null }) {
  const [key, setKey] = useState("");
  return (
    <div className="flex min-h-[640px] items-center justify-center px-4">
      <form className="w-full max-w-[420px] rounded-[28px] border border-border bg-surface p-9 shadow-float"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            localStorage.setItem("cd_expert_key", key.trim());
          } catch {}
          onDone();
        }}>
        <Mark size={44} corners={false} />
        <h1 className="mt-5 text-[30px] font-semibold tracking-[-0.03em] text-ink">Expert dashboard</h1>
        <p className="mt-1.5 text-base leading-normal text-ink-2">Answer the photos the app wasn&apos;t sure about.</p>
        <label htmlFor="key" className="mt-6 block text-[15px] font-semibold text-ink">Expert key</label>
        <div className="mt-1.5 flex h-[52px] items-center gap-2.5 rounded-[14px] border-[1.5px] border-ink bg-background px-3.5">
          <KeyRound className="h-[18px] w-[18px] shrink-0 text-ink-3" aria-hidden="true" />
          <input id="key" type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="current-password"
            className="h-full min-w-0 flex-1 bg-transparent text-lg text-ink outline-none" />
        </div>
        {error && <p role="alert" className="mt-2 text-sm font-semibold text-urgent">{error}</p>}
        <button className="mt-4 flex h-[54px] w-full items-center justify-center gap-2 rounded-full bg-brand text-[17px] font-semibold text-on-brand hover:opacity-90">
          Sign in<ArrowRight className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}

/* ---------------- Queue ---------------- */

function QueueList({ items, selected, onSelect }: { items: QueueItem[]; selected: number | undefined; onSelect: (id: number) => void }) {
  return (
    <div className="border-border p-4 lg:border-r">
      <p className="mx-2 mb-2.5 mt-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-3">Waiting · oldest first</p>
      <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
        {items.map((q) => {
          const on = q.id === selected;
          return (
            <li key={q.id} className="shrink-0 lg:shrink">
              <button type="button" onClick={() => onSelect(q.id)} aria-current={on}
                className={`flex w-full items-center gap-3 rounded-2xl p-2.5 text-left ${on ? "bg-surface shadow-[0_0_0_1.5px_var(--ink)]" : "hover:bg-surface-2"}`}>
                <img src={imageUrl(q.image)} alt="" className="h-[52px] w-[52px] shrink-0 rounded-xl object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">#{q.id} · {cap(q.crop)}</p>
                  <p className="truncate text-[13px] text-ink-3">{ago(q.created_at)} · {kindOf(q)}</p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CaseDetail({ item, onAnswered }: { item: QueueItem; onAnswered: (msg: string) => void }) {
  // No answer is pre-selected: a pre-filled model guess would bias the expert, and audit answers are meant to be
  // an independent check that recalibrates the assistant.
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const a = item.assessment;
  const choices = [
    ...item.options.map((o) => ({ value: o.label, text: short(o.name, item.crop) })),
    { value: "other", text: "Something else" },
    { value: "unusable", text: "Need a better photo" },
  ];
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.expertAnswer(item.id, label, note.trim());
      onAnswered(r.recalibrated && r.run
        ? `Check #${item.id} answered. Audit added: coverage is now ${(r.run.monitor_coverage * 100).toFixed(1)}%.`
        : `Check #${item.id} answered. The farmer sees it on their result page.`);
    } catch (e) {
      setError(e instanceof ApiError ? `Not sent: ${e.message}` : "Not sent. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div className="grid items-start gap-9 px-4 py-7 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:px-9 xl:grid-cols-[420px_minmax(0,1fr)]">
      <div>
        <img src={imageUrl(item.image)} alt={`Farmer's photo, check ${item.id}`} className="block aspect-square w-full rounded-3xl object-cover" />
        {a.extent && EXTENT[a.extent] && (
          <p className="mt-3.5 flex items-center gap-1.5 text-sm text-ink-2"><Sprout className="h-4 w-4" aria-hidden="true" />{EXTENT[a.extent]} affected</p>
        )}
      </div>

      <div className="flex flex-col gap-6">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-expert">
            <UserRound className="h-4 w-4" aria-hidden="true" />{item.kind === "audit" ? "Random audit: please check the answer" : "Needs an expert"}
          </p>
          <h2 className="mt-1 text-[34px] font-semibold leading-tight tracking-[-0.03em] text-ink">Check #{item.id} · {cap(item.crop)}</h2>
          <p className="mt-1 text-[15px] text-ink-2">
            {item.kind === "audit" && item.model_guess
              ? <>The assistant answered <b className="text-ink">{short(item.model_guess.name, item.crop)}</b>.</>
              : <>Reason: {a.reason ?? "unsure"}.</>}
          </p>
        </div>

        {a.top.length > 0 && (
          <div>
            <p className="mb-2.5 font-semibold text-ink">Model&apos;s top guesses</p>
            <div className="grid grid-cols-[140px_minmax(0,1fr)_48px] items-center gap-3 text-[15px]">
              {a.top.map((g, i) => (
                <div key={g.label} className="contents">
                  <span className={`truncate text-ink ${i < 2 ? "font-semibold" : ""}`}>{short(g.name, item.crop)}</span>
                  <div className="h-2.5 rounded-full bg-surface-2" aria-hidden="true">
                    <div className={`h-full rounded-full ${i === 0 ? "bg-ink" : i === 1 ? "bg-ink-2" : "bg-ink-3"}`} style={{ width: pctOf(g.probability) }} />
                  </div>
                  <span className="text-right tabular-nums text-ink">{pctOf(g.probability)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {item.farmer_said.length > 0 && (
          <div className="rounded-2xl border border-border bg-surface px-4 py-3.5">
            <p className="text-[13px] font-semibold text-ink-3">What the farmer said</p>
            <p className="mt-1 text-base leading-normal text-ink">{item.farmer_said.map((s) => `“${s}”`).join(" · ")}</p>
          </div>
        )}

        <fieldset>
          <legend className="mb-2.5 font-semibold text-ink">Your diagnosis</legend>
          <div className="flex flex-wrap gap-2">
            {choices.map((o) => {
              const on = label === o.value;
              return (
                <button type="button" key={o.value} onClick={() => setLabel(o.value)} aria-pressed={on}
                  className={`flex h-11 items-center gap-1.5 rounded-full px-4 font-semibold ${
                    on ? "bg-brand text-on-brand" : "border border-border text-ink hover:border-ink-3"}`}>
                  {on && <Check className="h-4 w-4" aria-hidden="true" />}{o.text}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div>
          <label htmlFor={`note${item.id}`} className="mb-1.5 block font-semibold text-ink">Note to the farmer</label>
          <textarea id={`note${item.id}`} value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000}
            placeholder="e.g. Remove the affected leaves today and ask your KVK about a spray."
            className="min-h-24 w-full rounded-2xl border border-border bg-surface px-3.5 py-3 text-base leading-normal text-ink placeholder:text-ink-3" />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={busy || !label} onClick={send}
            className="flex h-[52px] items-center gap-2 rounded-full bg-brand px-6 text-[17px] font-semibold text-on-brand hover:opacity-90 disabled:opacity-40">
            <Send className="h-[18px] w-[18px]" aria-hidden="true" />{busy ? "Sending…" : "Send answer"}
          </button>
          <span className="text-sm text-ink-3">{label ? "The farmer sees it on their result page." : "Choose a diagnosis first."}</span>
        </div>
        {error && <p role="alert" className="rounded-2xl bg-urgent-soft px-4 py-3 text-sm text-urgent">{error}</p>}
      </div>
    </div>
  );
}

/* ---------------- Trust meter ---------------- */

function Stat({ label, value, sub }: { label: string; value: string; sub: React.ReactNode }) {
  return (
    <div className={card}>
      <p className="text-sm text-ink-3">{label}</p>
      <p className="mt-1.5 text-[40px] font-semibold leading-none tracking-[-0.02em] text-ink">{value}</p>
      <div className="mt-2 text-sm text-ink-2">{sub}</div>
    </div>
  );
}

function TrustTab({ trust, busy, onAction }: { trust: Trust; busy: boolean; onAction: (a: "reset_lab" | "reset_field" | "simulate") => void }) {
  const cur = trust.current;
  if (!cur) return <p className="px-8 py-8 text-ink-3">No calibration yet.</p>;
  const ok = cur.monitor_coverage >= 0.9;
  return (
    <div className="px-4 pt-8 lg:px-8">
      <h2 className="text-[34px] font-semibold tracking-[-0.03em] text-ink">Is the shortlist keeping its promise?</h2>
      <p className="mt-1.5 max-w-3xl text-base text-ink-2">
        Coverage: how often the right disease is in the shortlist, measured on a fixed set of field photos that are never
        used for fitting. Each random-audit answer recalibrates the assistant at once.
      </p>
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Coverage now" value={`${(cur.monitor_coverage * 100).toFixed(1)}%`}
          sub={<span className={`flex items-center gap-1.5 font-semibold ${ok ? "text-ok" : "text-soon"}`}>
            {ok ? <CircleCheck className="h-4 w-4" aria-hidden="true" /> : <CircleAlert className="h-4 w-4" aria-hidden="true" />}
            {ok ? "At or above the 90% target" : "Below the 90% target"}
          </span>} />
        <Stat label="Answered alone" value={pctOf(cur.monitor_answered)} sub="of photos, one disease left" />
        <Stat label="Average shortlist" value={cur.monitor_set_size.toFixed(2)} sub="diseases" />
        <Stat label="Field labels used" value={String(cur.n_field_points)} sub={`of ${cur.n_points} calibration photos`} />
      </div>
      {cur.n_field_points === 0 && (
        <p className="mt-4 rounded-2xl bg-urgent-soft px-4 py-3 text-sm font-semibold text-urgent">Calibrated on lab photos only: the 90% promise isn&apos;t valid for farm photos.</p>
      )}
      {cur.n_field_points > 0 && cur.n_field_points < 9 && (
        <p className="mt-4 rounded-2xl bg-soon-soft px-4 py-3 text-sm font-semibold text-soon">Fewer than 9 field labels: no safe threshold yet, so every disease stays possible.</p>
      )}
      <div className={`mt-4 ${card} p-6`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-lg font-semibold text-ink">Coverage since the last reset</p>
          <div className="flex gap-[18px] text-sm text-ink-2">
            <span className="flex items-center gap-1.5"><span className="h-[3px] w-[18px] rounded-sm bg-ink" />Coverage</span>
            <span className="flex items-center gap-1.5"><span className="w-[18px] border-t-2 border-dashed border-ink-3" />90% target</span>
          </div>
        </div>
        <TrustChart runs={trust.since_reset} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <span className="mr-1.5 text-sm font-semibold text-ink-3">Demo</span>
        <button type="button" disabled={busy} onClick={() => onAction("reset_lab")}
          className="flex h-11 items-center gap-1.5 rounded-full border border-border px-4 font-semibold text-ink hover:bg-surface-2 disabled:opacity-50">
          <FlaskConical className="h-4 w-4" aria-hidden="true" />Reset to lab photos only
        </button>
        <button type="button" disabled={busy} onClick={() => onAction("simulate")}
          className="flex h-11 items-center gap-1.5 rounded-full border border-border px-4 font-semibold text-ink hover:bg-surface-2 disabled:opacity-50">
          <Plus className="h-4 w-4" aria-hidden="true" />Add 10 expert labels
        </button>
        <button type="button" disabled={busy} onClick={() => onAction("reset_field")}
          className="flex h-11 items-center gap-1.5 rounded-full border border-border px-4 font-semibold text-ink hover:bg-surface-2 disabled:opacity-50">
          <RotateCcw className="h-4 w-4" aria-hidden="true" />Reset to normal calibration
        </button>
      </div>
    </div>
  );
}

/* ---------------- Answered ---------------- */

function AnsweredTab({ data }: { data: Answered }) {
  return (
    <div className="px-4 pt-8 lg:px-8">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Labels for the next retraining" value={String(data.retraining_pool)} sub="every expert answer" />
        <Stat label="Random audits checked" value={String(data.audits)} sub="a fair sample of answered photos" />
        <Stat label="Assistant right on audits" value={data.audit_accuracy == null ? "–" : pctOf(data.audit_accuracy)} sub="unbiased live estimate" />
      </div>
      <div className="mt-4 overflow-x-auto rounded-[22px] border border-border bg-surface">
        <table className="w-full min-w-[760px] text-left text-[15px]">
          <thead className="text-[13px] font-semibold text-ink-3">
            <tr className="border-b border-border">
              <th className="px-5 py-3.5 font-semibold">Photo</th><th className="py-3.5 pr-4 font-semibold">Check</th>
              <th className="py-3.5 pr-4 font-semibold">Model said</th><th className="py-3.5 pr-4 font-semibold">Expert said</th>
              <th className="py-3.5 pr-4 font-semibold">Note</th><th className="py-3.5 pr-5 text-right font-semibold">When</th>
            </tr>
          </thead>
          <tbody>
            {data.cases.map((r) => {
              const expert = r.expert?.label === "other" ? "Something else" : r.expert?.label === "unusable" ? "Needs a better photo" : short(r.expert?.name, r.crop);
              return (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-2.5">
                    {r.image ? <img src={imageUrl(r.image)} alt="" className="h-12 w-12 rounded-[10px] object-cover" /> : <span className="block h-12 w-12 rounded-[10px] bg-surface-2" />}
                  </td>
                  <td className="py-2.5 pr-4 font-semibold text-ink">#{r.id}<span className="block text-[13px] font-medium text-ink-3">{cap(r.crop)}{r.audit ? " · audit" : ""}</span></td>
                  <td className="py-2.5 pr-4 text-ink-2">{r.assistant ? short(r.assistant.name, r.crop) : "Sent to expert"}</td>
                  <td className="py-2.5 pr-4 font-semibold text-ink">
                    {expert}
                    {r.assistant && <span className={`ml-2 text-xs font-bold ${r.agree ? "text-ok" : "text-urgent"}`}>{r.agree ? "✓ agrees" : "✗ differs"}</span>}
                  </td>
                  <td className="max-w-[240px] truncate py-2.5 pr-4 text-ink-2" title={r.note}>{r.note || "–"}</td>
                  <td className="whitespace-nowrap py-2.5 pr-5 text-right text-ink-3">{when(r.answered_at)}</td>
                </tr>
              );
            })}
            {data.cases.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-ink-3">No expert answers yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- The dashboard ---------------- */

export default function ExpertDashboard() {
  const [tab, setTab] = useState<Tab>("queue");
  const [queue, setQueue] = useState<QueueItem[] | null>(null);
  const [trust, setTrust] = useState<Trust | null>(null);
  const [answered, setAnswered] = useState<Answered | null>(null);
  const [selected, setSelected] = useState<number | undefined>();
  const [needKey, setNeedKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handle = (e: unknown) => {
    if (e instanceof ApiError && e.status === 401) {
      setNeedKey(true);
      setError(expertKey() ? "That key didn't work." : null);
    } else setError(e instanceof ApiError ? e.message : "Something went wrong.");
  };

  const refresh = useCallback(async () => {
    try {
      const [q, t, a] = await Promise.all([api.queue(), api.trust(), api.answered()]);
      setQueue(q);
      setTrust(t);
      setAnswered(a);
      setNeedKey(false);
      setError(null);
    } catch (e) {
      handle(e);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(refresh, 0);           // load right away
    return () => clearTimeout(first);
  }, [refresh]);
  // Then every 20 s while the tab is on screen, and not while the sign-in form is showing (it would only get 401s).
  useVisiblePoll(refresh, 20000, !needKey);

  const calibrate = async (action: "reset_lab" | "reset_field" | "simulate") => {
    setBusy(true);
    try {
      setTrust(await api.calibration(action, 10));
    } catch (e) {
      handle(e);
    } finally {
      setBusy(false);
    }
  };

  if (needKey) return <KeyGate error={error} onDone={refresh} />;

  // The case on the right: the one picked, else the oldest waiting.
  const current = queue?.find((q) => q.id === selected) ?? queue?.[0];
  const tabs: { id: Tab; label: string }[] = [
    { id: "queue", label: "Queue" },
    { id: "trust", label: "Trust meter" },
    { id: "answered", label: "Answered" },
  ];

  return (
    <div className="mx-auto max-w-[1280px]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 lg:px-8">
        <div className="flex flex-wrap items-center gap-4 lg:gap-7">
          <Link href="/" className="flex items-center gap-2.5 text-lg font-bold text-ink hover:text-ink">
            <Mark size={32} corners={false} />
            <span>Crop Doctor <span className="font-medium text-ink-3">· Experts</span></span>
          </Link>
          <div role="tablist" aria-label="Dashboard sections" className="flex gap-1 rounded-full bg-surface-2 p-1">
            {tabs.map((t) => {
              const on = tab === t.id;
              return (
                <button key={t.id} role="tab" aria-selected={on} onClick={() => setTab(t.id)}
                  className={`flex h-10 items-center gap-2 rounded-full px-4 font-semibold lg:px-[18px] ${on ? "bg-surface text-ink shadow-float" : "text-ink-2 hover:text-ink"}`}>
                  {t.label}
                  {t.id === "queue" && queue && queue.length > 0 && (
                    <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-expert-solid px-1.5 text-xs text-on-expert">{queue.length}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-2 text-ink-2">
          <ThemeToggle />
          <button type="button" onClick={() => {
            try {
              localStorage.removeItem("cd_expert_key");
            } catch {}
            setError(null);
            setNeedKey(true);
          }} className="flex h-12 items-center gap-1.5 rounded-full px-3 font-semibold hover:bg-surface-2 hover:text-ink">
            <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />Sign out
          </button>
        </div>
      </div>

      {toast && (
        <p role="status" className="mx-4 mt-4 flex items-center gap-2 rounded-2xl bg-ok-soft px-4 py-3 text-sm font-semibold text-ok lg:mx-8">
          <CircleCheck className="h-4 w-4 shrink-0" aria-hidden="true" />{toast}
        </p>
      )}
      {error && <p role="alert" className="mx-4 mt-4 rounded-2xl bg-urgent-soft px-4 py-3 text-sm text-urgent lg:mx-8">{error}</p>}

      {tab === "queue" && (
        !queue ? <p className="px-8 py-8 text-ink-3">Loading…</p>
          : queue.length === 0 || !current ? (
            <div className="mx-4 mt-8 rounded-[22px] border border-dashed border-border p-10 text-center lg:mx-8">
              <CircleCheck className="mx-auto h-8 w-8 text-ok" aria-hidden="true" />
              <p className="mt-3 text-lg font-semibold text-ink">No photos waiting</p>
              <p className="mt-1 text-ink-2">Unclear photos from farmers, and random audits, will appear here.</p>
            </div>
          ) : (
            <div className="grid min-h-[720px] lg:grid-cols-[300px_minmax(0,1fr)]">
              <QueueList items={queue} selected={current.id} onSelect={setSelected} />
              <CaseDetail key={current.id} item={current}
                onAnswered={(m) => { setToast(m); setSelected(undefined); refresh(); }} />
            </div>
          )
      )}

      {tab === "trust" && (trust ? <TrustTab trust={trust} busy={busy} onAction={calibrate} /> : <p className="px-8 py-8 text-ink-3">Loading…</p>)}
      {tab === "answered" && (answered ? <AnsweredTab data={answered} /> : <p className="px-8 py-8 text-ink-3">Loading…</p>)}
    </div>
  );
}
