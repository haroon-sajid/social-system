"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Preview from "./Preview";
import { Icon, PlatformIcon } from "./icons";
import { Callout, PageHeader, StatusBadge } from "./ui";
import { uploadMedia } from "@/lib/media";
import {
  addVariant, deletePost, markManualDone, publishMany, publishOne, removeMedia, removeVariant, saveVariant, startManual,
  updatePostText,
} from "@/app/actions";
import {
  MODE_HINT, PLATFORMS, STATUS_DOT, STATUS_LABEL, charCount, composeFull, contentTypeLabel, fmtDate, isStuck, manualUrl,
  platformLabel, platformMode, validate,
  type Account, type GroupTarget, type Media, type Platform, type Rule, type Variant,
} from "@/lib/platforms";

interface Post {
  id: string; title: string | null; master_text: string; topic: string | null; content_type: string | null;
  source?: string | null; created_at?: string;
}
interface Log { variant_id: string | null; attempt: number | null; outcome: string; error: string | null; created_at: string }
type RunResult = { ok: boolean; error?: string; message?: string };
type Run = (fn: () => Promise<RunResult>) => void;

const EDITABLE = ["draft", "failed", "manual_pending"];
const parseTags = (s: string) => s.split(/[\s,]+/).map((t) => t.replace(/^#/, "").trim()).filter(Boolean);
const targetName = (g: GroupTarget | undefined) => (g ? (g.platform === "reddit" ? `r/${g.subreddit}` : g.name) : undefined);

export default function PostEditor(props: {
  post: Post; variants: Variant[]; media: Media[]; rules: Rule[]; groups: GroupTarget[]; accounts: Account[]; logs: Log[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [media, setMedia] = useState<Media[]>(props.media);
  const [uploading, setUploading] = useState<string | null>(null);
  const [publishingAll, setPublishingAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newPlatform, setNewPlatform] = useState<Platform>("facebook");
  const [newTarget, setNewTarget] = useState<string>("");
  const [editMaster, setEditMaster] = useState(false);
  const [showMaster, setShowMaster] = useState(false);
  const [master, setMaster] = useState(props.post.master_text);
  const [title, setTitle] = useState(props.post.title ?? "");
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [active, setActive] = useState<string | undefined>(props.variants[0]?.id);
  const onDirty = useCallback((id: string, d: boolean) => setDirty((s) => (!!s[id] === d ? s : { ...s, [id]: d })), []);

  useEffect(() => setMedia(props.media), [props.media]);

  // Open the tab of a version that was just added
  const known = useRef(new Set(props.variants.map((v) => v.id)));
  useEffect(() => {
    const fresh = props.variants.find((v) => !known.current.has(v.id));
    known.current = new Set(props.variants.map((v) => v.id));
    if (fresh) setActive(fresh.id);
  }, [props.variants]);
  const activeId = props.variants.some((v) => v.id === active) ? active : props.variants[0]?.id;

  // Success messages fade after a few seconds, errors stay until closed
  useEffect(() => {
    if (!flash?.ok) return;
    const t = setTimeout(() => setFlash(null), 6000);
    return () => clearTimeout(t);
  }, [flash]);

  // Refresh while a version is still publishing (for example after a page reload).
  // Stop once it looks stuck: the card then offers Retry instead.
  const busy = props.variants.some((v) => v.status === "publishing" && !isStuck(v));
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => router.refresh(), 8000);
    return () => clearInterval(t);
  }, [busy, router]);

  const ruleOf = (p: Platform) => props.rules.find((r) => r.platform === p);
  const run: Run = (fn) =>
    start(async () => {
      const r = await fn();
      setFlash(r.ok ? { ok: true, text: r.message ?? "Saved." } : { ok: false, text: r.error ?? "Error" });
      router.refresh();
    });

  const apiReady = props.variants.filter((v) => platformMode(v.platform) === "api" && ["draft", "failed"].includes(v.status)
    && validate(v, ruleOf(v.platform), media).length === 0);
  const unsaved = props.variants.some((v) => dirty[v.id]);

  // Publish all ready API versions in parallel (one server call), then show one line per platform
  async function publishAll() {
    if (unsaved) return setFlash({ ok: false, text: "Some versions have unsaved changes. Click Save changes on them first." });
    if (!confirm(`Publish ${apiReady.length} version(s) now: ${apiReady.map((v) => platformLabel(v.platform)).join(", ")}?`)) return;
    setPublishingAll(true);
    try {
      const results = await publishMany(apiReady.map((v) => v.id));
      const lines = results.map(({ id, result }) => {
        const label = platformLabel(apiReady.find((v) => v.id === id)?.platform ?? "facebook");
        return `${label}: ${result.ok ? result.message ?? "Published." : result.error}`;
      });
      setFlash({ ok: results.every((r) => r.result.ok), text: lines.join("\n") });
    } catch (e) {
      setFlash({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setPublishingAll(false);
      router.refresh();
    }
  }

  async function onUpload(files: FileList | null) {
    if (!files?.length) return;
    try {
      const added: Media[] = [];
      for (let i = 0; i < files.length; i++) {
        setUploading(`Uploading ${i + 1} of ${files.length}...`);
        added.push(await uploadMedia(props.post.id, files[i], media.length + i));
      }
      // Give the first new image to API versions that have no image yet
      const img = added.find((m) => m.mime_type.startsWith("image/"));
      if (img) for (const v of props.variants) {
        if (EDITABLE.includes(v.status) && platformMode(v.platform) === "api" && v.media_ids.length === 0)
          await saveVariant(v.id, { media_ids: [img.id] });
      }
      setFlash({ ok: true, text: `${added.length} file(s) added. Choose the image for each platform in its tab.` });
    } catch (e) {
      setFlash({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setUploading(null);
      router.refresh();
    }
  }

  function onRemoveMedia(m: Media) {
    const locked = props.variants.filter((v) => v.media_ids.includes(m.id) && !EDITABLE.includes(v.status));
    if (locked.length) return setFlash({ ok: false, text: "This file is used by a scheduled or published version." });
    if (!confirm("Remove this file from the post?")) return;
    run(() => removeMedia(m.id));
  }

  const createdBy = props.post.source === "claude" ? "Drafted by Claude" : "Written by you";

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/posts", label: "Posts" }]}
        title={<strong>{props.post.title || "Untitled post"}</strong>}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">{contentTypeLabel(props.post.content_type)}</span>
            <span className="flex items-center gap-1"><Icon name={props.post.source === "claude" ? "sparkles" : "user"} size={13} />{createdBy}</span>
            {props.post.created_at && <span className="flex items-center gap-1"><Icon name="clock" size={13} />{fmtDate(props.post.created_at)}</span>}
            {props.post.topic && <span className="flex items-center gap-1"><Icon name="hash" size={13} />{props.post.topic}</span>}
          </span>
        }
        actions={
          <>
            <button className="btn-danger" disabled={pending}
              onClick={() => confirm("Delete this post and all its versions? Published posts stay on the platforms.") && run(() => deletePost(props.post.id))}>
              <Icon name="trash" size={16} /> Delete
            </button>
            <button className="btn-primary" disabled={pending || publishingAll || !apiReady.length || unsaved} onClick={publishAll}
              title={unsaved ? "Save your changes first" : !apiReady.length ? "No version is ready to publish from here" : undefined}>
              <Icon name="send" size={16} />
              {publishingAll ? "Publishing..." : unsaved ? "Save changes first" : `Publish all ready (${apiReady.length})`}
            </button>
          </>
        }
      />

      {flash && (
        <Callout tone={flash.ok ? "success" : "danger"} onClose={() => setFlash(null)} className="mb-5">{flash.text}</Callout>
      )}

      <div className="mb-6 grid gap-5 lg:grid-cols-5">
        {/* Original text */}
        <section className="card lg:col-span-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="section-title">Original text</h2>
              <p className="text-xs text-slate-500">The source every platform version starts from.</p>
            </div>
            {!editMaster && (
              <button className="btn-secondary btn-sm" onClick={() => setEditMaster(true)}><Icon name="compose" size={14} /> Edit</button>
            )}
          </div>
          {editMaster ? (
            <div className="space-y-3">
              <div>
                <label className="label" htmlFor="post-title">Title</label>
                <input id="post-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Internal title" />
              </div>
              <div>
                <label className="label" htmlFor="post-text">Text</label>
                <textarea id="post-text" className="input min-h-36" value={master} onChange={(e) => setMaster(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <button className="btn-primary" disabled={pending} onClick={() => run(async () => {
                  const r = await updatePostText(props.post.id, { title, master_text: master });
                  if (r.ok) setEditMaster(false);
                  return r;
                })}>Save</button>
                <button className="btn-ghost" onClick={() => { setEditMaster(false); setMaster(props.post.master_text); setTitle(props.post.title ?? ""); }}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <p className={`whitespace-pre-wrap text-sm leading-relaxed text-slate-700 ${showMaster ? "" : "line-clamp-5"}`}>{props.post.master_text}</p>
              {props.post.master_text.split("\n").length > 5 || props.post.master_text.length > 400 ? (
                <button className="mt-2 text-xs font-medium text-brand-700 hover:underline" onClick={() => setShowMaster((s) => !s)}>
                  {showMaster ? "Show less" : "Show all"}
                </button>
              ) : null}
            </>
          )}
        </section>

        {/* Media */}
        <section className="card lg:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="section-title">Media <span className="font-normal text-slate-400">({media.length})</span></h2>
              <p className="text-xs text-slate-500">Images become JPEG automatically.</p>
            </div>
            <label className={`btn-secondary btn-sm cursor-pointer ${uploading ? "pointer-events-none opacity-60" : ""}`}>
              <Icon name="upload" size={14} /> {uploading ?? "Upload"}
              <input type="file" multiple hidden accept="image/*,video/mp4,video/quicktime" disabled={!!uploading}
                onChange={(e) => { onUpload(e.target.files); e.target.value = ""; }} />
            </label>
          </div>
          {media.length ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-3">
              {media.map((m, i) => (
                <div key={m.id} className="group relative aspect-square overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200">
                  {m.mime_type.startsWith("video/") ? (
                    <video src={m.public_url} className="h-full w-full object-cover" muted />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.public_url} alt="" className="h-full w-full object-cover" />
                  )}
                  <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 text-[10px] font-medium text-white">
                    {m.mime_type.startsWith("video/") ? "Video" : "Image"} {i + 1}
                  </span>
                  <button onClick={() => onRemoveMedia(m)} aria-label="Remove file"
                    className="absolute right-1 top-1 rounded-md bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100">
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 py-6 text-center text-sm text-slate-500">
              <Icon name="image" size={22} className="text-slate-400" />
              <span className="mt-2">No media yet. Instagram needs one image.</span>
            </div>
          )}
        </section>
      </div>

      {/* Platform tabs */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div role="tablist" aria-label="Platform versions" className="flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-xl bg-slate-200/60 p-1">
          {props.variants.map((v) => {
            const on = v.id === activeId;
            const errs = EDITABLE.includes(v.status) ? validate(v, ruleOf(v.platform), media).length : 0;
            const tgt = targetName(props.groups.find((g) => g.id === v.group_target_id));
            return (
              <button key={v.id} role="tab" aria-selected={on} onClick={() => setActive(v.id)}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${on ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-600 hover:bg-white/70 hover:text-slate-900"}`}>
                <PlatformIcon platform={v.platform} size={20} rounded="rounded-md" />
                <span>{platformLabel(v.platform)}</span>
                {tgt && <span className="max-w-28 truncate text-xs font-normal text-slate-400">{tgt}</span>}
                <span className={`h-2 w-2 rounded-full ${STATUS_DOT[v.status]}`} title={STATUS_LABEL[v.status]} />
                {errs > 0 && <span className="rounded-full bg-rose-100 px-1.5 text-[10px] font-semibold text-rose-700" title={`${errs} problem(s) to fix`}>{errs}</span>}
                {dirty[v.id] && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title="Unsaved changes" />}
              </button>
            );
          })}
          {!props.variants.length && <span className="px-3 py-2 text-sm text-slate-500">No platform versions yet</span>}
        </div>
        <button className="btn-secondary shrink-0" onClick={() => setAdding((a) => !a)} aria-expanded={adding}>
          <Icon name="plus" size={16} /> Add platform
        </button>
      </div>

      {adding && (
        <div className="card mb-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="label" htmlFor="new-platform">Platform</label>
            <select id="new-platform" className="input w-auto" value={newPlatform}
              onChange={(e) => { setNewPlatform(e.target.value as Platform); setNewTarget(""); }}>
              {PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          {(newPlatform === "reddit" || newPlatform === "facebook_group") && (
            <div>
              <label className="label" htmlFor="new-target">{newPlatform === "reddit" ? "Subreddit" : "Group"}</label>
              <select id="new-target" className="input w-auto" value={newTarget} onChange={(e) => setNewTarget(e.target.value)}>
                <option value="">Choose later</option>
                {props.groups.filter((g) => g.platform === newPlatform).map((g) => <option key={g.id} value={g.id}>{targetName(g)}</option>)}
              </select>
            </div>
          )}
          <p className="hint mb-2.5 flex-1">{MODE_HINT[platformMode(newPlatform)]}. It starts from the original text.</p>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
            <button className="btn-primary" disabled={pending}
              onClick={() => run(async () => { const r = await addVariant(props.post.id, newPlatform, newTarget || null); if (r.ok) setAdding(false); return r; })}>
              Add version
            </button>
          </div>
        </div>
      )}

      {props.variants.map((v) => (
        <VariantCard key={v.id} v={v} hidden={v.id !== activeId} rule={ruleOf(v.platform)} media={media} groups={props.groups}
          accounts={props.accounts} logs={props.logs.filter((l) => l.variant_id === v.id)}
          pending={pending || publishingAll} run={run} onDirty={onDirty} />
      ))}
    </>
  );
}

function CharMeter({ count, max }: { count: number; max: number | undefined }) {
  if (!max) return null;
  const pct = Math.min(100, (count / max) * 100);
  const over = count > max;
  const tone = over ? "bg-rose-500" : pct > 90 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="w-36" title={`${count} of ${max} characters`}>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-slate-500">Characters</span>
        <span className={`font-medium tabular-nums ${over ? "text-rose-600" : "text-slate-700"}`}>{count.toLocaleString()} / {max.toLocaleString()}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(pct, count ? 2 : 0)}%` }} />
      </div>
    </div>
  );
}

function VariantCard({ v, hidden, rule, media, groups, accounts, logs, pending, run, onDirty }: {
  v: Variant; hidden: boolean; rule: Rule | undefined; media: Media[]; groups: GroupTarget[]; accounts: Account[]; logs: Log[];
  pending: boolean; run: Run; onDirty: (id: string, dirty: boolean) => void;
}) {
  const [publishing, setPublishing] = useState(false);
  const [body, setBody] = useState(v.body);
  const [tags, setTags] = useState(v.hashtags.join(" "));
  const [link, setLink] = useState(v.link_url ?? "");
  const [title, setTitle] = useState(v.title ?? "");
  const [target, setTarget] = useState(v.group_target_id ?? "");
  const [mediaIds, setMediaIds] = useState<string[]>(v.media_ids);
  const [postUrl, setPostUrl] = useState("");
  const [copied, setCopied] = useState(false);

  // Reset local edits only when the saved server values change (not on every auto refresh)
  const serverSig = JSON.stringify([v.body, v.hashtags, v.link_url, v.title, v.group_target_id, v.media_ids]);
  useEffect(() => {
    setBody(v.body); setTags(v.hashtags.join(" ")); setLink(v.link_url ?? ""); setTitle(v.title ?? "");
    setTarget(v.group_target_id ?? ""); setMediaIds(v.media_ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverSig]);

  const mode = platformMode(v.platform);
  const editable = EDITABLE.includes(v.status);
  const local: Variant = useMemo(() => ({
    ...v, body, hashtags: parseTags(tags), link_url: link || null, title: title || null,
    group_target_id: target || null, media_ids: mediaIds,
  }), [v, body, tags, link, title, target, mediaIds]);
  const errors = validate(local, rule, media);
  const finalText = composeFull(v.platform, body, local.hashtags, local.link_url);
  const count = charCount(v.platform, finalText);
  const dirty = body !== v.body || tags !== v.hashtags.join(" ") || link !== (v.link_url ?? "") ||
    title !== (v.title ?? "") || target !== (v.group_target_id ?? "") || mediaIds.join() !== v.media_ids.join();
  const tgt = groups.find((g) => g.id === (target || v.group_target_id));
  const account = accounts.find((a) => a.platform === (v.platform === "facebook_group" ? "facebook" : v.platform));
  const vMedia = media.filter((m) => mediaIds.includes(m.id));
  const lastError = v.last_error || logs.find((l) => l.outcome === "error")?.error;
  const stuck = isStuck(v);
  const canPublish = mode === "api" && (["draft", "failed"].includes(v.status) || stuck);

  useEffect(() => onDirty(v.id, dirty), [onDirty, v.id, dirty]);

  const save = () => saveVariant(v.id, {
    body, hashtags: parseTags(tags), link_url: link || null, title: title || null,
    group_target_id: target || null, media_ids: mediaIds,
  });
  const saveThen = (next: () => Promise<RunResult>) => async () => {
    if (dirty) { const r = await save(); if (!r.ok) return r; }
    return next();
  };

  async function copy() {
    try { await navigator.clipboard.writeText(finalText); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setCopied(false); }
  }

  async function openManual() {
    const url = manualUrl(local, tgt);
    if (!url) return run(async () => ({ ok: false, error: "Choose a subreddit or group first." }));
    try { await navigator.clipboard.writeText(finalText); setCopied(true); } catch { /* clipboard blocked */ }
    window.open(url, "_blank", "noopener");
    run(saveThen(() => startManual(v.id)));
  }

  const idBase = `v-${v.id}`;

  return (
    <section role="tabpanel" className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${hidden ? "hidden" : ""}`}>
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4">
        <PlatformIcon platform={v.platform} size={36} rounded="rounded-xl" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900">{platformLabel(v.platform)}</h2>
            <StatusBadge status={stuck ? "failed" : v.status} />
            {stuck && <span className="text-xs font-medium text-amber-700">stuck</span>}
          </div>
          <p className="truncate text-xs text-slate-500">
            {MODE_HINT[mode]}{targetName(tgt) ? ` · ${targetName(tgt)}` : ""}
            {v.status === "published" && v.published_at ? ` · Published ${fmtDate(v.published_at)}` : ""}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-4">
          {v.platform_post_url && (
            <a href={v.platform_post_url} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
              View post <Icon name="external" size={13} />
            </a>
          )}
          <CharMeter count={count} max={rule?.max_chars} />
        </div>
      </header>

      <div className="grid lg:grid-cols-2">
        {/* Editor */}
        <div className="space-y-4 p-5">
          {v.platform === "reddit" && (
            <div>
              <label className="label" htmlFor={`${idBase}-title`}>Title</label>
              <input id={`${idBase}-title`} className="input" disabled={!editable} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Reddit post title" />
              {rule?.max_title_chars && <p className="hint">{Array.from(title).length} / {rule.max_title_chars} characters</p>}
            </div>
          )}
          <div>
            <label className="label" htmlFor={`${idBase}-body`}>Text</label>
            <textarea id={`${idBase}-body`} className="input min-h-48 leading-relaxed" disabled={!editable} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor={`${idBase}-tags`}>Hashtags <span className="font-normal text-slate-400">(max {rule?.max_hashtags ?? 0})</span></label>
              <input id={`${idBase}-tags`} className="input" disabled={!editable || (rule?.max_hashtags ?? 0) === 0} value={tags} onChange={(e) => setTags(e.target.value)}
                placeholder={(rule?.max_hashtags ?? 0) === 0 ? "Not used here" : "automation n8n"} />
            </div>
            <div>
              <label className="label" htmlFor={`${idBase}-link`}>Link</label>
              <input id={`${idBase}-link`} className="input" disabled={!editable || v.platform === "instagram"} value={link} onChange={(e) => setLink(e.target.value)}
                placeholder={v.platform === "instagram" ? "Not clickable on Instagram" : "https://"} />
            </div>
          </div>
          {(v.platform === "reddit" || v.platform === "facebook_group") && (
            <div>
              <label className="label" htmlFor={`${idBase}-target`}>{v.platform === "reddit" ? "Subreddit" : "Group"}</label>
              <select id={`${idBase}-target`} className="input" disabled={!editable} value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Choose {v.platform === "reddit" ? "a subreddit" : "a group"}</option>
                {groups.filter((g) => g.platform === v.platform).map((g) => <option key={g.id} value={g.id}>{targetName(g)}</option>)}
              </select>
            </div>
          )}
          {media.length > 0 && v.platform !== "facebook_group" && (
            <div>
              <span className="label">Media</span>
              <div className="flex flex-wrap gap-2">
                {media.map((m, i) => {
                  const on = mediaIds.includes(m.id);
                  return (
                    <button key={m.id} type="button" disabled={!editable} aria-pressed={on}
                      onClick={() => setMediaIds((s) => (on ? s.filter((x) => x !== m.id) : [...s, m.id]))}
                      className={`relative h-16 w-16 overflow-hidden rounded-lg ring-2 transition disabled:cursor-not-allowed ${on ? "ring-brand-500" : "opacity-50 ring-transparent hover:opacity-100"}`}
                      title={`${m.mime_type.startsWith("video/") ? "Video" : "Image"} ${i + 1}`}>
                      {m.mime_type.startsWith("video/") ? (
                        <span className="flex h-full w-full items-center justify-center bg-slate-800 text-white"><Icon name="video" size={18} /></span>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.public_url} alt="" className="h-full w-full object-cover" />
                      )}
                      {on && <span className="absolute right-1 top-1 rounded-full bg-brand-600 p-0.5 text-white"><Icon name="check" size={10} strokeWidth={3} /></span>}
                    </button>
                  );
                })}
              </div>
              <p className="hint">{mode === "api" ? "Pick 1 image. Videos are posted by hand for now." : "Attach these yourself when you post."}</p>
            </div>
          )}

          {tgt?.rules_notes && <Callout tone="warning" title="Group rules">{tgt.rules_notes}</Callout>}
          {rule?.format_notes && <Callout tone="info">{rule.format_notes}</Callout>}
          {errors.length > 0 && (
            <Callout tone="danger" title="Fix before publishing">
              <ul className="list-inside list-disc">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
            </Callout>
          )}
          {lastError && v.status !== "published" && (
            <Callout tone="danger" title={`Last error (attempt ${v.publish_attempts})`}>{lastError}</Callout>
          )}
          {stuck && (
            <Callout tone="warning" title="Stuck in publishing for over 3 minutes">
              Check the Social 1 executions in n8n and the platform itself. If the post is not there, click Retry.
            </Callout>
          )}

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            {canPublish && (
              <button className="btn-primary" disabled={pending || errors.length > 0}
                onClick={() => {
                  if (stuck && !confirm(`This version has been "publishing" for over 3 minutes, so n8n probably stopped.\n\nOpen ${platformLabel(v.platform)} first: if the post is already there, do not retry.\n\nRetry now?`)) return;
                  setPublishing(true);
                  run(async () => {
                    try { return await saveThen(() => publishOne(v.id))(); } finally { setPublishing(false); }
                  });
                }}>
                <Icon name="send" size={15} />
                {publishing ? "Publishing..." : v.status === "draft" ? "Publish" : "Retry"}
              </button>
            )}
            {v.status === "publishing" && !stuck && (
              <span className="flex items-center gap-2 text-sm font-medium text-sky-700"><span className="h-2 w-2 animate-pulse rounded-full bg-sky-500" />Publishing...</span>
            )}
            {mode !== "api" && editable && (
              <>
                <button className="btn-primary" disabled={pending || errors.length > 0} onClick={openManual}>
                  <Icon name="external" size={15} />
                  {mode === "copy_open" ? "Copy text and open group" : `Open ${platformLabel(v.platform)} and post`}
                </button>
                <button className="btn-secondary" onClick={copy}>
                  <Icon name={copied ? "check" : "copy"} size={15} /> {copied ? "Copied" : "Copy text"}
                </button>
              </>
            )}
            {editable && (
              <button className="btn-secondary" disabled={pending || !dirty} onClick={() => run(save)}>
                {dirty ? "Save changes" : <><Icon name="check" size={15} /> Saved</>}
              </button>
            )}
            {editable && (
              <button className="btn-ghost ml-auto text-rose-700 hover:bg-rose-50 hover:text-rose-800" disabled={pending}
                onClick={() => confirm("Remove this version?") && run(() => removeVariant(v.id))}>
                <Icon name="trash" size={15} /> Remove
              </button>
            )}
          </div>

          {mode !== "api" && v.status === "manual_pending" && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
              <label className="label" htmlFor={`${idBase}-url`}>After posting, paste the post link</label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input id={`${idBase}-url`} className="input flex-1" value={postUrl} onChange={(e) => setPostUrl(e.target.value)} placeholder="https://" />
                <button className="btn-primary" disabled={pending} onClick={() => run(() => markManualDone(v.id, postUrl))}>
                  <Icon name="check" size={15} /> Mark as posted
                </button>
              </div>
              <p className="hint">The link keeps your history and calendar complete.</p>
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="border-t border-slate-100 bg-slate-50/80 p-5 lg:border-l lg:border-t-0">
          <div className="mb-3 flex items-center justify-between">
            <span className="eyebrow">Preview</span>
            <span className="text-xs text-slate-400">How it looks on {platformLabel(v.platform)}</span>
          </div>
          <Preview platform={v.platform} body={body} hashtags={local.hashtags} link={local.link_url} title={local.title}
            media={vMedia} accountName={account?.display_name ?? "Your account"} targetName={targetName(tgt)} />
        </div>
      </div>

      {logs.length > 0 && (
        <details className="group border-t border-slate-100 px-5 py-3">
          <summary className="flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-800">
            <Icon name="chevronRight" size={14} className="transition group-open:rotate-90" /> Publish history ({logs.length})
          </summary>
          <ul className="mt-3 space-y-2">
            {logs.map((l, i) => (
              <li key={`${l.created_at}-${i}`} className="flex flex-wrap items-start gap-x-3 gap-y-1 text-xs">
                <span className={`rounded-full px-2 py-0.5 font-medium ${l.outcome === "error" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
                  {l.outcome === "error" ? "Error" : l.outcome === "manual_done" ? "Posted by hand" : "Published"}
                </span>
                <span className="text-slate-500">{fmtDate(l.created_at)}{l.attempt ? ` · attempt ${l.attempt}` : ""}</span>
                {l.error && <span className="w-full break-words text-rose-700">{l.error}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
