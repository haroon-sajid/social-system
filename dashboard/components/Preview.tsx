"use client";
import { useState } from "react";
import { Icon, type IconName } from "./icons";
import { composeFull, type Media, type Platform } from "@/lib/platforms";

interface Props {
  platform: Platform;
  body: string;
  hashtags: string[];
  link: string | null;
  title: string | null;
  media: Media[];
  accountName: string;
  targetName?: string;
}

// Where each platform cuts long text with "see more" in the feed
const FOLD: Partial<Record<Platform, number>> = { facebook: 250, facebook_group: 250, instagram: 125, linkedin: 210 };

// URLs, #hashtags and @mentions, so each platform can color them its own way
const TOKEN = /(https?:\/\/[^\s]+|#[\p{L}\p{N}_]+|@[\p{L}\p{N}_.]+)/u;

function RichText({ text, tagClass, urlClass }: { text: string; tagClass: string; urlClass: string }) {
  return (
    <>
      {text.split(new RegExp(TOKEN.source, "gu")).map((part, i) =>
        i % 2 === 1 ? <span key={i} className={part.startsWith("http") ? urlClass : tagClass}>{part}</span> : part)}
    </>
  );
}

function Folded({ text, fold, tagClass, urlClass = tagClass, more = "See more", moreClass = "", inline, className = "" }: {
  text: string; fold?: number; tagClass: string; urlClass?: string; more?: string; moreClass?: string; inline?: boolean; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const chars = Array.from(text);
  const cut = !!fold && chars.length > fold && !open;
  const shown = cut ? chars.slice(0, fold).join("").trimEnd() : text;
  const content = (
    <>
      <RichText text={shown} tagClass={tagClass} urlClass={urlClass} />
      {cut && <>{"… "}<button type="button" className={moreClass} onClick={() => setOpen(true)}>{more}</button></>}
    </>
  );
  const cls = `whitespace-pre-wrap break-words ${className}`;
  return inline ? <span className={cls}>{content}</span> : <p className={cls}>{content}</p>;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
}
const handleOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9_.]/g, "") || "you";

function Avatar({ name, size = 40, igRing }: { name: string; size?: number; igRing?: boolean }) {
  const inner = (
    <div className="flex shrink-0 items-center justify-center rounded-full bg-linear-to-br from-slate-400 to-slate-600 font-semibold text-white"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}>
      {initials(name)}
    </div>
  );
  if (!igRing) return inner;
  return (
    <div className="shrink-0 rounded-full bg-[conic-gradient(from_210deg,#FEDA75,#FA7E1E,#D62976,#962FBF,#4F5BD5,#FEDA75)] p-[2px]">
      <div className="rounded-full bg-white p-[2px]">{inner}</div>
    </div>
  );
}

function MediaBlock({ media, className = "", fit = "max-h-[420px]" }: { media: Media[]; className?: string; fit?: string }) {
  if (!media.length) return null;
  const first = media[0];
  return (
    <div className={`relative overflow-hidden bg-black/5 ${className}`}>
      {first.mime_type.startsWith("video/") ? (
        <video src={first.public_url} className={`w-full object-cover ${fit}`} controls muted playsInline />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={first.public_url} alt="" className={`w-full object-cover ${fit}`} />
      )}
      {media.length > 1 && (
        <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">1/{media.length}</span>
      )}
    </div>
  );
}

function ActionBar({ items, className }: { items: [IconName, string][]; className: string }) {
  return (
    <div className={className}>
      {items.map(([icon, label]) => (
        <div key={label} className="flex items-center justify-center gap-2 rounded-md py-1.5">
          <Icon name={icon} size={18} /> <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function hostOf(link: string) {
  try { const u = new URL(link); return { host: u.hostname.replace(/^www\./, ""), path: u.hostname + u.pathname.replace(/\/$/, "") }; }
  catch { return { host: link, path: link }; }
}

// ---------------- Facebook Page and Facebook Group ----------------
function Facebook({ p, text, group }: { p: Props; text: string; group?: boolean }) {
  const link = !group && p.link && !p.media.length ? hostOf(p.link) : null;
  return (
    <div className="rounded-xl bg-[#F0F2F5] p-3">
      <article className="overflow-hidden rounded-lg bg-white text-[#050505] shadow-[0_1px_2px_rgba(0,0,0,0.2)]">
        {group && (
          <div className="flex items-center gap-2 border-b border-[#E4E6EB] px-4 py-2 text-[13px] font-semibold">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#1877F2] text-white"><Icon name="users" size={13} /></span>
            {p.targetName || <span className="text-rose-600">Choose a group</span>}
          </div>
        )}
        <header className="flex items-start gap-2 px-4 pt-3">
          <Avatar name={p.accountName} size={40} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-[15px] font-semibold">{p.accountName}</div>
            <div className="mt-0.5 flex items-center gap-1 text-[13px] text-[#65676B]">
              <span>Just now</span><span aria-hidden>·</span><Icon name={group ? "users" : "globe"} size={12} />
            </div>
          </div>
          <Icon name="more" size={20} className="text-[#65676B]" />
        </header>
        <div className="px-4 pb-3 pt-2 text-[15px] leading-[1.34]">
          <Folded text={text} fold={FOLD[p.platform]} tagClass="font-semibold text-[#216FDB]" urlClass="text-[#216FDB] hover:underline"
            more="See more" moreClass="font-semibold text-[#65676B] hover:underline" />
        </div>
        {!group && <MediaBlock media={p.media} />}
        {link && (
          <div className="border-y border-[#CED0D4] bg-[#F0F2F5] px-4 py-2.5">
            <div className="text-[12px] uppercase text-[#65676B]">{link.host}</div>
            <div className="truncate text-[16px] font-semibold">{link.path}</div>
          </div>
        )}
        <div className="flex items-center justify-between px-4 py-2.5 text-[13px] text-[#65676B]">
          <span className="flex items-center gap-1.5">
            <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#1877F2] text-white"><Icon name="thumbsUp" size={10} strokeWidth={2.4} /></span>
            0
          </span>
          <span>0 comments</span>
        </div>
        <ActionBar
          items={[["thumbsUp", "Like"], ["comment", "Comment"], ["forward", "Share"]]}
          className="mx-3 grid grid-cols-3 border-t border-[#CED0D4] py-1 text-[15px] font-semibold text-[#65676B]" />
      </article>
    </div>
  );
}

// ---------------- Instagram ----------------
function Instagram({ p, text }: { p: Props; text: string }) {
  const handle = handleOf(p.accountName);
  return (
    <div className="flex justify-center rounded-xl bg-white p-3 ring-1 ring-slate-200">
      <article className="w-full max-w-[470px] overflow-hidden text-[14px] text-black">
        <header className="flex items-center gap-2.5 py-2.5">
          <Avatar name={p.accountName} size={32} igRing />
          <span className="font-semibold">{handle}</span>
          <span className="text-[#737373]">• now</span>
          <Icon name="more" size={20} className="ml-auto" />
        </header>
        {p.media.length ? (
          <MediaBlock media={p.media} className="rounded-[4px] border border-[#DBDBDB]" fit="aspect-[4/5]" />
        ) : (
          <div className="flex aspect-[4/5] flex-col items-center justify-center gap-2 rounded-[4px] border border-dashed border-rose-300 bg-rose-50/40 text-[13px] text-rose-600">
            <Icon name="image" size={28} /> Instagram needs an image
          </div>
        )}
        <div className="flex items-center gap-4 pt-3">
          <Icon name="heart" size={24} /><Icon name="comment" size={24} /><Icon name="send" size={23} />
          <Icon name="bookmark" size={24} className="ml-auto" />
        </div>
        <div className="pt-2 font-semibold">Be the first to like this</div>
        <div className="pt-1 leading-[18px]">
          <span className="font-semibold">{handle}</span>{" "}
          <Folded inline text={text} fold={FOLD.instagram} tagClass="text-[#00376B]" urlClass="" more="more" moreClass="text-[#737373]" />
        </div>
        <div className="pb-1 pt-2 text-[12px] text-[#737373]">Just now</div>
      </article>
    </div>
  );
}

// ---------------- Threads ----------------
function Threads({ p, text }: { p: Props; text: string }) {
  return (
    <article className="rounded-xl bg-white p-4 text-[15px] text-black ring-1 ring-[#E5E5E5]">
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <Avatar name={p.accountName} size={36} />
          <div className="mt-2 w-[2px] flex-1 rounded bg-[#E5E5E5]" />
        </div>
        <div className="min-w-0 flex-1 pb-1">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold">{handleOf(p.accountName)}</span>
            <span className="text-[#999999]">now</span>
            <Icon name="more" size={18} className="ml-auto text-[#999999]" />
          </div>
          <Folded text={text} className="mt-0.5 leading-[1.4]" tagClass="text-[#0095F6]" />
          <MediaBlock media={p.media} className="mt-3 rounded-lg ring-1 ring-[#E5E5E5]" />
          <div className="mt-3 flex gap-5 text-[#424242]">
            <Icon name="heart" size={19} /><Icon name="comment" size={19} /><Icon name="repeat" size={19} /><Icon name="send" size={18} />
          </div>
        </div>
      </div>
    </article>
  );
}

// ---------------- LinkedIn ----------------
function LinkedIn({ p, text }: { p: Props; text: string }) {
  return (
    <div className="rounded-xl bg-[#F4F2EE] p-3">
      <article className="overflow-hidden rounded-lg bg-white text-[14px] text-[rgba(0,0,0,0.9)] ring-1 ring-[#E0DFDC]">
        <header className="flex gap-2 px-4 pt-3">
          <Avatar name={p.accountName} size={48} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-[14px] font-semibold">{p.accountName}</div>
            <div className="truncate text-[12px] text-[rgba(0,0,0,0.6)]">AI automation and full-stack engineering</div>
            <div className="mt-0.5 flex items-center gap-1 text-[12px] text-[rgba(0,0,0,0.6)]">Now <span aria-hidden>•</span> <Icon name="globe" size={11} /></div>
          </div>
          <Icon name="more" size={20} className="text-[rgba(0,0,0,0.6)]" />
        </header>
        <div className="px-4 pb-2 pt-3 leading-[1.43]">
          <Folded text={text} fold={FOLD.linkedin} tagClass="font-semibold text-[#0A66C2]" more="more"
            moreClass="text-[rgba(0,0,0,0.6)] hover:text-[#0A66C2] hover:underline" />
        </div>
        <MediaBlock media={p.media} />
        <div className="flex items-center gap-1 px-4 py-2 text-[12px] text-[rgba(0,0,0,0.6)]">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#378FE9] text-white"><Icon name="thumbsUp" size={9} strokeWidth={2.4} /></span>
          0
        </div>
        <ActionBar
          items={[["thumbsUp", "Like"], ["comment", "Comment"], ["repeat", "Repost"], ["send", "Send"]]}
          className="mx-2 grid grid-cols-4 border-t border-[#E8E8E8] py-1 text-[13px] font-semibold text-[rgba(0,0,0,0.6)]" />
      </article>
    </div>
  );
}

// ---------------- X ----------------
function XPost({ p, text }: { p: Props; text: string }) {
  return (
    <article className="rounded-2xl bg-white px-4 py-3 text-[15px] text-[#0F1419] ring-1 ring-[#EFF3F4]">
      <div className="flex gap-3">
        <Avatar name={p.accountName} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 leading-5">
            <span className="truncate font-bold">{p.accountName}</span>
            <span className="truncate text-[#536471]">@{handleOf(p.accountName)} · now</span>
            <Icon name="more" size={18} className="ml-auto shrink-0 text-[#536471]" />
          </div>
          <Folded text={text} className="leading-5" tagClass="text-[#1D9BF0]" />
          <MediaBlock media={p.media} className="mt-3 rounded-2xl ring-1 ring-[#CFD9DE]" />
          <div className="mt-3 flex max-w-[425px] items-center justify-between text-[13px] text-[#536471]">
            <Icon name="comment" size={18} /><Icon name="repeat" size={18} /><Icon name="heart" size={18} /><Icon name="views" size={18} />
            <span className="flex gap-3"><Icon name="bookmark" size={18} /><Icon name="share" size={18} /></span>
          </div>
        </div>
      </div>
    </article>
  );
}

// ---------------- Reddit ----------------
function Reddit({ p, text }: { p: Props; text: string }) {
  const pill = "flex items-center gap-1.5 rounded-full bg-[#E5EBEE] px-3 py-1.5";
  return (
    <article className="rounded-2xl bg-white p-4 text-[#0F1A1C] ring-1 ring-[#E5EBEE]">
      <div className="flex items-center gap-2 text-[12px]">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FF4500] text-[10px] font-bold text-white">r/</span>
        <span className="font-semibold">{p.targetName || <span className="text-rose-600">Choose a subreddit</span>}</span>
        <span className="text-[#576F76]">• just now</span>
      </div>
      <h3 className="mt-2 text-[18px] font-semibold leading-snug">
        {p.title || <span className="text-rose-600">Title required</span>}
      </h3>
      {text && <Folded text={text} className="mt-2 text-[14px] leading-[1.5] text-[#2A3C42]" tagClass="" urlClass="text-[#0045AC] underline" />}
      <MediaBlock media={p.media} className="mt-3 rounded-2xl" />
      <div className="mt-3 flex flex-wrap gap-2 text-[12px] font-semibold">
        <span className={pill}><Icon name="arrowUp" size={15} /> Vote <Icon name="arrowDown" size={15} /></span>
        <span className={pill}><Icon name="comment" size={15} /> 0</span>
        <span className={pill}><Icon name="share" size={15} /> Share</span>
      </div>
    </article>
  );
}

export default function Preview(p: Props) {
  // Instagram links are not clickable, so the link is never added to the caption
  const text = composeFull(p.platform, p.body, p.hashtags, p.platform === "instagram" ? null : p.link);
  const view = (() => {
    switch (p.platform) {
      case "facebook": return <Facebook p={p} text={text} />;
      case "facebook_group": return <Facebook p={p} text={text} group />;
      case "instagram": return <Instagram p={p} text={text} />;
      case "threads": return <Threads p={p} text={text} />;
      case "linkedin": return <LinkedIn p={p} text={text} />;
      case "x": return <XPost p={p} text={text} />;
      case "reddit": return <Reddit p={p} text={text} />;
    }
  })();
  return <div className="preview-font">{view}</div>;
}
