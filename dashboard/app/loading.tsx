// Shown while a page loads: a calm skeleton instead of a blank screen
export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="mb-8 space-y-3">
        <div className="h-8 w-48 rounded-lg bg-slate-200/80" />
        <div className="h-4 w-96 max-w-full rounded bg-slate-200/60" />
      </div>
      <div className="mb-5 h-16 rounded-xl bg-slate-200/60" />
      <div className="space-y-px overflow-hidden rounded-xl border border-slate-200 bg-white">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-5">
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 rounded bg-slate-200/80" />
              <div className="h-3 w-2/3 rounded bg-slate-100" />
            </div>
            <div className="flex gap-2">{Array.from({ length: 4 }).map((__, j) => <div key={j} className="h-7 w-7 rounded-lg bg-slate-200/70" />)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
