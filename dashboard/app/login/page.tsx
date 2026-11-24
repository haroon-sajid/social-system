"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Icon, PlatformIcon } from "@/components/icons";
import { Callout } from "@/components/ui";
import type { Platform } from "@/lib/platforms";

const SHOWN: Platform[] = ["facebook", "instagram", "threads", "linkedin", "x", "reddit"];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setError(error.message);
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="grid min-h-screen bg-paper p-3 lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden rounded-3xl bg-linear-to-br from-brand-500 via-brand-600 to-brand-800 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/15 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 left-10 h-80 w-80 rounded-full bg-clay-400/30 blur-3xl" />
        <div className="relative flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-brand-600"><Icon name="logo" size={17} strokeWidth={2.2} /></span>
          <span className="text-lg font-semibold">Social Hub</span>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-[40px] font-semibold leading-[1.1] tracking-[-0.03em]">Write once.<br /><span className="text-white/70">Shape it for every feed.</span></h1>
          <p className="mt-4 text-[15px] leading-relaxed text-white/75">Draft with Claude, preview every platform in its own look, and publish when it reads right.</p>
          <div className="mt-8 flex -space-x-2">
            {SHOWN.map((p) => <PlatformIcon key={p} platform={p} size={36} rounded="rounded-full" className="ring-[3px] ring-brand-600" />)}
          </div>
        </div>
        <p className="relative text-xs text-white/55">Nothing is posted until you press Publish.</p>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-10 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-white"><Icon name="logo" size={17} strokeWidth={2.2} /></span>
            <span className="text-lg font-semibold">Social Hub</span>
          </div>
          <h2 className="text-[28px] font-medium tracking-[-0.025em] text-slate-400">Welcome <strong className="font-semibold text-slate-900">back</strong></h2>
          <p className="mt-1 text-sm text-slate-500">Sign in with the account you created in Supabase.</p>
          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input id="password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <Callout tone="danger">{error}</Callout>}
            <button className="btn-primary w-full py-2.5" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>
          </form>
        </div>
      </section>
    </div>
  );
}
