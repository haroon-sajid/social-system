"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { addExternalMedia, createPost, insertVariants } from "@/app/actions";
import { uploadMedia } from "@/lib/media";
import Preview from "./Preview";
import FitBox from "./FitBox";
import { Icon, PlatformIcon } from "./icons";
import { Callout, PageHeader } from "./ui";
import {
  CONTENT_TYPES, MODE_HINT, PLATFORMS, charCount, composeFull, contentTypeLabel, platformLabel, platformMode, validate,
  type Account, type GroupTarget, type Media, type Platform, type Rule, type Variant,
} from "@/lib/platforms";

export type Prefill = {
  title: string; text: string; topic: string; type: string; tags: string; hashtags: string; link: string;
  platforms: Platform[]; media: string[];
};
type Override = { custom: boolean; body: string; hashtags: string; link: string; title: string };
type UrlMedia = { url: string; mime: string };

const DEFAULT_PLATFORMS: Platform[] = ["facebook", "instagram", "threads", "linkedin", "x"];
const parseTags = (s: string) => s.split(/[\s,]+/).map((t) => t.replace(/^#/, "").trim()).filter(Boolean);
const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", mp4: "video/mp4", mov: "video/quicktime" };
const mimeFromUrl = (url: string) => MIME[url.split(/[?#]/)[0].split(".").pop()?.toLowerCase() ?? ""] ?? null;
const isTarget = (p: Platform) => p === "reddit" || p === "facebook_group";

function Step({ n, title, desc, right, footer, children }: {
  n: number; title: string; desc?: string; right?: ReactNode; footer?: ReactNode; children: ReactNode;
}) {
  return (
    <section className="card flex flex-1 flex-col p-6 sm:p-7" role="tabpanel">
      <div className="mb-6 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="eyebrow">Step {n} of 5</div>
          <h3 className="mt-1 text-lg font-semibold tracking-[-0.01em] text-slate-900">{title}</h3>
          {desc && <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{desc}</p>}
        </div>
        {right}
      </div>
      <div className="flex-1">{children}</div>
      {footer && <div className="mt-7 flex items-center justify-between gap-3 border-t border-slate-100 pt-5">{footer}</div>}
    </section>
  );
}

// Shown in the preview until there is real text, so the preview never looks empty
const SAMPLE_TEXT = "This is a sample post, so you can see how it will look.\n\nStart typing in Main text, or let Claude fill in every field, and your real post appears here.";
const SAMPLE_TAGS = ["socialhub", "automation"];
const SAMPLE_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='1000' viewBox='0 0 1200 1000'>" +
  "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#5E9BFF'/><stop offset='.55' stop-color='#2068E5'/><stop offset='1' stop-color='#142854'/></linearGradient>" +
  "<radialGradient id='o' cx='.85' cy='.12' r='.55'><stop offset='0' stop-color='#FFA94D' stop-opacity='.85'/><stop offset='1' stop-color='#FFA94D' stop-opacity='0'/></radialGradient></defs>" +
  "<rect width='1200' height='1000' fill='url(#g)'/><rect width='1200' height='1000' fill='url(#o)'/>" +
  "<circle cx='170' cy='870' r='270' fill='#fff' fill-opacity='.06'/><circle cx='1060' cy='830' r='150' fill='#fff' fill-opacity='.08'/>" +
  "<g transform='translate(330 270)'><rect width='540' height='400' rx='40' fill='#fff' fill-opacity='.14' stroke='#fff' stroke-opacity='.4' stroke-width='3'/>" +
  "<circle cx='125' cy='130' r='48' fill='#fff' fill-opacity='.9'/><path d='M40 345 205 195l105 95 80-60 115 115z' fill='#fff' fill-opacity='.9'/></g>" +
  "<text x='600' y='790' text-anchor='middle' font-family='Segoe UI, system-ui, sans-serif' font-size='46' font-weight='600' fill='#fff' fill-opacity='.92'>Your image here</text></svg>",
)}`;
const SAMPLE_IMAGE: Media = { id: "sample", post_id: "new", public_url: SAMPLE_SVG, mime_type: "image/jpeg", storage_path: "sample", sort_order: 0 };

function Field({ id, label, hint, className = "", children }: { id: string; label: ReactNode; hint?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={className}>
      <label className="label" htmlFor={id}>{label}</label>
      {children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-[13px] font-medium text-slate-700">
      {label}
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${checked ? "bg-brand-600" : "bg-slate-300"}`}>
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
    </label>
  );
}

export default function ComposeForm({ groups, rules, accounts, prefill }: {
  groups: GroupTarget[]; rules: Rule[]; accounts: Account[]; prefill: Prefill;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(prefill.title);
  const [text, setText] = useState(prefill.text);
  const [topic, setTopic] = useState(prefill.topic);
  const [ctype, setCtype] = useState(CONTENT_TYPES.includes(prefill.type) ? prefill.type : "tip");
  const [tags, setTags] = useState(prefill.tags);
  const [hashtags, setHashtags] = useState(prefill.hashtags);
  const [link, setLink] = useState(prefill.link);
  const [picked, setPicked] = useState<Platform[]>(prefill.platforms.length ? prefill.platforms : DEFAULT_PLATFORMS);
  const [targets, setTargets] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [urlMedia, setUrlMedia] = useState<UrlMedia[]>(prefill.media.map((u) => ({ url: u, mime: mimeFromUrl(u) ?? "image/jpeg" })));
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Partial<Record<Platform, Override>>>({});
  const [active, setActive] = useState<Platform | undefined>(undefined);
  const [tab, setTab] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!expanded) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setExpanded(false); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [expanded]);
  const [error, setError] = useState<string | null>(null);

  const ordered = PLATFORMS.map((p) => p.id).filter((p) => picked.includes(p));
  const activeP = active && picked.includes(active) ? active : ordered[0];
  const ruleOf = (p: Platform) => rules.find((r) => r.platform === p);
  const toggle = (p: Platform) => setPicked((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]));
  const toggleTarget = (id: string) => setTargets((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  // Local previews of chosen files (object URLs), then media given as links
  const fileItems = useMemo(() => files.map((f) => ({ key: `${f.name}-${f.size}-${f.lastModified}`, file: f, url: URL.createObjectURL(f), video: f.type.startsWith("video/") })), [files]);
  useEffect(() => () => fileItems.forEach((x) => URL.revokeObjectURL(x.url)), [fileItems]);
  const localMedia: Media[] = [
    ...fileItems.map((x, i) => ({ id: `f${i}`, post_id: "new", public_url: x.url, mime_type: x.video ? x.file.type : "image/jpeg", storage_path: "local", sort_order: i })),
    ...urlMedia.map((m, i) => ({ id: `u${i}`, post_id: "new", public_url: m.url, mime_type: m.mime, storage_path: "external", sort_order: files.length + i })),
  ];
  const firstImage = localMedia.find((m) => m.mime_type.startsWith("image/"));

  // What each platform will actually get: the main fields, or that platform's own version
  const eff = (p: Platform) => {
    const o = overrides[p];
    const custom = !!o?.custom;
    return {
      custom,
      body: custom ? o!.body : text,
      hashtags: custom ? parseTags(o!.hashtags) : parseTags(hashtags).slice(0, ruleOf(p)?.max_hashtags ?? 0),
      link: p === "instagram" ? null : ((custom ? o!.link : link).trim() || null),
      title: p === "reddit" ? ((custom ? o!.title : title).trim() || null) : null,
    };
  };
  const mediaFor = (p: Platform) => (platformMode(p) === "api" && firstImage ? [firstImage] : []);
  const targetOf = (p: Platform) => groups.find((g) => g.platform === p && targets.includes(g.id));
  const variantFor = (p: Platform): Variant => {
    const e = eff(p);
    return {
      id: p, post_id: "new", platform: p, account_id: null, group_target_id: isTarget(p) ? targetOf(p)?.id ?? null : null,
      title: e.title, body: e.body, hashtags: e.hashtags, link_url: e.link, media_ids: mediaFor(p).map((m) => m.id),
      status: "draft", scheduled_at: null, published_at: null, platform_post_url: null, last_error: null, publish_attempts: 0, locked_at: null,
    };
  };
  const errorsFor = (p: Platform) => validate(variantFor(p), ruleOf(p), localMedia);
  const countFor = (p: Platform) => { const e = eff(p); return charCount(p, composeFull(p, e.body, e.hashtags, e.link)); };

  const setCustom = (p: Platform, on: boolean) => setOverrides((s) => {
    const e = eff(p);
    return { ...s, [p]: on
      ? { custom: true, body: e.body, hashtags: e.hashtags.join(" "), link: e.link ?? "", title: e.title ?? title }
      : { ...(s[p] ?? { body: "", hashtags: "", link: "", title: "" }), custom: false } };
  });
  const patch = (p: Platform, f: Partial<Override>) => setOverrides((s) => ({ ...s, [p]: { ...(s[p] as Override), ...f } }));

  const draftCount = picked.reduce((n, p) => n + (isTarget(p) ? Math.max(1, groups.filter((g) => g.platform === p && targets.includes(g.id)).length) : 1), 0);
  const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);

  function addUrl() {
    const url = urlInput.trim();
    setUrlError(null);
    if (!/^https:\/\/\S+$/i.test(url)) return setUrlError("Paste a full link that starts with https://");
    const mime = mimeFromUrl(url);
    if (!mime) return setUrlError("Use a direct link to a .jpg, .png, .webp, .mp4 or .mov file.");
    setUrlMedia((s) => [...s, { url, mime }]);
    setUrlInput("");
  }

  async function submit() {
    setError(null);
    if (!text.trim()) return setError("Write the main text first.");
    if (!picked.length) return setError("Pick at least one platform.");
    let postId: string | null = null;
    try {
      setBusy("Saving post...");
      const created = await createPost({ title: title || null, master_text: text, topic: topic || null, content_type: ctype, tags: tagList });
      if (!created.ok) throw new Error(created.error);
      postId = created.id;

      const saved: Media[] = [];
      const total = files.length + urlMedia.length;
      for (let i = 0; i < files.length; i++) {
        setBusy(`Uploading ${i + 1} of ${total}...`);
        saved.push(await uploadMedia(postId, files[i], i));
      }
      for (let i = 0; i < urlMedia.length; i++) {
        setBusy(`Adding media ${files.length + i + 1} of ${total}...`);
        const r = await addExternalMedia(postId, urlMedia[i].url, urlMedia[i].mime, files.length + i);
        if (!r.ok) throw new Error(r.error);
        saved.push(r.media);
      }
      const img = saved.find((m) => m.mime_type.startsWith("image/"));

      setBusy("Creating platform drafts...");
      const rows: Parameters<typeof insertVariants>[0] = [];
      for (const p of ordered) {
        const e = eff(p);
        // One click publish uses 1 image; manual platforms get none (you attach it yourself)
        const base = { post_id: postId, platform: p, body: e.body, title: e.title, hashtags: e.hashtags, link_url: e.link,
          media_ids: platformMode(p) === "api" && img ? [img.id] : [] };
        if (isTarget(p)) {
          const ts = groups.filter((g) => g.platform === p && targets.includes(g.id));
          if (ts.length) ts.forEach((g) => rows.push({ ...base, group_target_id: g.id }));
          else rows.push(base);
        } else rows.push(base);
      }
      const ok = await insertVariants(rows);
      if (!ok.ok) throw new Error(ok.error);
      router.push(`/posts/${postId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
      setError(postId ? `${msg}\nThe post was saved partly. Open it from Posts to fix or delete it.` : msg);
    } finally {
      setBusy(null);
    }
  }

  const createLabel = busy ?? `Create ${draftCount} draft${draftCount === 1 ? "" : "s"}`;
  const accountName = (p: Platform) => accounts.find((a) => a.platform === (p === "facebook_group" ? "facebook" : p))?.display_name ?? "Your account";
  const targetLabel = (g?: GroupTarget) => (g ? (g.platform === "reddit" ? `r/${g.subreddit}` : g.name) : undefined);

  // Tabs: one step at a time, each shows a short summary and a check once it is filled in
  const customCount = ordered.filter((p) => overrides[p]?.custom).length;
  const fixCount = ordered.filter((p) => errorsFor(p).length > 0).length;
  const STEPS = [
    { n: 1, label: "Details", done: !!title.trim(), info: title.trim() ? contentTypeLabel(ctype) : "Title, type, topic" },
    { n: 2, label: "Main text", done: !!text.trim(), info: text.trim() ? `${Array.from(text).length.toLocaleString()} characters` : "Required" },
    { n: 3, label: "Media", done: localMedia.length > 0, info: localMedia.length ? `${localMedia.length} file${localMedia.length === 1 ? "" : "s"}` : "Optional" },
    { n: 4, label: "Platforms", done: picked.length > 0, info: `${picked.length} selected` },
    { n: 5, label: "Versions", done: !!text.trim() && fixCount === 0, warn: !!text.trim() && fixCount > 0,
      info: customCount ? `${customCount} custom` : fixCount && text.trim() ? `${fixCount} to check` : "Per platform" },
  ];
  const go = (n: number) => {
    setTab(n);
    document.getElementById("compose-steps")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const nav = (
    <>
      <button type="button" className="btn-secondary" disabled={tab === 1} onClick={() => go(tab - 1)}>
        <Icon name="chevronLeft" size={15} /> Back
      </button>
      {tab < STEPS.length ? (
        <button type="button" className="btn-primary" onClick={() => go(tab + 1)}>
          Next: {STEPS[tab].label} <Icon name="chevronRight" size={15} />
        </button>
      ) : (
        <button type="button" className="btn-primary" onClick={submit} disabled={!!busy}><Icon name="check" size={15} strokeWidth={2.2} /> {createLabel}</button>
      )}
    </>
  );

  // Preview: a clearly marked sample until there is real text
  const sample = !text.trim();
  const pv = activeP ? (() => {
    const e = eff(activeP);
    const m = mediaFor(activeP);
    return {
      body: sample ? SAMPLE_TEXT : e.body,
      hashtags: sample && !e.hashtags.length ? SAMPLE_TAGS.slice(0, ruleOf(activeP)?.max_hashtags ?? 0) : e.hashtags,
      link: e.link,
      title: sample && !e.title && activeP === "reddit" ? "Your Reddit title appears here" : e.title,
      media: sample && !m.length ? [SAMPLE_IMAGE] : m,
    };
  })() : null;
  const previewNode = activeP && pv ? (
    <Preview platform={activeP} body={pv.body} hashtags={pv.hashtags} link={pv.link} title={pv.title} media={pv.media}
      accountName={accountName(activeP)}
      targetName={targetLabel(targetOf(activeP)) ?? (sample && isTarget(activeP) ? (activeP === "reddit" ? "r/yoursubreddit" : "Your group") : undefined)} />
  ) : null;

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/posts", label: "Posts" }]}
        title={<>Create a <strong>new post</strong></>}
        description="Fill in the details once. Each platform gets its own version with a live preview."
        actions={
          <>
            <Link href="/settings?tab=claude" className="btn-secondary"><Icon name="sparkles" size={15} className="text-clay-500" /> Let Claude fill this</Link>
            <button className="btn-primary" onClick={submit} disabled={!!busy}><Icon name="check" size={15} strokeWidth={2.2} /> {createLabel}</button>
          </>
        }
      />

      {error && <Callout tone="danger" className="mb-5" onClose={() => setError(null)}>{error}</Callout>}

      {/* The form decides the row height; the preview panel fills exactly that height (it never stretches the form) */}
      <div className="grid gap-5 xl:min-h-[600px] xl:grid-cols-[minmax(0,1fr)_400px] 2xl:grid-cols-[minmax(0,1fr)_440px]">
        <div id="compose-steps" className="flex min-w-0 scroll-mt-20 flex-col gap-5 lg:scroll-mt-6">
          <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-[0_1px_2px_rgba(18,19,22,0.03)]"
            role="tablist" aria-label="Compose steps">
            {STEPS.map((s) => {
              const on = s.n === tab;
              return (
                <button key={s.n} type="button" role="tab" aria-selected={on} onClick={() => setTab(s.n)}
                  className={`flex min-w-[136px] flex-1 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition ${on ? "bg-slate-900 text-white shadow-[0_2px_6px_rgba(18,19,22,0.2)]" : "text-slate-600 hover:bg-slate-50"}`}>
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${on ? "bg-white text-slate-900" : s.done ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500"}`}>
                    {s.done && !on ? <Icon name="check" size={12} strokeWidth={3} /> : s.n}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                      {s.label}{s.warn && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title="Some platforms need a fix" />}
                    </span>
                    <span className={`block truncate text-[11px] ${on ? "text-white/60" : "text-slate-400"}`}>{s.info}</span>
                  </span>
                </button>
              );
            })}
          </nav>

          {/* 1. Details */}
          {tab === 1 && (
          <Step n={1} footer={nav} title="Post details" desc="Used to find and organise your posts. The title is also used as the Reddit title.">
            <div className="grid gap-4 md:grid-cols-2">
              <Field id="c-title" label="Title" className="md:col-span-2">
                <input id="c-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="For example: How I automated WhatsApp replies with n8n" />
              </Field>
              <Field id="c-type" label="Content type">
                <select id="c-type" className="input" value={ctype} onChange={(e) => setCtype(e.target.value)}>
                  {CONTENT_TYPES.map((t) => <option key={t} value={t}>{contentTypeLabel(t)}</option>)}
                </select>
              </Field>
              <Field id="c-topic" label="Topic">
                <input id="c-topic" className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="For example: n8n automation" />
              </Field>
              <Field id="c-tags" label="Internal tags" hint="Comma separated. Only you see these." className="md:col-span-2">
                <input id="c-tags" className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="campaign-q1, automation, client-story" />
              </Field>
            </div>
          </Step>
          )}

          {/* 2. Main text */}
          {tab === 2 && (
          <Step n={2} footer={nav} title="Main text" desc="The starting text for every platform. Hashtags and the link are added per platform automatically."
            right={<span className="chip">{Array.from(text).length.toLocaleString()} characters</span>}>
            <textarea id="c-text" aria-label="Main text" className="input min-h-56 resize-y leading-relaxed" value={text} onChange={(e) => setText(e.target.value)}
              placeholder="Write or paste your post..." />
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field id="c-hashtags" label="Hashtags" hint="Each platform keeps only as many as it allows.">
                <div className="relative">
                  <Icon name="hash" size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input id="c-hashtags" className="input pl-9" value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="automation n8n ai" />
                </div>
              </Field>
              <Field id="c-link" label="Link" hint="Not used on Instagram, where links are not clickable.">
                <div className="relative">
                  <Icon name="link" size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input id="c-link" className="input pl-9" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" />
                </div>
              </Field>
            </div>
          </Step>
          )}

          {/* 3. Media */}
          {tab === 3 && (
          <Step n={3} footer={nav} title="Media" desc="The first image goes to Facebook, Instagram, Threads and LinkedIn. Uploaded images become JPEG automatically; videos are posted by hand.">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 px-6 py-7 text-center transition hover:border-brand-300 hover:bg-brand-50/40">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-brand-600 shadow-sm ring-1 ring-slate-200"><Icon name="upload" size={18} /></span>
                <span className="mt-3 text-[13px] font-medium text-slate-800">Upload images or video</span>
                <span className="mt-0.5 text-xs text-slate-500">JPEG, PNG, WebP, MP4 or MOV</span>
                <input type="file" multiple hidden accept="image/*,video/mp4,video/quicktime"
                  onChange={(e) => { setFiles((s) => [...s, ...Array.from(e.target.files ?? [])]); e.target.value = ""; }} />
              </label>
              <div className="flex flex-col justify-center rounded-2xl border border-slate-200 p-4">
                <label className="label" htmlFor="c-url">Or add by link</label>
                <div className="flex gap-2">
                  <input id="c-url" className="input" value={urlInput} onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUrl(); } }} placeholder="https://.../image.jpg" />
                  <button type="button" className="btn-secondary shrink-0" onClick={addUrl}><Icon name="plus" size={14} /> Add</button>
                </div>
                <p className={`hint ${urlError ? "text-rose-600" : ""}`}>{urlError ?? "A public link to the file itself. Instagram needs a .jpg."}</p>
              </div>
            </div>
            {localMedia.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-5 2xl:grid-cols-6">
                {localMedia.map((m, i) => {
                  const isFile = m.id.startsWith("f");
                  const idx = Number(m.id.slice(1));
                  return (
                    <div key={m.id} className="group relative aspect-square overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
                      {m.mime_type.startsWith("video/") ? (
                        <video src={m.public_url} className="h-full w-full object-cover" muted />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.public_url} alt="" className="h-full w-full object-cover" />
                      )}
                      <span className="absolute bottom-1.5 left-1.5 flex gap-1">
                        {m.id === firstImage?.id && <span className="rounded-full bg-brand-600 px-1.5 py-px text-[10px] font-medium text-white">Main</span>}
                        {!isFile && <span className="rounded-full bg-black/60 px-1.5 py-px text-[10px] font-medium text-white">Link</span>}
                      </span>
                      <button type="button" aria-label="Remove" title={`Remove ${i + 1}`}
                        onClick={() => (isFile ? setFiles((s) => s.filter((_, j) => j !== idx)) : setUrlMedia((s) => s.filter((_, j) => j !== idx)))}
                        className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100">
                        <Icon name="close" size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </Step>
          )}

          {/* 4. Platforms */}
          {tab === 4 && (
          <Step n={4} footer={nav} title="Platforms" desc="Pick where this goes. The count is the final text length against each platform's limit."
            right={<span className="chip">{picked.length} selected</span>}>
            <div className="grid gap-2.5 sm:grid-cols-2 2xl:grid-cols-3">
              {PLATFORMS.map((p) => {
                const on = picked.includes(p.id);
                const max = ruleOf(p.id)?.max_chars;
                const n = countFor(p.id);
                const over = !!max && n > max;
                return (
                  <button type="button" key={p.id} onClick={() => toggle(p.id)} aria-pressed={on}
                    className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition ${on ? "border-slate-900 bg-white shadow-[0_2px_8px_rgba(18,19,22,0.06)]" : "border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-white"}`}>
                    <PlatformIcon platform={p.id} size={34} rounded="rounded-[10px]" className={on ? "" : "opacity-60 grayscale-[40%]"} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-semibold text-slate-900">{p.label}</span>
                      <span className={`block truncate text-[11.5px] ${over ? "font-medium text-rose-600" : "text-slate-500"}`}>
                        {max ? `${n.toLocaleString()} / ${max.toLocaleString()}` : ""}{p.mode === "api" ? " · Auto" : " · By hand"}
                      </span>
                    </span>
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white"}`}>
                      {on && <Icon name="check" size={11} strokeWidth={3.2} />}
                    </span>
                  </button>
                );
              })}
            </div>
            {(picked.includes("reddit") || picked.includes("facebook_group")) && (
              <div className="mt-5 rounded-2xl border border-slate-200 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-slate-800">Groups and subreddits</span>
                  <span className="text-xs text-slate-500">One draft for each one you pick</span>
                </div>
                {!groups.some((g) => picked.includes(g.platform)) ? (
                  <p className="text-[13px] text-slate-500">None saved yet. Add them in <Link href="/settings" className="font-medium text-brand-700 hover:underline">Settings</Link>.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {groups.filter((g) => picked.includes(g.platform)).map((g) => {
                      const on = targets.includes(g.id);
                      return (
                        <button type="button" key={g.id} onClick={() => toggleTarget(g.id)} aria-pressed={on}
                          className={`flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-[13px] transition ${on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}>
                          <PlatformIcon platform={g.platform} size={20} rounded="rounded-full" />
                          {targetLabel(g)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </Step>
          )}

          {/* 5. Platform versions */}
          {tab === 5 && (
          <Step n={5} footer={nav} title="Platform versions" desc="Give one platform its own text, hashtags or link without changing the others.">
            {!ordered.length ? (
              <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">
                Pick a platform in the <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => go(4)}>Platforms</button> tab first.
              </p>
            ) : (
              <>
                <div className="-mx-1 mb-5 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist">
                  {ordered.map((p) => {
                    const on = p === activeP;
                    const errs = errorsFor(p).length;
                    return (
                      <button key={p} type="button" role="tab" aria-selected={on} onClick={() => setActive(p)}
                        className={`flex shrink-0 items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3.5 text-[13px] font-medium transition ${on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}>
                        <PlatformIcon platform={p} size={22} rounded="rounded-full" />
                        {platformLabel(p)}
                        {overrides[p]?.custom && <span className={`text-[10px] ${on ? "text-white/60" : "text-slate-400"}`}>custom</span>}
                        {errs > 0 && <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />}
                      </button>
                    );
                  })}
                </div>
                {activeP && (() => {
                  const p = activeP;
                  const e = eff(p);
                  const o = overrides[p];
                  const rule = ruleOf(p);
                  const errs = errorsFor(p);
                  const id = `v-${p}`;
                  return (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
                        <div className="flex items-center gap-3">
                          <PlatformIcon platform={p} size={32} rounded="rounded-[10px]" />
                          <div className="leading-tight">
                            <div className="text-[13.5px] font-semibold">{platformLabel(p)}</div>
                            <div className="text-xs text-slate-500">{MODE_HINT[platformMode(p)]}</div>
                          </div>
                        </div>
                        <Switch label="Custom version" checked={e.custom} onChange={(v) => setCustom(p, v)} />
                      </div>

                      {e.custom && o ? (
                        <div className="grid gap-4 md:grid-cols-2">
                          {p === "reddit" && (
                            <Field id={`${id}-title`} label="Reddit title" className="md:col-span-2" hint={rule?.max_title_chars ? `${Array.from(o.title).length} / ${rule.max_title_chars}` : undefined}>
                              <input id={`${id}-title`} className="input" value={o.title} onChange={(ev) => patch(p, { title: ev.target.value })} />
                            </Field>
                          )}
                          <Field id={`${id}-body`} label="Text" className="md:col-span-2" hint={`${countFor(p).toLocaleString()} / ${rule?.max_chars?.toLocaleString() ?? "?"} characters with hashtags and link`}>
                            <textarea id={`${id}-body`} className="input min-h-40 leading-relaxed" value={o.body} onChange={(ev) => patch(p, { body: ev.target.value })} />
                          </Field>
                          <Field id={`${id}-tags`} label={<>Hashtags <span className="font-normal text-slate-400">(max {rule?.max_hashtags ?? 0})</span></>}>
                            <input id={`${id}-tags`} className="input" disabled={(rule?.max_hashtags ?? 0) === 0} value={o.hashtags}
                              onChange={(ev) => patch(p, { hashtags: ev.target.value })} placeholder={(rule?.max_hashtags ?? 0) === 0 ? "Not used here" : ""} />
                          </Field>
                          <Field id={`${id}-link`} label="Link">
                            <input id={`${id}-link`} className="input" disabled={p === "instagram"} value={o.link}
                              onChange={(ev) => patch(p, { link: ev.target.value })} placeholder={p === "instagram" ? "Not clickable on Instagram" : "https://"} />
                          </Field>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-slate-200 p-4">
                          <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                            <span>Uses the main text{e.hashtags.length ? `, ${e.hashtags.length} hashtag${e.hashtags.length === 1 ? "" : "s"}` : ""}{e.link ? " and the link" : ""}</span>
                            <span className="tabular-nums">{countFor(p).toLocaleString()} / {rule?.max_chars?.toLocaleString()}</span>
                          </div>
                          <p className="line-clamp-6 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">
                            {composeFull(p, e.body, e.hashtags, e.link) || <span className="text-slate-400">Nothing yet. Write it in the Main text tab.</span>}
                          </p>
                        </div>
                      )}

                      {rule?.format_notes && <Callout tone="info">{rule.format_notes}</Callout>}
                      {errs.length > 0 && (
                        <Callout tone="warning" title="Fix before publishing (you can also fix it later)">
                          <ul className="list-inside list-disc">{errs.map((x) => <li key={x}>{x}</li>)}</ul>
                        </Callout>
                      )}
                    </div>
                  );
                })()}
              </>
            )}
          </Step>
          )}
        </div>

        {/* Live preview */}
        <aside className="relative min-w-0">
          <section className="card flex flex-col overflow-hidden p-0 xl:absolute xl:inset-0">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
              <div className="min-w-0">
                <h3 className="section-title flex items-center gap-2">
                  Live preview
                  {sample && activeP && <span className="chip bg-clay-50 text-clay-700" title="Start typing in Main text to see your real post">Sample</span>}
                </h3>
                <p className="truncate text-xs text-slate-500">
                  {!activeP ? "Pick a platform" : sample ? "Start typing to see your post" : `How it looks on ${platformLabel(activeP)}`}
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-1.5">
                {ordered.map((p) => {
                  const errs = errorsFor(p).length;
                  return (
                    <button key={p} type="button" onClick={() => setActive(p)}
                      aria-label={`Preview ${platformLabel(p)}${errs ? `, ${errs} to fix` : ", ready"}`} title={`${platformLabel(p)}: ${errs ? `${errs} to fix` : "ready"}`}
                      className={`relative rounded-full p-0.5 ring-2 transition ${p === activeP ? "ring-brand-500" : "opacity-55 ring-transparent hover:opacity-100"}`}>
                      <PlatformIcon platform={p} size={24} rounded="rounded-full" />
                      <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${errs ? "bg-amber-500" : "bg-emerald-500"}`} />
                    </button>
                  );
                })}
                {activeP && (
                  <button type="button" className="btn-icon ml-1 h-7 w-7" onClick={() => setExpanded(true)} aria-label="View full size" title="View full size">
                    <Icon name="maximize" size={13} />
                  </button>
                )}
              </div>
            </div>
            <div className="min-h-0 flex-1 bg-slate-50/70 p-4">
              {activeP && pv ? (
                <FitBox>
                  <div className={sample ? "opacity-90" : ""}>{previewNode}</div>
                </FitBox>
              ) : (
                <p className="py-16 text-center text-sm text-slate-500">Pick a platform to see the preview.</p>
              )}
            </div>
            <div className="shrink-0 space-y-3 border-t border-slate-100 p-4">
              {activeP && (() => {
                const errs = errorsFor(activeP);
                return (
                  <div className="flex items-center gap-2.5 text-[13px]">
                    <PlatformIcon platform={activeP} size={20} rounded="rounded-full" />
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{platformLabel(activeP)}</span>
                    <span className="text-xs tabular-nums text-slate-400">{countFor(activeP).toLocaleString()} / {ruleOf(activeP)?.max_chars?.toLocaleString()}</span>
                    {errs.length ? (
                      <button type="button" onClick={() => go(5)} className="chip bg-amber-50 text-amber-800 hover:bg-amber-100" title={errs.join("\n")}>
                        {errs.length} to fix
                      </button>
                    ) : (
                      <span className="chip bg-emerald-50 text-emerald-700"><Icon name="check" size={11} strokeWidth={3} /> Ready</span>
                    )}
                  </div>
                );
              })()}
              <button className="btn-primary w-full py-2.5" onClick={submit} disabled={!!busy}
                title={ordered.length ? `${ordered.length - fixCount} of ${ordered.length} platforms ready. Nothing is published yet.` : undefined}>
                {createLabel}
              </button>
            </div>
          </section>
        </aside>
      </div>

      {/* Full-size preview */}
      {expanded && activeP && pv && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm sm:p-8"
          onClick={() => setExpanded(false)} role="dialog" aria-modal="true" aria-label={`${platformLabel(activeP)} preview`}>
          <div className="my-auto w-full max-w-[560px] rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
              <span className="flex items-center gap-2.5 text-sm font-semibold">
                <PlatformIcon platform={activeP} size={24} rounded="rounded-full" /> {platformLabel(activeP)} preview
                {sample && <span className="chip bg-clay-50 text-clay-700">Sample</span>}
              </span>
              <button type="button" className="btn-icon h-8 w-8" onClick={() => setExpanded(false)} aria-label="Close"><Icon name="close" size={15} /></button>
            </div>
            <div className="bg-slate-50/70 p-5">{previewNode}</div>
          </div>
        </div>
      )}
    </>
  );
}
