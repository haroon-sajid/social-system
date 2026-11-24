"use client";
import { useTransition } from "react";
import { dismissAlert } from "@/app/actions";
import { Icon } from "./icons";

export default function AlertBar({ alerts }: { alerts: { id: string; platform: string; message: string }[] }) {
  const [pending, start] = useTransition();
  if (!alerts.length) return null;
  return (
    <div className="px-5 pt-5 sm:px-8">
      <div className="space-y-2 rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-3">
        {alerts.map((a) => (
          <div key={a.id} className="flex items-start gap-3 text-[13px] text-rose-900" role="alert">
            <Icon name="alert" size={17} className="mt-px shrink-0 text-rose-600" />
            <span className="rounded-full bg-white px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-rose-700 ring-1 ring-rose-200">{a.platform}</span>
            <span className="min-w-0 flex-1 break-words">{a.message}</span>
            <button type="button" disabled={pending} onClick={() => start(async () => { await dismissAlert(a.id); })}
              className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50">
              Dismiss
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
