import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Icon, PlatformIcon } from "@/components/icons";
import { PageHeader } from "@/components/ui";
import { STATUS_DOT, fmtDate, platformLabel, type Platform, type VariantStatus } from "@/lib/platforms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

const TZ = "Asia/Karachi";
const DAY = 864e5;

type Perf = {
  variant_id: string; post_id: string; post_title: string | null; platform: Platform; published_at: string;
  views: number | null; reach: number | null; impressions: number | null; likes: number | null; comments: number | null;
  shares: number | null; saves: number | null; engagement_rate_pct: number | null; platform_post_url: string | null;
};
type Latest = { id: string; title: string | null; master_text: string; created_at: string; source: string | null;
  post_variants: { id: string; platform: Platform; status: VariantStatus }[] };

const viewsOf = (r: Perf) => r.views ?? r.impressions ?? r.reach ?? 0;
const actsOf = (r: Perf) => (r.likes ?? 0) + (r.comments ?? 0) + (r.shares ?? 0) + (r.saves ?? 0);
const fmt = (n: number) => Intl.NumberFormat("en", { notation: n >= 100000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n);

function pkt(d: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return { key: `${p.year}-${p.month}-${p.day}`, month: `${p.year}-${p.month}`, hour: Number(p.hour) % 24 };
}

function Delta({ cur, prev }: { cur: number; prev: number }) {
  if (!prev && !cur) return <span className="text-xs text-slate-400">No data yet</span>;
  if (!prev) return <span className="chip bg-emerald-50 text-emerald-700">New</span>;
  const pct = Math.round(((cur - prev) / prev) * 1000) / 10;
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${up ? "text-emerald-600" : "text-rose-600"}`}>
      <Icon name={up ? "trendUp" : "trendDown"} size={13} strokeWidth={2.2} /> {Math.abs(pct)}%
    </span>
  );
}

function Kpi({ label, value, cur, prev, icon }: { label: string; value: string; cur: number; prev: number; icon: "views" | "heart" | "send" }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <span className="text-[13.5px] font-medium text-slate-600">{label}</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-400"><Icon name={icon} size={15} /></span>
      </div>
      <div className="mt-3 text-[32px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-slate-900">{value}</div>
      <div className="mt-3 flex items-center gap-2">
        <Delta cur={cur} prev={prev} />
        <span className="text-xs text-slate-400">vs previous 30 days</span>
      </div>
    </div>
  );
}

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ cm?: string; tp?: string }> }) {
  const { cm, tp = "all" } = await searchParams;
  const now = Date.now();
  const today = pkt(new Date(now));
  const [cy, cmo] = (cm && /^\d{4}-\d{2}$/.test(cm) ? cm : today.month).split("-").map(Number);
  const monthStart = new Date(Date.UTC(cy, cmo - 1, 1) - 5 * 3600_000).toISOString();
  const monthEnd = new Date(Date.UTC(cy, cmo, 1) - 5 * 3600_000).toISOString();

  const supabase = await createClient();
  const [perfQ, latestQ, monthQ, accountsQ, groupsQ, draftsQ] = await Promise.all([
    supabase.from("v_variant_performance")
      .select("variant_id,post_id,post_title,platform,published_at,views,reach,impressions,likes,comments,shares,saves,engagement_rate_pct,platform_post_url")
      .eq("status", "published").gte("published_at", new Date(now - 63 * DAY).toISOString()),
    supabase.from("posts").select("id,title,master_text,created_at,source,post_variants(id,platform,status)")
      .order("created_at", { ascending: false }).limit(3),
    supabase.from("post_variants").select("published_at").eq("status", "published").gte("published_at", monthStart).lt("published_at", monthEnd),
    supabase.from("accounts").select("platform,display_name").eq("is_active", true).order("created_at"),
    supabase.from("group_targets").select("id", { count: "exact", head: true }),
    supabase.from("post_variants").select("id", { count: "exact", head: true }).eq("status", "draft"),
  ]);

  const perf = (perfQ.data ?? []) as Perf[];
  const latest = (latestQ.data ?? []) as Latest[];
  const accounts = (accountsQ.data ?? []) as { platform: Platform; display_name: string }[];
  const inRange = (r: Perf, from: number, to: number) => { const t = new Date(r.published_at).getTime(); return t >= from && t < to; };
  const cur = perf.filter((r) => inRange(r, now - 30 * DAY, now + DAY));
  const prev = perf.filter((r) => inRange(r, now - 60 * DAY, now - 30 * DAY));
  const sum = (rs: Perf[], f: (r: Perf) => number) => rs.reduce((a, r) => a + f(r), 0);

  // Weekly engagement, last 8 weeks (oldest first)
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const from = now - (8 - i) * 7 * DAY, to = from + 7 * DAY;
    const rs = perf.filter((r) => inRange(r, from, to));
    return { label: new Date(from + DAY).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: TZ }),
      acts: sum(rs, actsOf), reach: sum(rs, viewsOf), posts: rs.length };
  });
  const peak = Math.max(...weeks.map((w) => w.acts));
  const top = Math.max(4, Math.ceil((peak * 1.15) / 4) * 4);
  const totalActs = sum(cur, actsOf);

  // Top posts
  const tpOk = ["all", "facebook", "instagram", "threads"].includes(tp) ? tp : "all";
  const topRows = perf.filter((r) => tpOk === "all" || r.platform === tpOk)
    .sort((a, b) => (b.engagement_rate_pct ?? -1) - (a.engagement_rate_pct ?? -1) || actsOf(b) - actsOf(a)).slice(0, 5);

  // Mini calendar
  const postedDays = new Set((monthQ.data ?? []).map((r) => pkt(new Date(r.published_at as string)).key));
  const firstDow = new Date(Date.UTC(cy, cmo - 1, 1)).getUTCDay(); // Sunday first
  const daysIn = new Date(Date.UTC(cy, cmo, 0)).getUTCDate();
  const prevDays = new Date(Date.UTC(cy, cmo - 1, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((firstDow + daysIn) / 7) * 7 }, (_, i) => {
    const d = i - firstDow + 1;
    if (d < 1) return { n: prevDays + d, out: true, key: `p${i}` };
    if (d > daysIn) return { n: d - daysIn, out: true, key: `n${i}` };
    return { n: d, out: false, key: `${cy}-${String(cmo).padStart(2, "0")}-${String(d).padStart(2, "0")}` };
  });
  const monthLabel = new Date(Date.UTC(cy, cmo - 1, 1)).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const prevM = cmo === 1 ? `${cy - 1}-12` : `${cy}-${String(cmo - 1).padStart(2, "0")}`;
  const nextM = cmo === 12 ? `${cy + 1}-01` : `${cy}-${String(cmo + 1).padStart(2, "0")}`;
  const qs = (o: Record<string, string>) => `/?${new URLSearchParams({ ...(cm ? { cm } : {}), ...(tp !== "all" ? { tp } : {}), ...o })}`;

  // Greeting and setup
  const greet = today.hour < 12 ? "Good morning" : today.hour < 17 ? "Good afternoon" : "Good evening";
  const name = accounts[0]?.display_name?.split(" ")[0] ?? "there";
  const connected = new Set(accounts.map((a) => a.platform));
  const webhook = !!process.env.N8N_PUBLISH_WEBHOOK_URL && !process.env.N8N_PUBLISH_WEBHOOK_URL.includes("YOUR-N8N-DOMAIN");
  const steps = [
    { done: connected.size > 0, title: "Connect your accounts", href: "/settings", note: `${connected.size} of 4 connected` },
    { done: (groupsQ.count ?? 0) > 0, title: "Add groups and subreddits", href: "/settings", note: "Optional" },
    { done: !!process.env.SOCIAL_HUB_API_KEY && !process.env.SOCIAL_HUB_API_KEY.startsWith("PASTE_"), title: "Connect Claude", href: "/settings?tab=claude", note: "API key" },
    { done: webhook, title: "Connect publishing (n8n)", href: "/settings?tab=claude", note: "Webhook" },
    { done: latest.length > 0, title: "Create your first post", href: "/compose", note: "Compose" },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <>
      <PageHeader
        title={<>{greet}, <strong>{name}!</strong></>}
        description={`Track how your posts perform and plan what to share next.${draftsQ.count ? ` You have ${draftsQ.count} draft version${draftsQ.count === 1 ? "" : "s"} waiting.` : ""}`}
        actions={
          <>
            <Link href="/posts?status=draft" className="btn-secondary"><Icon name="file" size={15} /> Drafts</Link>
            <Link href="/compose" className="btn-primary"><Icon name="plus" size={15} strokeWidth={2.2} /> New post</Link>
          </>
        }
      />

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* Left column. Both columns stretch to the same height; the last card in each fills the rest. */}
        <div className="flex min-w-0 flex-col gap-5">
          <div className="grid gap-4 md:grid-cols-3">
            <Kpi label="Views" icon="views" value={fmt(sum(cur, viewsOf))} cur={sum(cur, viewsOf)} prev={sum(prev, viewsOf)} />
            <Kpi label="Interactions" icon="heart" value={fmt(sum(cur, actsOf))} cur={sum(cur, actsOf)} prev={sum(prev, actsOf)} />
            <Kpi label="Published posts" icon="send" value={fmt(cur.length)} cur={cur.length} prev={prev.length} />
          </div>

          {/* Engagement chart */}
          <section className="card p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="section-title">Engagement statistic</h3>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-[30px] font-semibold leading-none tracking-[-0.03em] tabular-nums">{fmt(totalActs)}</span>
                  <span className="text-sm text-slate-500">interactions</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-400">
                  Last 30 days <Delta cur={totalActs} prev={sum(prev, actsOf)} />
                </div>
              </div>
              <span className="chip py-1 pl-2.5 pr-3"><Icon name="calendar" size={12} /> Weekly · last 8 weeks</span>
            </div>

            <div className="relative mt-6 grid grid-cols-[44px_1fr] gap-3">
              <div className="flex h-60 flex-col justify-between pb-7 text-right text-[11px] tabular-nums text-slate-400">
                {[top, (top * 3) / 4, top / 2, top / 4, 0].map((v) => <span key={v} className="-translate-y-1/2">{fmt(Math.round(v))}</span>)}
              </div>
              <div className="relative h-60">
                <div aria-hidden className="absolute inset-x-0 top-0 bottom-7 flex flex-col justify-between">
                  {[0, 1, 2, 3, 4].map((i) => <div key={i} className="border-t border-dashed border-slate-200" />)}
                </div>
                <div className="relative flex h-full items-end gap-3 sm:gap-4">
                  {weeks.map((w, i) => {
                    const last = i === weeks.length - 1;
                    const h = (w.acts / top) * 100;
                    return (
                      <div key={w.label} className="group flex h-full flex-1 flex-col items-center">
                        <div className="relative flex w-full flex-1 items-end justify-center">
                          <div className="absolute inset-x-0 bottom-0 top-0 rounded-xl bg-slate-100/70" />
                          <div className={`relative w-full rounded-xl transition ${last ? "bg-linear-to-b from-brand-400 to-brand-600 shadow-[0_6px_16px_rgba(32,104,229,0.3)]" : "bg-linear-to-b from-brand-200 to-brand-300/80 group-hover:from-brand-300 group-hover:to-brand-400"}`}
                            style={{ height: `${w.acts ? Math.max(h, 3) : 0}%` }} />
                          <div className={`pointer-events-none absolute bottom-full z-10 mb-2 w-36 rounded-xl border border-slate-200 bg-white p-2.5 text-left shadow-[0_8px_24px_rgba(18,19,22,0.12)] ${last && w.acts ? "block" : "hidden group-hover:block"}`}
                            style={{ bottom: `${Math.max(h, 3)}%` }}>
                            <div className="text-[11px] font-semibold text-slate-900">Week of {w.label}</div>
                            <div className="mt-1.5 flex justify-between text-[11px] text-slate-500"><span>Reach</span><span className="font-medium text-slate-900">{fmt(w.reach)}</span></div>
                            <div className="flex justify-between text-[11px] text-slate-500"><span>Interactions</span><span className="font-medium text-slate-900">{fmt(w.acts)}</span></div>
                            <div className="flex justify-between text-[11px] text-slate-500"><span>Posts</span><span className="font-medium text-slate-900">{w.posts}</span></div>
                          </div>
                        </div>
                        <span className={`mt-2 h-5 text-[11px] ${last ? "font-semibold text-slate-900" : "text-slate-400"}`}>{w.label}</span>
                      </div>
                    );
                  })}
                </div>
                {peak === 0 && (
                  <div className="absolute inset-x-0 top-1/3 flex justify-center">
                    <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-500 shadow-sm">
                      Numbers appear after your first published posts and the nightly update.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Top performing posts */}
          <section className="card flex flex-1 flex-col overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
              <h3 className="section-title">Top performing posts</h3>
              <div className="flex gap-1 rounded-full border border-slate-200 p-1">
                {["all", "facebook", "instagram", "threads"].map((p) => (
                  <Link key={p} href={qs({ tp: p })} scroll={false}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${tpOk === p ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}>
                    {p !== "all" && <PlatformIcon platform={p as Platform} size={14} rounded="rounded-full" />}
                    {p === "all" ? "All" : platformLabel(p as Platform).replace(" Page", "")}
                  </Link>
                ))}
              </div>
            </div>
            {!topRows.length ? (
              <div className="flex flex-1 flex-col items-center justify-center border-t border-slate-100 px-6 py-12 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400"><Icon name="analytics" size={20} /></span>
                <p className="mt-3 text-sm font-medium text-slate-800">No published posts with numbers yet</p>
                <p className="mt-1 max-w-sm text-xs text-slate-500">Your best posts by engagement show here after they are published and the nightly update has run.</p>
                <Link href="/compose" className="btn-secondary mt-4"><Icon name="plus" size={14} /> Create a post</Link>
              </div>
            ) : (
            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="border-y border-slate-100 bg-slate-50/70 text-left text-xs font-medium text-slate-500">
                  <tr><th className="px-6 py-2.5">Post title</th><th className="px-3 py-2.5">Platform</th><th className="px-3 py-2.5">Date</th>
                    <th className="px-3 py-2.5 text-right">Views</th><th className="px-6 py-2.5 text-right">Engagement</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {topRows.map((r) => (
                    <tr key={r.variant_id} className="hover:bg-slate-50/70">
                      <td className="max-w-80 px-6 py-3">
                        <Link href={`/posts/${r.post_id}`} className="flex items-center gap-3 font-medium text-slate-900 hover:text-brand-700">
                          <PlatformIcon platform={r.platform} size={30} />
                          <span className="truncate">{r.post_title || "Untitled"}</span>
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-slate-600">{platformLabel(r.platform)}</td>
                      <td className="px-3 py-3 text-slate-500">{fmtDate(r.published_at)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{fmt(viewsOf(r))}</td>
                      <td className="px-6 py-3 text-right font-semibold tabular-nums">{r.engagement_rate_pct == null ? "–" : `${r.engagement_rate_pct}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
          </section>
        </div>

        {/* Right column */}
        <aside className="flex min-w-0 flex-col gap-5">
          <section className="card p-5">
            <div className="flex items-center justify-between">
              <Link href={qs({ cm: prevM })} scroll={false} className="btn-icon h-8 w-8" aria-label="Previous month"><Icon name="chevronLeft" size={16} /></Link>
              <span className="text-[14px] font-semibold">{monthLabel}</span>
              <Link href={qs({ cm: nextM })} scroll={false} className="btn-icon h-8 w-8" aria-label="Next month"><Icon name="chevronRight" size={16} /></Link>
            </div>
            <div className="mt-4 grid grid-cols-7 gap-y-1 text-center">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <span key={d} className="pb-1.5 text-[11px] font-medium text-slate-400">{d}</span>)}
              {cells.map((c) => {
                const posted = !c.out && postedDays.has(c.key);
                const isToday = !c.out && c.key === today.key;
                return (
                  <span key={c.key} className="flex justify-center">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full text-[12.5px] tabular-nums ${c.out ? "text-slate-300"
                      : posted ? "bg-linear-to-b from-brand-400 to-brand-600 font-semibold text-white shadow-[0_3px_8px_rgba(32,104,229,0.3)]"
                      : isToday ? "font-semibold text-slate-900 ring-2 ring-slate-900" : "text-slate-700"}`}
                      title={posted ? "Posts published this day" : undefined}>{c.n}</span>
                  </span>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand-500" /> Published</span>
              <Link href="/calendar" className="font-medium text-slate-700 hover:text-brand-700">Open calendar</Link>
            </div>
          </section>

          {doneCount < steps.length && (
            <section className="card p-5">
              <div className="flex items-center justify-between">
                <h3 className="section-title">Get set up</h3>
                <span className="text-xs font-medium tabular-nums text-slate-500">{doneCount}/{steps.length}</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-linear-to-r from-brand-400 to-brand-600" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
              </div>
              <ul className="mt-4 space-y-1">
                {steps.map((s) => (
                  <li key={s.title}>
                    <Link href={s.href} className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-50">
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${s.done ? "bg-emerald-500 text-white" : "border-2 border-slate-200"}`}>
                        {s.done && <Icon name="check" size={11} strokeWidth={3} />}
                      </span>
                      <span className={`flex-1 text-[13px] ${s.done ? "text-slate-400 line-through" : "font-medium text-slate-800"}`}>{s.title}</span>
                      <span className="text-[11px] text-slate-400">{s.note}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card flex flex-1 flex-col p-5">
            <div className="flex items-center justify-between">
              <h3 className="section-title">Latest posts</h3>
              <Link href="/compose" className="btn-icon h-8 w-8" aria-label="New post"><Icon name="plus" size={16} /></Link>
            </div>
            <div className="mt-4 flex flex-1 flex-col gap-3">
              {latest.map((p) => {
                const first = p.post_variants[0];
                return (
                  <Link key={p.id} href={`/posts/${p.id}`} className="block rounded-xl border border-slate-200/80 p-3.5 transition hover:border-slate-300 hover:shadow-[0_2px_8px_rgba(18,19,22,0.05)]">
                    <div className="flex items-start gap-2.5">
                      {first ? <PlatformIcon platform={first.platform} size={34} rounded="rounded-[10px]" /> : (
                        <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-slate-100 text-slate-400"><Icon name="file" size={16} /></span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[13px] font-semibold text-slate-900">{first ? platformLabel(first.platform) : "No platforms"}</span>
                          <span className="shrink-0 text-[11px] text-slate-400">{fmtDate(p.created_at)}</span>
                        </div>
                        <div className="mt-1 flex gap-1">
                          {p.post_variants.slice(0, 7).map((v) => <span key={v.id} className={`h-1.5 w-4 rounded-full ${STATUS_DOT[v.status]}`} title={`${platformLabel(v.platform)}: ${v.status}`} />)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 rounded-lg bg-slate-50 p-2.5">
                      <div className="truncate text-[13px] font-semibold text-slate-900">{p.title || p.master_text.slice(0, 60)}</div>
                      <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-500">{p.master_text}</p>
                    </div>
                  </Link>
                );
              })}
              {!latest.length && (
                <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center">
                  <Icon name="inbox" size={20} className="text-slate-400" />
                  <p className="mt-2 text-[13px] font-medium text-slate-700">No posts yet</p>
                  <p className="mt-0.5 text-xs text-slate-500">Write one, or let Claude draft it.</p>
                </div>
              )}
            </div>
            <Link href="/posts" className="btn-primary mt-4 w-full py-2.5">View all posts</Link>
          </section>
        </aside>
      </div>
    </>
  );
}
