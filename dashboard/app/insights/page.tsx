import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Icon, PlatformIcon } from "@/components/icons";
import { EmptyState, PageHeader } from "@/components/ui";
import { PLATFORMS, contentTypeLabel, type Platform } from "@/lib/platforms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Insights" };

type Suggestion = { title: string; platform: string; content_type?: string; best_hour_pkt?: number; why: string; example_post: string };
type Insight = { id: string; period_start: string; period_end: string; summary: string; suggestions: Suggestion[] | null; created_at: string };

// Gemini writes the platform name freely ("LinkedIn", "X (Twitter)"...), so match it to ours
function toPlatform(name: string): Platform | null {
  const n = name.toLowerCase();
  if (n.includes("group")) return "facebook_group";
  for (const p of PLATFORMS) if (n.includes(p.id) || n.includes(p.label.toLowerCase())) return p.id;
  if (n.includes("twitter")) return "x";
  return null;
}
const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function IdeaCard({ s }: { s: Suggestion }) {
  const p = toPlatform(s.platform);
  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-start gap-3">
        {p ? <PlatformIcon platform={p} size={32} /> : (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500"><Icon name="sparkles" size={16} /></span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-snug text-slate-900">{s.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            <span>{s.platform}</span>
            {s.content_type && <><span aria-hidden>·</span><span>{contentTypeLabel(s.content_type)}</span></>}
            {s.best_hour_pkt != null && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-700">
                <Icon name="clock" size={11} /> {String(s.best_hour_pkt).padStart(2, "0")}:00
              </span>
            )}
          </div>
        </div>
      </div>
      <p className="text-sm text-slate-600">{s.why}</p>
      <div className="flex-1 rounded-lg bg-slate-50 p-3 text-sm leading-relaxed whitespace-pre-wrap text-slate-800 ring-1 ring-inset ring-slate-200">{s.example_post}</div>
      <div className="flex flex-wrap gap-2">
        <Link className="btn-ai" href={`/claude?topic=${encodeURIComponent(`${s.title}. ${s.why}`.slice(0, 1500))}&type=${encodeURIComponent(s.content_type ?? "")}${p ? `&platforms=${p}` : ""}`}>
          <Icon name="sparkles" size={15} /> Draft with Claude
        </Link>
        <Link className="btn-secondary" href={`/compose?text=${encodeURIComponent(s.example_post)}&type=${encodeURIComponent(s.content_type ?? "")}`}>
          <Icon name="compose" size={15} /> Use this idea
        </Link>
      </div>
    </div>
  );
}

export default async function InsightsPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("insights").select("*").order("created_at", { ascending: false }).limit(8);
  const [latest, ...older] = (data ?? []) as Insight[];

  return (
    <>
      <PageHeader
        title={<>Ideas for <strong>next week</strong></>}
        description={<>Written every Monday by Gemini from the last 28 days of results (needs at least 3 published posts). For a deeper answer any time, ask Claude: &quot;check my post performance and suggest next posts&quot;.</>}
      />

      {!latest ? (
        <EmptyState icon="insights" title="No insights yet"
          description="The first report arrives on the Monday after you have 3 published posts. It runs from the Social 3 workflow in n8n." />
      ) : (
        <div className="space-y-8">
          <section className="rounded-xl border border-brand-200 bg-linear-to-br from-brand-50 to-white p-6 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-medium text-brand-700">
              <Icon name="sparkles" size={16} /> Week of {dayLabel(latest.period_start)} to {dayLabel(latest.period_end)}
            </div>
            <p className="mt-3 max-w-4xl whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800">{latest.summary}</p>
          </section>

          {(latest.suggestions ?? []).length > 0 && (
            <section>
              <h2 className="section-title mb-3">Ideas for next week</h2>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {(latest.suggestions ?? []).map((s, i) => <IdeaCard key={i} s={s} />)}
              </div>
            </section>
          )}

          {older.length > 0 && (
            <section className="space-y-3">
              <h2 className="section-title">Earlier weeks</h2>
              {older.map((ins) => (
                <details key={ins.id} className="group card p-0">
                  <summary className="flex items-center gap-3 px-5 py-4 text-sm font-medium text-slate-800">
                    <Icon name="chevronRight" size={16} className="text-slate-400 transition group-open:rotate-90" />
                    {dayLabel(ins.period_start)} to {dayLabel(ins.period_end)}
                    <span className="ml-auto text-xs font-normal text-slate-500">{(ins.suggestions ?? []).length} ideas</span>
                  </summary>
                  <div className="space-y-4 border-t border-slate-100 px-5 py-4">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{ins.summary}</p>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {(ins.suggestions ?? []).map((s, i) => <IdeaCard key={i} s={s} />)}
                    </div>
                  </div>
                </details>
              ))}
            </section>
          )}
        </div>
      )}
    </>
  );
}
