import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Icon, PlatformIcon } from "@/components/icons";
import { EmptyState, PageHeader, StatTile } from "@/components/ui";
import { contentTypeLabel, platformLabel, type Platform } from "@/lib/platforms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Analytics" };

type Row = {
  variant_id: string; post_id: string; post_title: string | null; content_type: string | null; platform: Platform;
  published_at: string; platform_post_url: string | null; publish_hour_pkt: number | null;
  likes: number | null; comments: number | null; shares: number | null; saves: number | null;
  views: number | null; reach: number | null; impressions: number | null; engagement_rate_pct: number | null;
};

const sum = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);
const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null;
};
const fmt = (n: number | null | undefined) => (n == null ? "–" : Intl.NumberFormat("en", { notation: n >= 10000 ? "compact" : "standard" }).format(n));
const viewsOf = (r: Row) => r.views ?? r.impressions ?? r.reach;

// Single-series ranked bar list: one hue, thin rounded bars, value label, hover tooltip
function BarList({ items, unit, empty }: { items: { label: string; value: number; posts: number }[]; unit: string; empty: string }) {
  if (!items.length) return <p className="py-6 text-center text-sm text-slate-500">{empty}</p>;
  const max = Math.max(...items.map((i) => i.value), 0.0001);
  return (
    <ul className="space-y-2.5">
      {items.map((i) => (
        <li key={i.label} className="group grid grid-cols-[120px_1fr_64px] items-center gap-3 rounded-md px-1 py-0.5 text-sm hover:bg-slate-50"
          title={`${i.label}: ${i.value}${unit} average across ${i.posts} post${i.posts === 1 ? "" : "s"}`}>
          <span className="truncate text-slate-600">{i.label} <span className="text-xs text-slate-400">({i.posts})</span></span>
          <span className="h-2 rounded-full bg-slate-100">
            <span className="block h-2 rounded-full bg-brand-500 transition group-hover:bg-brand-600" style={{ width: `${Math.max((i.value / max) * 100, i.value > 0 ? 2 : 0)}%` }} />
          </span>
          <span className="text-right font-medium tabular-nums text-slate-900">{i.value}{unit}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { days = "30" } = await searchParams;
  const d = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
  const since = new Date(Date.now() - d * 864e5).toISOString();
  const supabase = await createClient();
  const { data } = await supabase.from("v_variant_performance").select("*")
    .eq("status", "published").gte("published_at", since).order("published_at", { ascending: false });
  const rows = (data ?? []) as Row[];

  const order: Platform[] = ["facebook", "instagram", "threads", "linkedin", "x", "reddit", "facebook_group"];
  const platforms = order.filter((p) => rows.some((r) => r.platform === p));
  const byPlatform = platforms.map((p) => {
    const rs = rows.filter((r) => r.platform === p);
    return { p, posts: rs.length, likes: sum(rs.map((r) => r.likes)), comments: sum(rs.map((r) => r.comments)),
      shares: sum(rs.map((r) => r.shares)), views: sum(rs.map(viewsOf)), eng: avg(rs.map((r) => r.engagement_rate_pct)),
      measured: rs.some((r) => r.likes != null || viewsOf(r) != null) };
  });
  const totalViews = sum(rows.map(viewsOf));
  const totalEng = sum(rows.map((r) => (r.likes ?? 0) + (r.comments ?? 0) + (r.shares ?? 0) + (r.saves ?? 0)));
  const avgEng = avg(rows.map((r) => r.engagement_rate_pct));

  const types = [...new Set(rows.map((r) => r.content_type ?? "unknown"))].map((t) => {
    const rs = rows.filter((r) => (r.content_type ?? "unknown") === t);
    return { label: contentTypeLabel(t === "unknown" ? null : t), value: avg(rs.map((r) => r.engagement_rate_pct)) ?? 0, posts: rs.length };
  }).sort((a, b) => b.value - a.value);
  const hours = Array.from({ length: 24 }, (_, h) => {
    const rs = rows.filter((r) => r.publish_hour_pkt === h);
    return { label: `${String(h).padStart(2, "0")}:00`, value: avg(rs.map((r) => r.engagement_rate_pct)) ?? 0, posts: rs.length };
  }).filter((h) => h.posts > 0).sort((a, b) => b.value - a.value);
  const top = [...rows].sort((a, b) => (b.engagement_rate_pct ?? -1) - (a.engagement_rate_pct ?? -1) ||
    ((b.likes ?? 0) + (b.comments ?? 0)) - ((a.likes ?? 0) + (a.comments ?? 0))).slice(0, 10);

  return (
    <>
      <PageHeader
        title={<>How your posts <strong>perform</strong></>}
        description="Updated every night at 3:15 AM (Pakistan time). Facebook, Instagram and Threads report numbers. LinkedIn, X and Reddit show post counts only."
        actions={
          <div className="flex rounded-full bg-slate-200/60 p-1" role="group" aria-label="Time range">
            {[7, 30, 90].map((n) => (
              <Link key={n} href={`/analytics?days=${n}`} aria-current={d === n ? "true" : undefined}
                className={`rounded-full px-3.5 py-1 text-[13px] font-medium transition ${d === n ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                {n} days
              </Link>
            ))}
          </div>
        }
      />

      {!rows.length ? (
        <EmptyState icon="analytics" title={`No published posts in the last ${d} days`}
          description="Publish a post, then numbers appear here after the nightly update. To update now, run Social 2 in n8n."
          action={<Link href="/posts" className="btn-secondary">Go to posts</Link>} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Published" value={fmt(rows.length)} hint={`posts in ${d} days`} />
            <StatTile label="Views" value={fmt(totalViews)} hint="views, impressions or reach" />
            <StatTile label="Engagements" value={fmt(totalEng)} hint="likes, comments, shares, saves" />
            <StatTile label="Avg engagement" value={avgEng == null ? "–" : `${avgEng}%`} hint="engagements per view" />
          </div>

          <section>
            <h2 className="section-title mb-3">By platform</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {byPlatform.map((b) => (
                <div key={b.p} className="card p-4">
                  <div className="flex items-center gap-2.5">
                    <PlatformIcon platform={b.p} size={28} />
                    <span className="font-medium text-slate-900">{platformLabel(b.p)}</span>
                    <span className="ml-auto text-sm tabular-nums text-slate-500">{b.posts} post{b.posts === 1 ? "" : "s"}</span>
                  </div>
                  {b.measured ? (
                    <>
                      <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
                        {([["Views", b.views], ["Likes", b.likes], ["Comments", b.comments], ["Shares", b.shares]] as const).map(([k, val]) => (
                          <div key={k}>
                            <dd className="text-base font-semibold tabular-nums text-slate-900">{fmt(val)}</dd>
                            <dt className="text-[11px] text-slate-500">{k}</dt>
                          </div>
                        ))}
                      </dl>
                      <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
                        Avg engagement <span className="font-semibold text-slate-900">{b.eng == null ? "–" : `${b.eng}%`}</span>
                      </div>
                    </>
                  ) : (
                    <p className="mt-4 text-xs text-slate-500">No numbers from this platform. Only the post count is tracked.</p>
                  )}
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="card">
              <h2 className="section-title">Avg engagement by content type</h2>
              <p className="mb-4 text-xs text-slate-500">Which kinds of posts get the most reaction. Number of posts in brackets.</p>
              <BarList items={types.filter((t) => t.value > 0)} unit="%" empty="No engagement numbers yet." />
            </section>
            <section className="card">
              <h2 className="section-title">Avg engagement by posting hour</h2>
              <p className="mb-4 text-xs text-slate-500">Best hours first, Pakistan time.</p>
              <BarList items={hours.filter((h) => h.value > 0).slice(0, 8)} unit="%" empty="No engagement numbers yet." />
            </section>
          </div>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="section-title">Top posts</h2>
              <p className="text-xs text-slate-500">Ranked by engagement rate, then likes and comments.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                  <tr>
                    <th className="px-5 py-2.5">Post</th><th className="px-3 py-2.5">Platform</th><th className="px-3 py-2.5">Type</th>
                    <th className="px-3 py-2.5 text-right">Views</th><th className="px-3 py-2.5 text-right">Likes</th>
                    <th className="px-3 py-2.5 text-right">Comments</th><th className="px-3 py-2.5 text-right">Shares</th>
                    <th className="px-5 py-2.5 text-right">Eng. rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {top.map((r) => (
                    <tr key={r.variant_id} className="hover:bg-slate-50">
                      <td className="max-w-72 truncate px-5 py-3">
                        <Link className="font-medium text-slate-900 hover:text-brand-700" href={`/posts/${r.post_id}`}>{r.post_title || "Untitled"}</Link>
                      </td>
                      <td className="px-3 py-3">
                        <span className="flex items-center gap-2">
                          <PlatformIcon platform={r.platform} size={20} rounded="rounded-md" />
                          {r.platform_post_url ? (
                            <a className="inline-flex items-center gap-1 text-slate-700 hover:text-brand-700" target="_blank" rel="noreferrer" href={r.platform_post_url}>
                              {platformLabel(r.platform)} <Icon name="external" size={12} />
                            </a>
                          ) : platformLabel(r.platform)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-600">{contentTypeLabel(r.content_type)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{fmt(viewsOf(r))}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{fmt(r.likes)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{fmt(r.comments)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{fmt(r.shares)}</td>
                      <td className="px-5 py-3 text-right font-medium tabular-nums">{r.engagement_rate_pct == null ? "–" : `${r.engagement_rate_pct}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
