"use client";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { dismissAlert } from "@/app/actions";
import { Icon } from "./icons";

export type Alert = { id: string; platform: string; message: string };

// Bell with a dropdown of open alerts. "side" opens to the right (sidebar), "below" opens under the bell (phone bar).
export default function AlertsMenu({ alerts, placement = "below" }: { alerts: Alert[]; placement?: "side" | "below" }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <div className="relative" ref={box}>
      <button type="button" className="btn-icon relative h-8 w-8" onClick={() => setOpen((o) => !o)} aria-label={`Alerts (${alerts.length})`} aria-expanded={open}>
        <Icon name="bell" size={16} />
        {alerts.length > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />}
      </button>
      {open && (
        <div className={`absolute z-[60] w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_32px_rgba(18,19,22,0.14)] ${placement === "side" ? "left-full top-0 ml-3" : "right-0 top-10"}`}>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <span className="text-sm font-semibold">Alerts</span>
            <span className="chip">{alerts.length}</span>
          </div>
          {alerts.length ? (
            <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
              {alerts.map((a) => (
                <li key={a.id} className="flex gap-3 px-4 py-3 text-[13px]">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{a.platform}</div>
                    <p className="mt-0.5 break-words text-slate-700">{a.message}</p>
                    <button type="button" disabled={pending} onClick={() => start(async () => { await dismissAlert(a.id); })}
                      className="mt-1.5 text-xs font-medium text-brand-700 hover:underline disabled:opacity-50">Dismiss</button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              <Icon name="check" size={20} className="mx-auto mb-2 text-emerald-500" /> You are all caught up.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
