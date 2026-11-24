"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { recentClaudeDrafts } from "@/app/actions";
import { buildClaudePrompt, imageMime, promptSummary } from "@/lib/claude-prompt";
import { Icon, PlatformIcon, type IconName } from "./icons";
import { Callout, Panel } from "./ui";
import { CONTENT_TYPES, PLATFORMS, contentTypeLabel, fmtDate, platformLabel, type GroupTarget, type Platform } from "@/lib/platforms";

export type Draft = { id: string; title: string | null; master_text: string; created_at: string; post_variants: { id: string; platform: Platform }[] };

const QUICK_STARTS = [
  "A practical tip about automating a business task with n8n",
  "A result from a recent client project, with the numbers",
  "Announce something new I built this week",
  "My honest opinion on a current AI trend",
];
const TONES = [
  ["rules", "Follow my platform rules"], ["professional", "Professional"], ["friendly", "Friendly"],
  ["bold and confident", "Bold"], ["storytelling", "Storytelling"],
] as const;
const LANGUAGES = ["English", "Urdu", "Roman Urdu"];
const WAIT_MINUTES = 15;

const TIPS: { icon: IconName; title: string; text: string }[] = [
  { icon: "hash", title: "Be specific", text: "Numbers, names and results beat general claims: \"reply time from 2 hours to 2 minutes\"." },
  { icon: "users", title: "Say who it is for", text: "\"For clinic owners\" or \"for n8n beginners\" helps Claude pick the right words and examples." },
  { icon: "send", title: "One clear next step", text: "Ask for one action: comment a word, send a message, or open the link." },
  { icon: "image", title: "Add an image", text: "Instagram needs one, and posts with an image get more reach everywhere else too." },
  { icon: "check", title: "Check every preview", text: "Claude fits each platform; you have the final say on the draft page before publishing." },
];

function Field({ id, label, hint, className = "", children }: { id: string; label: ReactNode; hint?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={className}>
      <label className="label" htmlFor={id}>{label}</label>
      {children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

function DraftRow({ d, fresh }: { d: Draft; fresh?: boolean }) {
  return (
    <li className={`flex items-center gap-3 px-6 py-3 ${fresh ? "bg-emerald-50/50" : ""}`}>
      <div className="flex -space-x-1.5">
        {d.post_variants.slice(0, 4).map((v) => <PlatformIcon key={v.id} platform={v.platform} size={22} rounded="rounded-full" className="ring-2 ring-white" />)}
        {d.post_variants.length > 4 && (
          <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-slate-100 text-[9px] font-semibold text-slate-600 ring-2 ring-white">+{d.post_variants.length - 4}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-slate-900">{d.title || d.master_text.slice(0, 60)}</div>
        <div className="text-[11px] text-slate-500">{fresh && <span className="font-semibold text-emerald-700">New · </span>}{fmtDate(d.created_at)}</div>
      </div>
      <Link href={`/posts/${d.id}`} className={fresh ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>Open</Link>
    </li>
  );
}

export default function ClaudeDraft({ groups, recent, prefill }: {
  groups: GroupTarget[]; recent: Draft[]; prefill: { topic: string; type: string; platforms: Platform[] };
}) {
  const [topic, setTopic] = useState(prefill.topic);
  const [details, setDetails] = useState("");
  const [picked, setPicked] = useState<Platform[]>(prefill.platforms.length ? prefill.platforms : ["facebook", "instagram", "threads", "linkedin", "x"]);
  const [targets, setTargets] = useState<string[]>([]);
  const [ctype, setCtype] = useState(CONTENT_TYPES.includes(prefill.type) ? prefill.type : "auto");
  const [tone, setTone] = useState("rules");
  const [language, setLanguage] = useState("English");
  const [link, setLink] = useState("");
  const [image, setImage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [opened, setOpened] = useState(false);
  const [waitingSince, setWaitingSince] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Draft[]>([]);

  const ordered = PLATFORMS.map((p) => p.id).filter((p) => picked.includes(p));
  const chosenTargets = groups.filter((g) => picked.includes(g.platform) && targets.includes(g.id));
  const request = { topic, details, platforms: ordered, targets: chosenTargets, contentType: ctype, tone, language, link, image };
  const prompt = useMemo(() => buildClaudePrompt(request),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [topic, details, ordered.join(), chosenTargets.map((g) => g.id).join(), ctype, tone, language, link, image]);
  const summary = promptSummary(request);
  const missingTarget = (["reddit", "facebook_group"] as Platform[]).filter((p) => picked.includes(p) && !chosenTargets.some((g) => g.platform === p));
  const freshIds = new Set(fresh.map((d) => d.id));
  const earlier = recent.filter((d) => !freshIds.has(d.id));

  const toggle = (p: Platform) => setPicked((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]));
  const toggleTarget = (id: string) => setTargets((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  // Poll for drafts Claude saves through the connector, for a few minutes after opening Claude
  useEffect(() => {
    if (!waitingSince) return;
    const started = Date.now();
    let alive = true;
    const tick = async () => {
      const r = await recentClaudeDrafts(waitingSince);
      if (!alive) return;
      if (r.ok) setFresh(r.posts);
      if (Date.now() - started > WAIT_MINUTES * 60_000) setWaitingSince(null);
    };
    tick();
    const t = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(t); };
  }, [waitingSince]);

  function validate() {
    if (!topic.trim()) return "Describe what the post is about.";
    if (!ordered.length) return "Pick at least one platform.";
    if (link.trim() && !/^https?:\/\/\S+$/i.test(link.trim())) return "The link must start with http:// or https://";
    if (image.trim() && (!/^https:\/\/\S+$/i.test(image.trim()) || !imageMime(image.trim()))) {
      return "The image link must be a public https link ending in .jpg, .png or .webp (or add the image in the dashboard later).";
    }
    return null;
  }

  async function copyPrompt() {
    try { await navigator.clipboard.writeText(prompt); setCopied(true); setTimeout(() => setCopied(false), 2000); return true; }
    catch { return false; }
  }

  async function openClaude() {
    const problem = validate();
    setError(problem);
    if (problem) return;
    await copyPrompt();
    window.open(`https://claude.ai/new?q=${encodeURIComponent(prompt)}`, "_blank", "noopener");
    setOpened(true);
    if (!waitingSince) setWaitingSince(new Date(Date.now() - 60_000).toISOString());
  }

  // Progress: 1 describe, 2 send to Claude, 3 Claude writes, 4 review
  const stage = fresh.length ? 4 : opened ? 3 : topic.trim() ? 2 : 1;
  const STEPS: { title: string; text: string }[] = [
    { title: "Describe", text: "What the post is about" },
    { title: "Send to Claude", text: "Open in Claude, then send" },
    { title: "Claude writes", text: "One version per platform" },
    { title: "Review drafts", text: "Open them and check each preview" },
  ];

  return (
    <div className="space-y-5">
      {/* Progress tracker */}
      <ol className="grid gap-px overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-200/80 shadow-[0_1px_2px_rgba(18,19,22,0.03)] sm:grid-cols-2 xl:grid-cols-4" aria-label="Progress">
        {STEPS.map((s, i) => {
          const n = i + 1;
          const done = n < stage;
          const now = n === stage;
          return (
            <li key={s.title} className={`flex items-center gap-3 px-5 py-4 ${now ? "bg-white" : "bg-slate-50/80"}`} aria-current={now ? "step" : undefined}>
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition ${
                done ? "bg-emerald-500 text-white" : now ? (n === 3 ? "bg-clay-500 text-white" : "bg-slate-900 text-white") : "bg-white text-slate-400 ring-1 ring-inset ring-slate-200"}`}>
                {done ? <Icon name="check" size={14} strokeWidth={3} /> : n === 3 && now ? <Icon name="sparkles" size={14} /> : n}
              </span>
              <span className="min-w-0">
                <span className={`block text-[13.5px] font-semibold ${now ? "text-slate-900" : done ? "text-slate-700" : "text-slate-400"}`}>{s.title}</span>
                <span className={`block truncate text-xs ${now ? "text-slate-500" : "text-slate-400"}`}>
                  {n === 3 && now && waitingSince ? "Waiting for Claude to save..." : n === 4 && now ? `${fresh.length} draft${fresh.length === 1 ? "" : "s"} ready` : s.text}
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px] 2xl:grid-cols-[minmax(0,1fr)_440px]">
        {/* Request */}
        <section className="card flex flex-col p-6 sm:p-7">
          <div className="mb-6">
            <div className="eyebrow">Your request</div>
            <h3 className="mt-1 text-lg font-semibold tracking-[-0.01em] text-slate-900">What should Claude write?</h3>
            <p className="mt-1 text-[13px] text-slate-500">Claude writes a separate version for every platform you pick, following your platform rules, and saves them as drafts here.</p>
          </div>

          <div className="flex-1 space-y-5">
            <Field id="cd-topic" label="What's the post about?">
              <textarea id="cd-topic" className="input min-h-28 leading-relaxed" value={topic} onChange={(e) => setTopic(e.target.value)}
                placeholder="For example: how I automated WhatsApp replies for a clinic with n8n, and what it saved them" />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {QUICK_STARTS.map((q) => (
                  <button key={q} type="button" onClick={() => setTopic(q)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
                    {q}
                  </button>
                ))}
              </div>
            </Field>

            <Field id="cd-details" label={<>Details to include <span className="font-normal text-slate-400">(optional)</span></>}
              hint="Facts, numbers, names, a call to action. The more specific, the better the posts.">
              <textarea id="cd-details" className="input min-h-20 leading-relaxed" value={details} onChange={(e) => setDetails(e.target.value)}
                placeholder="Cut reply time from 2 hours to 2 minutes. 300 messages a day. Ask readers to comment AUTOMATE for the template." />
            </Field>

            <div>
              <span className="label">Platforms</span>
              <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-4">
                {PLATFORMS.map((p) => {
                  const on = picked.includes(p.id);
                  return (
                    <button key={p.id} type="button" onClick={() => toggle(p.id)} aria-pressed={on}
                      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-[13px] font-medium transition ${on ? "border-slate-900 bg-white text-slate-900 shadow-[0_2px_6px_rgba(18,19,22,0.06)]" : "border-slate-200 bg-slate-50/60 text-slate-500 hover:border-slate-300"}`}>
                      <PlatformIcon platform={p.id} size={24} rounded="rounded-lg" className={on ? "" : "opacity-50 grayscale-[40%]"} />
                      <span className="flex-1 truncate">{p.label}</span>
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"}`}>
                        {on && <Icon name="check" size={9} strokeWidth={3.5} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {(picked.includes("reddit") || picked.includes("facebook_group")) && (
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="mb-2 text-[13px] font-semibold text-slate-800">Groups and subreddits</div>
                {!groups.some((g) => picked.includes(g.platform)) ? (
                  <p className="text-[13px] text-slate-500">None saved yet. Add them in <Link href="/settings?tab=groups" className="font-medium text-brand-700 hover:underline">Settings</Link>, or pick the target on the draft later.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {groups.filter((g) => picked.includes(g.platform)).map((g) => {
                      const on = targets.includes(g.id);
                      return (
                        <button key={g.id} type="button" onClick={() => toggleTarget(g.id)} aria-pressed={on}
                          className={`flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-[13px] transition ${on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}>
                          <PlatformIcon platform={g.platform} size={20} rounded="rounded-full" />
                          {g.platform === "reddit" ? `r/${g.subreddit}` : g.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-3">
              <Field id="cd-type" label="Content type">
                <select id="cd-type" className="input" value={ctype} onChange={(e) => setCtype(e.target.value)}>
                  <option value="auto">Let Claude choose</option>
                  {CONTENT_TYPES.map((t) => <option key={t} value={t}>{contentTypeLabel(t)}</option>)}
                </select>
              </Field>
              <Field id="cd-tone" label="Tone">
                <select id="cd-tone" className="input" value={tone} onChange={(e) => setTone(e.target.value)}>
                  {TONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
              <Field id="cd-lang" label="Language">
                <select id="cd-lang" className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
                  {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
                </select>
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field id="cd-link" label={<>Link <span className="font-normal text-slate-400">(optional)</span></>}>
                <div className="relative">
                  <Icon name="link" size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input id="cd-link" className="input pl-9" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" />
                </div>
              </Field>
              <Field id="cd-image" label={<>Image link <span className="font-normal text-slate-400">(optional)</span></>} hint="A public .jpg link. Or add the image to the draft afterwards.">
                <div className="relative">
                  <Icon name="image" size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input id="cd-image" className="input pl-9" value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://.../photo.jpg" />
                </div>
              </Field>
            </div>

            {missingTarget.length > 0 && (
              <Callout tone="info">
                {missingTarget.map(platformLabel).join(" and ")}: no {missingTarget.length > 1 ? "targets" : "target"} picked. Claude still writes {missingTarget.length > 1 ? "them" : "it"}; choose the group or subreddit on the draft before posting.
              </Callout>
            )}
            {error && <Callout tone="danger" onClose={() => setError(null)}>{error}</Callout>}
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
            <p className="text-xs text-slate-500">Uses your Claude subscription and the Social Hub connector. Nothing is published.</p>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" onClick={async () => { const p = validate(); setError(p); if (!p) await copyPrompt(); }}>
                <Icon name={copied ? "check" : "copy"} size={15} /> {copied ? "Copied" : "Copy prompt"}
              </button>
              <button type="button" className="btn-ai" onClick={openClaude}>
                <Icon name="sparkles" size={15} /> {opened ? "Open in Claude again" : "Open in Claude"}
              </button>
            </div>
          </div>
        </section>

        {/* Side column: what happens, drafts, tips */}
        <aside className="flex min-w-0 flex-col gap-5">
          <Panel title="What Claude will do" desc="Built from your choices, updated as you type.">
            <ul className="space-y-2.5 px-6 py-5">
              {summary.map((s) => (
                <li key={s} className="flex items-start gap-2.5 text-[13px] text-slate-700">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-clay-50 text-clay-600"><Icon name="check" size={10} strokeWidth={3} /></span>
                  {s}
                </li>
              ))}
            </ul>
            <details className="group border-t border-slate-100">
              <summary className="flex items-center gap-2 px-6 py-3 text-xs font-medium text-slate-500 hover:text-slate-800">
                <Icon name="chevronRight" size={14} className="transition group-open:rotate-90" /> View the full prompt
              </summary>
              <pre className="mx-6 mb-5 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3.5 font-mono text-[11.5px] leading-relaxed text-slate-700 ring-1 ring-inset ring-slate-200">{prompt}</pre>
            </details>
          </Panel>

          <Panel
            title="Drafts from Claude"
            desc={waitingSince ? "Checking every 5 seconds" : "New drafts appear here automatically"}
            action={waitingSince
              ? <span className="flex items-center gap-1.5 text-xs font-medium text-clay-700"><span className="h-2 w-2 animate-pulse rounded-full bg-clay-500" /> Live</span>
              : fresh.length ? <span className="chip bg-emerald-50 text-emerald-700">{fresh.length} new</span> : null}>
            {waitingSince && !fresh.length && (
              <div className="flex items-center gap-3 border-b border-slate-100 bg-clay-50/40 px-6 py-4">
                <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-clay-600 ring-1 ring-clay-100">
                  <span className="absolute inset-0 animate-ping rounded-full bg-clay-200/50" />
                  <Icon name="sparkles" size={16} className="relative" />
                </span>
                <div className="min-w-0 flex-1 text-xs leading-relaxed text-slate-600">
                  <span className="block text-[13px] font-semibold text-slate-900">Waiting for Claude...</span>
                  Send the message in the Claude tab. Empty message box? Press Ctrl+V, then send.
                </div>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setWaitingSince(null)}>Stop</button>
              </div>
            )}
            {fresh.length > 0 || earlier.length > 0 ? (
              <ul className="divide-y divide-slate-100">
                {fresh.map((d) => <DraftRow key={d.id} d={d} fresh />)}
                {earlier.slice(0, Math.max(0, 4 - fresh.length)).map((d) => <DraftRow key={d.id} d={d} />)}
              </ul>
            ) : !waitingSince && (
              <div className="flex items-center gap-3 px-6 py-5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400"><Icon name="inbox" size={16} /></span>
                <p className="text-xs leading-relaxed text-slate-500">No drafts from Claude yet. After you send the message, they show up here within seconds.</p>
              </div>
            )}
          </Panel>

          <Panel className="flex-1" title="Write better posts" desc="Five things that make Claude's drafts stand out." bodyClass="flex flex-col">
            <ul className="flex h-full flex-col divide-y divide-slate-100">
              {TIPS.map((t) => (
                <li key={t.title} className="flex flex-1 items-center gap-3 px-6 py-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600"><Icon name={t.icon} size={15} /></span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-slate-900">{t.title}</span>
                    <span className="block text-xs leading-relaxed text-slate-500">{t.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
