"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { claudeJobStatus, stopClaudeJob } from "@/app/actions";
import { Icon, type IconName } from "./icons";
import { Panel } from "./ui";
import type { JobView, LocalClaude } from "@/lib/claude-local";

// Where "Draft with Claude" runs: the Claude app in the browser, or Claude Code on this PC
export type RunMode = "app" | "terminal" | "background";

const MODES: { id: RunMode; label: string; icon: IconName; hint: string }[] = [
  { id: "app", label: "Claude app", icon: "globe",
    hint: "Opens claude.ai in your browser. The chat is saved in your Claude chat history." },
  { id: "terminal", label: "Terminal window", icon: "code",
    hint: "Opens a terminal on this PC with Claude Code already working on it. You can reply to it there. Not added to your claude.ai chat history." },
  { id: "background", label: "Background", icon: "clock",
    hint: "Claude Code works on this PC without a window and the progress shows here. Not added to your claude.ai chat history." },
];

export const RUN_LABEL: Record<RunMode, string> = { app: "Open in Claude", terminal: "Open in terminal", background: "Run in background" };

export function RunModePicker({ value, onChange, local }: { value: RunMode; onChange: (m: RunMode) => void; local: LocalClaude }) {
  const status = (m: RunMode) => (m === "app" ? { available: true, reason: undefined } : local[m]);
  const current = MODES.find((m) => m.id === value)!;
  return (
    <div>
      <span className="label">Run Claude in</span>
      <div className="grid gap-1 rounded-2xl bg-slate-100 p-1 sm:grid-cols-3" role="radiogroup" aria-label="Run Claude in">
        {MODES.map((m) => {
          const st = status(m.id);
          const on = m.id === value;
          return (
            <button key={m.id} type="button" role="radio" aria-checked={on} disabled={!st.available} onClick={() => onChange(m.id)}
              title={st.available ? m.hint : st.reason}
              className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium transition disabled:cursor-not-allowed disabled:opacity-45 ${on ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
              <Icon name={m.icon} size={14} /> {m.label}
            </button>
          );
        })}
      </div>
      <p className="hint">{current.hint}</p>
      {(!local.terminal.available || !local.background.available) && (
        <p className="hint text-slate-400">
          {local.background.available ? local.terminal.reason : `Terminal and Background: ${local.background.reason}`}
        </p>
      )}
    </div>
  );
}

const STATUS_TEXT: Record<JobView["status"], string> = { running: "Working", done: "Finished", failed: "Failed", stopped: "Stopped" };

// Live progress of a background run (polls the server every 2 seconds while it runs)
export function BackgroundRun({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const [job, setJob] = useState<JobView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const r = await claudeJobStatus(jobId);
      if (!alive) return;
      if (!r.ok) setError(r.error);
      else if (!r.job) setError("This run is no longer known (the dashboard was restarted). Your drafts, if any, are in Posts.");
      else {
        setJob(r.job);
        if (r.job.status === "running") timer = setTimeout(tick, 2000);
      }
    };
    tick();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [jobId]);

  const running = job?.status === "running";
  const secs = job ? Math.round(((job.endedAt ?? Date.now()) - job.startedAt) / 1000) : 0;
  const tone = !job || running ? "text-clay-700" : job.status === "done" ? "text-emerald-700" : "text-rose-700";

  return (
    <Panel
      title="Claude in the background"
      desc={job ? `${STATUS_TEXT[job.status]} · ${secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`}` : "Starting..."}
      action={running ? (
        <button type="button" className="btn-ghost btn-sm" disabled={stopping}
          onClick={async () => { setStopping(true); await stopClaudeJob(jobId); setStopping(false); }}>
          {stopping ? "Stopping..." : "Stop"}
        </button>
      ) : (
        <button type="button" className="btn-icon h-7 w-7" onClick={onClose} aria-label="Close"><Icon name="close" size={13} /></button>
      )}
    >
      <div className="space-y-3 px-6 py-5">
        {error && <p className="text-[13px] text-rose-700">{error}</p>}
        {job && (
          <ol className="space-y-1.5">
            {job.steps.map((s, i) => {
              const last = i === job.steps.length - 1;
              return (
                <li key={`${i}-${s}`} className="flex items-center gap-2.5 text-[13px] text-slate-700">
                  {last && running
                    ? <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-clay-500" />
                    : <Icon name="check" size={12} strokeWidth={3} className="shrink-0 text-emerald-600" />}
                  {s}
                </li>
              );
            })}
          </ol>
        )}
        {job?.error && <p className={`whitespace-pre-wrap break-words text-[13px] ${tone}`}>{job.error}</p>}
        {job?.status === "done" && job.result && (
          <p className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-700 ring-1 ring-inset ring-slate-200">{job.result}</p>
        )}
        {job && job.postIds.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {job.postIds.map((id, i) => (
              <Link key={id} href={`/posts/${id}`} className="btn-primary btn-sm">Open draft{job.postIds.length > 1 ? ` ${i + 1}` : ""}</Link>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}
