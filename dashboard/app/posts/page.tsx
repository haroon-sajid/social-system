import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Icon, PlatformIcon } from "@/components/icons";
import { Callout, EmptyState, PageHeader } from "@/components/ui";
import {
  STATUS_DOT, STATUS_LABEL, contentTypeLabel, fmtDate, platformLabel, type Platform, type VariantStatus,
} from "@/lib/platforms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Posts" };

const FILTERS: { id: string; label: string; dot?: string }[] = [
  { id: "all", label: "All" },
  { id: "draft", label: "Drafts", dot: STATUS_DOT.draft },
  { id: "manual_pending", label: "Post by hand", dot: STATUS_DOT.manual_pending },
  { id: "publishing", label: "Publishing", dot: STATUS_DOT.publishing },
  { id: "published", label: "Published", dot: STATUS_DOT.published },
  { id: "failed", label: "Failed", dot: STATUS_DOT.failed },
];
const ORDER: Platform[] = ["facebook", "instagram", "threads", "linkedin", "x", "reddit", "facebook_group"];

type Row = {
  id: string; title: string | null; master_text: string; content_type: string | null; source: string | null; created_at: string;
  post_variants: { id: string; platform: Platform; status: VariantStatus; published_at: string | null; last_error: string | null }[];
};

export default async function PostsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const { status: raw = "all", q: rawQ = "" } = await searchParams;
  const status = FILTERS.some((f) => f.id === raw) ? raw : "all";
  // Characters that would break the PostgREST filter syntax are dropped
  const q = rawQ.replace(/[,()%*\\]/g, " ").trim().slice(0, 80);

  const supabase = await createClient();
  let query = supabase.from("posts")
    .select("id,title,master_text,content_type,source,created_at,post_variants(id,platform,status,published_at,last_error)")
    .order("created_at", { ascending: false }).limit(200);
  if (q) query = query.or(`title.ilike.%${q}%,master_text.ilike.%${q}%,topic.ilike.%${q}%`);
  const { data, error } = await query;

  const posts = (data ?? []) as Row[];
  const rows = posts.filter((p) => status === "all" || p.post_variants.some((v) => v.status === status));
  const counts: Record<string, number> = { all: posts.length };
  for (const p of posts) for (const s of new Set(p.post_variants.map((v) => v.status))) counts[s] = (counts[s] ?? 0) + 1;
  const href = (s: string) => {
    const sp = new URLSearchParams();
    if (s !== "all") sp.set("status", s);
    if (q) sp.set("q", q);
    const str = sp.toString();
    return str ? `/posts?${str}` : "/posts";
  };

  return (
    <>
      <PageHeader
        title={<>All your <strong>posts</strong></>}
        description="Every post and where it stands on each platform. Drafts from Claude land here automatically."
        actions={<Link href="/compose" className="btn-primary"><Icon name="plus" size={15} strokeWidth={2.2} /> New post</Link>}
      />

      {error && <Callout tone="danger" title="Could not load posts" className="mb-5">{error.message}</Callout>}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-full border border-slate-200 bg-white p-1 shadow-[0_1px_2px_rgba(18,19,22,0.03)]" role="tablist">
          {FILTERS.map((f) => {
            const on = status === f.id;
            return (
              <Link key={f.id} href={href(f.id)} role="tab" aria-selected={on}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${on ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}>
                {f.dot && <span className={`h-1.5 w-1.5 rounded-full ${f.dot}`} />}
                {f.label}
                <span className={`tabular-nums ${on ? "text-white/60" : "text-slate-400"}`}>{counts[f.id] ?? 0}</span>
              </Link>
            );
          })}
        </div>
        {q && (
          <Link href={status === "all" ? "/posts" : `/posts?status=${status}`} className="chip bg-brand-50 py-1 pl-3 pr-2 text-brand-700">
            Results for &ldquo;{q}&rdquo; <Icon name="close" size={12} />
          </Link>
        )}
      </div>

      {!rows.length ? (
        <EmptyState
          icon="inbox"
          title={q ? "No posts match your search" : status === "all" ? "No posts yet" : `Nothing in "${FILTERS.find((f) => f.id === status)?.label}"`}
          description={q || status !== "all" ? "Try another search or filter." : "Ask Claude to draft a post, or write one yourself."}
          action={q || status !== "all"
            ? <Link href="/posts" className="btn-secondary">Show all posts</Link>
            : <Link href="/compose" className="btn-primary"><Icon name="plus" size={15} /> Write a post</Link>}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(18,19,22,0.03)]">
          <div className="hidden grid-cols-[minmax(0,1fr)_140px_260px_150px] gap-6 border-b border-slate-100 bg-slate-50/70 px-5 py-2.5 text-xs font-medium text-slate-500 lg:grid">
            <span>Post</span><span>Type</span><span>Platforms</span><span>Created</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {rows.map((p) => <PostRow key={p.id} p={p} />)}
          </ul>
        </div>
      )}
    </>
  );
}

function PostRow({ p }: { p: Row }) {
  const variants = [...p.post_variants].sort((a, b) => ORDER.indexOf(a.platform) - ORDER.indexOf(b.platform));
  const failed = variants.filter((v) => v.status === "failed").length;
  return (
    <li>
      <Link href={`/posts/${p.id}`} className="group grid gap-3 px-5 py-4 transition-colors hover:bg-slate-50/70 lg:grid-cols-[minmax(0,1fr)_140px_260px_150px] lg:items-center lg:gap-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${p.source === "claude" ? "bg-clay-50 text-clay-600" : "bg-slate-100 text-slate-500"}`}
            title={p.source === "claude" ? "Drafted by Claude" : "Written by you"}>
            <Icon name={p.source === "claude" ? "sparkles" : "file"} size={16} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-[14px] font-semibold text-slate-900 group-hover:text-brand-700">{p.title || p.master_text.slice(0, 80)}</h3>
              {failed > 0 && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 ring-1 ring-inset ring-rose-200">
                  <Icon name="alert" size={11} /> {failed} failed
                </span>
              )}
            </div>
            <p className="mt-0.5 line-clamp-1 text-[13px] text-slate-500">{p.master_text}</p>
          </div>
        </div>
        <span className="hidden lg:block"><span className="chip">{contentTypeLabel(p.content_type)}</span></span>
        <div className="flex flex-wrap items-center gap-1.5">
          {variants.map((v) => (
            <span key={v.id} className="relative" title={`${platformLabel(v.platform)}: ${STATUS_LABEL[v.status]}${v.last_error ? `\n${v.last_error}` : ""}`}>
              <PlatformIcon platform={v.platform} size={26} />
              <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${STATUS_DOT[v.status]}`} />
            </span>
          ))}
          {!variants.length && <span className="text-xs text-slate-400">No platforms</span>}
        </div>
        <span className="flex items-center justify-between text-[13px] text-slate-500">
          {fmtDate(p.created_at)}
          <Icon name="chevronRight" size={16} className="hidden text-slate-300 group-hover:text-slate-500 lg:block" />
        </span>
      </Link>
    </li>
  );
}
