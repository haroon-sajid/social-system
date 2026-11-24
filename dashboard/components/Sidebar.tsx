"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";
import AlertsMenu, { type Alert } from "./AlertsMenu";

type Item = { href: string; label: string; icon: IconName };
const MENU: Item[] = [
  { href: "/", label: "Overview", icon: "grid" },
  { href: "/posts", label: "Posts", icon: "posts" },
  { href: "/compose", label: "Compose", icon: "compose" },
  { href: "/calendar", label: "Calendar", icon: "calendar" },
  { href: "/analytics", label: "Analytics", icon: "analytics" },
  { href: "/insights", label: "Insights", icon: "insights" },
];
const GENERAL: Item[] = [
  { href: "/settings", label: "Settings", icon: "settings" },
  { href: "/settings?tab=claude", label: "Claude API", icon: "code" },
];

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white shadow-[0_2px_6px_rgba(32,104,229,0.35)]">
        <Icon name="logo" size={15} strokeWidth={2.2} />
      </span>
      <span className="text-[17px] font-semibold tracking-[-0.01em] text-slate-900">Social Hub</span>
    </Link>
  );
}

const initials = (name: string, fallback = "S") =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || fallback;

export default function Sidebar({ open, onClose, authDisabled, attention, who, alerts, signOut }: {
  open: boolean; onClose: () => void; authDisabled: boolean; attention: number;
  who: { name: string; detail: string }; alerts: Alert[]; signOut: () => Promise<void>;
}) {
  const path = usePathname();
  const isActive = (href: string) => {
    if (href.includes("#")) return false;
    if (href === "/") return path === "/";
    return path === href || path.startsWith(`${href}/`);
  };

  const link = (n: Item) => {
    const on = isActive(n.href);
    return (
      <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined}
        className={`group flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] transition-colors ${on
          ? "bg-slate-200/80 font-semibold text-slate-900"
          : "text-slate-500 hover:bg-slate-100/70 hover:text-slate-900"}`}>
        <Icon name={n.icon} size={17} strokeWidth={on ? 2.1 : 1.8} className={on ? "text-brand-600" : "text-slate-400 group-hover:text-slate-600"} />
        <span className="flex-1">{n.label}</span>
        {n.href === "/posts" && attention > 0 && (
          <span className="rounded-full bg-clay-100 px-1.5 py-px text-[10.5px] font-semibold text-clay-700" title="Failed or waiting to be posted by hand">{attention}</span>
        )}
      </Link>
    );
  };

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-[2px] lg:hidden" onClick={onClose} />}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200/80 bg-white transition-transform duration-200 lg:translate-x-0 ${open ? "translate-x-0 shadow-2xl" : "-translate-x-full"}`}>
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-5">
          <Logo />
          <div className="hidden lg:block"><AlertsMenu alerts={alerts} placement="side" /></div>
          <button type="button" className="btn-icon h-8 w-8 lg:hidden" onClick={onClose} aria-label="Close menu"><Icon name="close" size={16} /></button>
        </div>

        <form action="/posts" role="search" className="shrink-0 px-4 pb-2">
          <div className="relative">
            <Icon name="search" size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input name="q" type="search" placeholder="Search posts" aria-label="Search posts"
              className="h-9 w-full rounded-full border border-slate-200 bg-slate-50 pl-9 pr-3 text-[13px] outline-none transition placeholder:text-slate-400 focus:border-brand-300 focus:bg-white focus:ring-4 focus:ring-brand-500/10" />
          </div>
        </form>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <div className="eyebrow px-1 pb-2 pt-3">Menu</div>
          <nav className="space-y-0.5" aria-label="Main">{MENU.map(link)}</nav>

          <div className="eyebrow px-1 pb-2 pt-5">General</div>
          <nav className="space-y-0.5" aria-label="General">{GENERAL.map(link)}</nav>
        </div>

        <div className="shrink-0 space-y-3 border-t border-slate-100 p-4">
          <div className="rounded-2xl border border-brand-100 bg-linear-to-b from-brand-50 to-white p-3.5">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-900">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-brand-600 ring-1 ring-brand-100"><Icon name="sparkles" size={13} /></span>
              Let Claude draft for you
            </div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-500">Your Claude agent can fill in every field of a post through the API.</p>
            <Link href="/settings?tab=claude" className="btn-primary btn-sm mt-2.5 w-full py-2"><Icon name="code" size={13} /> Connect Claude</Link>
          </div>

          <div className="flex items-center gap-2.5 px-1">
            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-brand-400 to-brand-700 text-[11px] font-semibold text-white">
              {initials(who.name, "A")}
              {authDisabled && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white" title="Login is off (local only)" />}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[13px] font-semibold text-slate-900">{who.name}</span>
              <span className="block truncate text-[11px] text-slate-500"
                title={authDisabled ? "AUTH_DISABLED=true in .env.local. Set it to false to turn the login back on." : undefined}>
                {authDisabled ? "Login off · local only" : who.detail}
              </span>
            </span>
            {!authDisabled && (
              <form action={signOut}>
                <button className="btn-icon h-8 w-8" aria-label="Sign out" title="Sign out"><Icon name="logout" size={15} /></button>
              </form>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
