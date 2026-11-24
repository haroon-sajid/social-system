"use client";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import AlertBar from "./AlertBar";
import type { Alert } from "./AlertsMenu";

// Sidebar + page area. Desktop has no top bar (search, alerts and profile are in the sidebar),
// so pages start right at the top. Phones get a slim bar with the menu button.
export default function AppShell({ children, alerts, attention, who, authDisabled, signOut }: {
  children: ReactNode; alerts: Alert[]; attention: number;
  who: { name: string; detail: string }; authDisabled: boolean; signOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);

  return (
    <div className="min-h-screen lg:pl-64">
      <Sidebar open={open} onClose={() => setOpen(false)} authDisabled={authDisabled} attention={attention}
        who={who} alerts={alerts} signOut={signOut} />
      <div className="flex min-h-screen flex-col">
        <TopBar onMenu={() => setOpen(true)} alerts={alerts} />
        <AlertBar alerts={alerts} />
        {/* Fluid width: cards stretch with the window, no empty gutters on wide screens */}
        <main className="w-full flex-1 px-5 pb-10 pt-5 sm:px-8 lg:pt-7">{children}</main>
      </div>
    </div>
  );
}
