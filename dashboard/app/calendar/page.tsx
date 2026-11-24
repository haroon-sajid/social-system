import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Icon, PlatformIcon } from "@/components/icons";
import { PageHeader } from "@/components/ui";
import { STATUS_DOT, STATUS_LABEL, platformLabel, type Platform, type VariantStatus } from "@/lib/platforms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Calendar" };

const TZ = "Asia/Karachi"; // UTC+5, no daylight saving
const OFFSET = 5 * 3600_000;
const DAY = 864e5;
const HOUR_PX = 76;
const CARD_PX = 74;

type Row = {
  id: string; post_id: string; platform: Platform; account_id: string | null; status: VariantStatus; scheduled_at: string | null;
  published_at: string | null; posts: { title: string | null; master_text: string } | null;
};
type Ev = Row & { key: string; minutes: number; time: string };

function pkt(d: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
    .formatToParts(d).map((x) => [x.type, x.value]));
  const h = Number(p.hour) % 24, m = Number(p.minute);
  return { key: `${p.year}-${p.month}-${p.day}`, month: `${p.year}-${p.month}`, minutes: h * 60 + m };
}
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);
const clock = (min: number) => { const h = Math.floor(min / 60), m = min % 60; return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
const hourLabel = (h: number) => `${((h + 11) % 12) + 1} ${h < 12 ? "AM" : "PM"}`;

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; d?: string; m?: string }> }) {
  const sp = await searchParams;
  const view = sp.view === "month" ? "month" : "week";
  const nowP = pkt(new Date());
  const supabase = await createClient();

  // Range in "PKT days as UTC dates"
  let startDay: number, days: number, y = 0, mo = 0;
  if (view === "week") {
    const anchor = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : nowP.key;
    const a = Date.UTC(+anchor.slice(0, 4), +anchor.slice(5, 7) - 1, +anchor.slice(8, 10));
    startDay = a - ((new Date(a).getUTCDay() + 6) % 7) * DAY; // Monday
    days = 7;
  } else {
    [y, mo] = (sp.m && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : nowP.month).split("-").map(Number);
    startDay = Date.UTC(y, mo - 1, 1);
    days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  }
  const s = new Date(startDay - OFFSET).toISOString();
  const e = new Date(startDay + days * DAY - OFFSET).toISOString();

  const [{ data }, accounts] = await Promise.all([
    supabase.from("post_variants")
      .select("id,post_id,platform,account_id,status,scheduled_at,published_at,posts(title,master_text)")
      .or(`and(scheduled_at.gte.${s},scheduled_at.lt.${e}),and(published_at.gte.${s},published_at.lt.${e})`)
      .limit(1000),
    supabase.from("accounts").select("id,platform,display_name").eq("is_active", true).order("created_at"),
  ]);
  // The version's own account (each Facebook Page by name), else the platform's first account
  const nameOf = (ev: Pick<Row, "platform" | "account_id">) => {
    const list = accounts.data ?? [];
    const platform = ev.platform === "facebook_group" ? "facebook" : ev.platform;
    return (list.find((a) => a.id === ev.account_id) ?? list.find((a) => a.platform === platform))?.display_name ?? platformLabel(ev.platform);
  };

  const byDay = new Map<string, Ev[]>();
  for (const r of (data ?? []) as unknown as Row[]) {
    const when = r.status === "published" ? r.published_at : r.scheduled_at ?? r.published_at;
    if (!when) continue;
    const t = pkt(new Date(when));
    byDay.set(t.key, [...(byDay.get(t.key) ?? []), { ...r, key: t.key, minutes: t.minutes, time: clock(t.minutes) }]);
  }
  for (const list of byDay.values()) list.sort((a, b) => a.minutes - b.minutes);
  const total = [...byDay.values()].reduce((n, l) => n + l.length, 0);

  // Navigation
  const fmtShort = (t: number, withYear = false) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
  const range = view === "week"
    ? `${fmtShort(startDay)} – ${fmtShort(startDay + 6 * DAY, true)}`
    : new Date(startDay).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const prevHref = view === "week" ? `/calendar?d=${ymd(startDay - 7 * DAY)}`
    : `/calendar?view=month&m=${mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`}`;
  const nextHref = view === "week" ? `/calendar?d=${ymd(startDay + 7 * DAY)}`
    : `/calendar?view=month&m=${mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`}`;

  return (
    <>
      <PageHeader
        title={<>Your <strong>content calendar</strong></>}
        description={`Everything published or scheduled, in Pakistan time. ${total} post${total === 1 ? "" : "s"} in this ${view}.`}
        actions={
          <>
            <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-[0_1px_2px_rgba(18,19,22,0.03)]">
              <Link href={prevHref} className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100" aria-label="Previous"><Icon name="chevronLeft" size={16} /></Link>
              <span className="flex items-center gap-1.5 px-2 text-[13px] font-medium text-slate-800"><Icon name="calendar" size={14} className="text-slate-400" />{range}</span>
              <Link href={nextHref} className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100" aria-label="Next"><Icon name="chevronRight" size={16} /></Link>
            </div>
            <Link href={view === "week" ? "/calendar" : "/calendar?view=month"} className="btn-secondary">Today</Link>
            <div className="flex rounded-full bg-slate-200/60 p-1">
              {(["week", "month"] as const).map((v) => (
                <Link key={v} href={v === "week" ? "/calendar" : "/calendar?view=month"}
                  className={`rounded-full px-3.5 py-1 text-[13px] font-medium capitalize transition ${view === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{v}</Link>
              ))}
            </div>
          </>
        }
      />

      {view === "week" ? <WeekView startDay={startDay} byDay={byDay} todayKey={nowP.key} nowMin={nowP.minutes} nameOf={nameOf} />
        : <MonthView y={y} mo={mo} byDay={byDay} todayKey={nowP.key} />}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        {(["published", "failed", "scheduled", "publishing"] as VariantStatus[]).map((st) => (
          <span key={st} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${STATUS_DOT[st]}`} />{STATUS_LABEL[st]}</span>
        ))}
      </div>
    </>
  );
}

function WeekView({ startDay, byDay, todayKey, nowMin, nameOf }: {
  startDay: number; byDay: Map<string, Ev[]>; todayKey: string; nowMin: number; nameOf: (ev: Pick<Row, "platform" | "account_id">) => string;
}) {
  const cols = Array.from({ length: 7 }, (_, i) => {
    const t = startDay + i * DAY;
    return { key: ymd(t), dow: new Date(t).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }), n: new Date(t).getUTCDate(), weekend: i >= 5 };
  });
  const all = cols.flatMap((c) => byDay.get(c.key) ?? []);
  const first = Math.min(8, ...all.map((ev) => Math.floor(ev.minutes / 60)));
  const last = Math.max(20, ...all.map((ev) => Math.ceil((ev.minutes + 50) / 60)));
  const hours = Array.from({ length: Math.min(24, last) - first }, (_, i) => first + i);

  // Place cards by time; push a card down if it would overlap the one above
  const placed = new Map<string, { ev: Ev; top: number }[]>();
  let bottom = hours.length * HOUR_PX;
  for (const c of cols) {
    let prev = -Infinity;
    const list = (byDay.get(c.key) ?? []).map((ev) => {
      const top = Math.max(((ev.minutes - first * 60) / 60) * HOUR_PX + 4, prev + 6);
      prev = top + CARD_PX;
      return { ev, top };
    });
    bottom = Math.max(bottom, prev + 8);
    placed.set(c.key, list);
  }
  const showNow = cols.some((c) => c.key === todayKey) && nowMin >= first * 60 && nowMin <= last * 60;

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(18,19,22,0.03)]">
      <div className="min-w-[920px]">
        <div className="grid grid-cols-[72px_repeat(7,minmax(0,1fr))] border-b border-slate-100">
          <div className="flex items-end px-3 pb-3 pt-4 text-[11px] font-medium text-slate-400">GMT+5</div>
          {cols.map((c) => {
            const today = c.key === todayKey;
            return (
              <div key={c.key} className="flex items-center gap-2 px-3 pb-3 pt-4 text-[13px]">
                <span className={today ? "font-semibold text-slate-900" : "text-slate-500"}>{c.dow}</span>
                <span className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1 font-semibold tabular-nums ${today ? "bg-brand-600 text-white shadow-[0_3px_8px_rgba(32,104,229,0.3)]" : "text-slate-900"}`}>{c.n}</span>
              </div>
            );
          })}
        </div>
        <div className="relative grid grid-cols-[72px_repeat(7,minmax(0,1fr))]" style={{ height: bottom }}>
          {/* Hour labels and lines */}
          <div className="relative">
            {hours.map((h, i) => (
              <span key={h} className="absolute right-3 -translate-y-1/2 text-[11px] font-medium text-slate-400" style={{ top: i * HOUR_PX + (i === 0 ? 10 : 0) }}>{hourLabel(h)}</span>
            ))}
          </div>
          <div aria-hidden className="pointer-events-none absolute inset-y-0 left-[72px] right-0">
            {hours.map((h, i) => <div key={h} className="absolute inset-x-0 border-t border-dashed border-slate-100" style={{ top: i * HOUR_PX }} />)}
          </div>
          {cols.map((c) => (
            <div key={c.key} className={`relative border-l border-slate-100 ${c.weekend ? "bg-slate-50/60" : ""} ${c.key === todayKey ? "bg-brand-50/30" : ""}`}>
              {c.key === todayKey && showNow && (
                <div className="absolute inset-x-0 z-10 flex items-center" style={{ top: ((nowMin - first * 60) / 60) * HOUR_PX }}>
                  <span className="-ml-1 h-2 w-2 rounded-full bg-brand-600" /><span className="h-px flex-1 bg-brand-600" />
                </div>
              )}
              {(placed.get(c.key) ?? []).map(({ ev, top }) => (
                <Link key={ev.id} href={`/posts/${ev.post_id}`} style={{ top, height: CARD_PX }}
                  title={`${platformLabel(ev.platform)} · ${STATUS_LABEL[ev.status]} · ${ev.time}`}
                  className="absolute inset-x-1.5 z-[5] flex flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white p-2 shadow-[0_2px_6px_rgba(18,19,22,0.06)] transition hover:border-slate-300 hover:shadow-[0_6px_16px_rgba(18,19,22,0.1)]">
                  <span className="flex items-center gap-1.5">
                    <PlatformIcon platform={ev.platform} size={18} rounded="rounded-full" />
                    <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-900">{nameOf(ev)}</span>
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[ev.status]}`} />
                  </span>
                  <span className="mt-1 line-clamp-1 text-[11.5px] leading-snug text-slate-700">{ev.posts?.title || ev.posts?.master_text}</span>
                  <span className="mt-auto inline-flex w-fit items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                    <Icon name="clock" size={10} /> {ev.time}
                  </span>
                </Link>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MonthView({ y, mo, byDay, todayKey }: { y: number; mo: number; byDay: Map<string, Ev[]>; todayKey: string }) {
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const firstDow = (new Date(Date.UTC(y, mo - 1, 1)).getUTCDay() + 6) % 7; // Monday first
  const trailing = (7 - ((firstDow + daysInMonth) % 7)) % 7;
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(18,19,22,0.03)]">
      <div className="grid min-w-[820px] grid-cols-7">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="border-b border-slate-100 px-3 py-3 text-[12px] font-medium text-slate-500">{d}</div>
        ))}
        {Array.from({ length: firstDow }).map((_, i) => <div key={`b${i}`} className="min-h-32 border-b border-r border-slate-100 bg-slate-50/50" />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const key = `${y}-${String(mo).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
          const items = byDay.get(key) ?? [];
          const isToday = key === todayKey;
          const col = (firstDow + i) % 7;
          return (
            <div key={key} className={`min-h-32 border-b border-slate-100 p-2 ${col < 6 ? "border-r" : ""} ${col >= 5 ? "bg-slate-50/50" : ""}`}>
              <span className={`mb-1.5 flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-semibold tabular-nums ${isToday ? "bg-brand-600 text-white" : "text-slate-600"}`}>{i + 1}</span>
              <div className="space-y-1">
                {items.slice(0, 3).map((it) => (
                  <Link key={it.id} href={`/posts/${it.post_id}`} title={`${platformLabel(it.platform)} · ${STATUS_LABEL[it.status]} · ${it.time}`}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white px-1.5 py-1 text-[11px] text-slate-700 shadow-[0_1px_2px_rgba(18,19,22,0.04)] hover:border-slate-300">
                    <PlatformIcon platform={it.platform} size={14} rounded="rounded-full" />
                    <span className="shrink-0 font-medium tabular-nums text-slate-400">{it.time.replace(/ (AM|PM)/, (m) => m.toLowerCase().trim())}</span>
                    <span className="truncate">{it.posts?.title || it.posts?.master_text?.slice(0, 40)}</span>
                  </Link>
                ))}
                {items.length > 3 && <span className="block px-1 text-[11px] font-medium text-slate-400">+{items.length - 3} more</span>}
              </div>
            </div>
          );
        })}
        {Array.from({ length: trailing }).map((_, i) => (
          <div key={`a${i}`} className={`min-h-32 border-b border-slate-100 bg-slate-50/50 ${(firstDow + daysInMonth + i) % 7 < 6 ? "border-r" : ""}`} />
        ))}
      </div>
    </div>
  );
}
