"use client";
import AlertsMenu, { type Alert } from "./AlertsMenu";
import { Logo } from "./Sidebar";
import { Icon } from "./icons";

// Phone and tablet only. On desktop everything lives in the sidebar, so pages start at the top.
export default function TopBar({ onMenu, alerts }: { onMenu: () => void; alerts: Alert[] }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur lg:hidden">
      <button type="button" className="btn-icon h-9 w-9" onClick={onMenu} aria-label="Open menu"><Icon name="menu" size={18} /></button>
      <Logo />
      <div className="ml-auto"><AlertsMenu alerts={alerts} /></div>
    </header>
  );
}
