import "./globals.css";
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import { AUTH_DISABLED } from "@/lib/auth-mode";
import { signOut } from "./actions";
import AppShell from "@/components/AppShell";
import { Callout } from "@/components/ui";

const body = Geist({ subsets: ["latin"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Social Hub", template: "%s · Social Hub" },
  description: "Draft, preview and publish everywhere",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  let alerts: { id: string; platform: string; message: string }[] = [];
  let attention = 0;
  let workspace = "My workspace";
  // Login off (local only): treat the visitor as the admin
  let user: { id: string; email?: string } | null = AUTH_DISABLED ? { id: "local" } : null;
  let isAdmin = AUTH_DISABLED;
  if (!AUTH_DISABLED) {
    user = (await supabase.auth.getUser()).data.user;
    if (user) {
      const { data: admin } = await supabase.from("app_admins").select("user_id").eq("user_id", user.id).maybeSingle();
      isAdmin = !!admin;
    }
  }
  if (user && isAdmin) {
    const [a, c, acc] = await Promise.all([
      supabase.from("system_alerts").select("id,platform,message").eq("is_open", true).order("created_at", { ascending: false }),
      supabase.from("post_variants").select("id", { count: "exact", head: true }).in("status", ["failed", "manual_pending"]),
      supabase.from("accounts").select("display_name").eq("is_active", true).order("created_at").limit(1),
    ]);
    alerts = a.data ?? [];
    attention = c.count ?? 0;
    workspace = acc.data?.[0]?.display_name ?? workspace;
  }
  const who = AUTH_DISABLED
    ? { name: workspace === "My workspace" ? "Admin" : workspace, detail: "Local workspace" }
    : { name: user?.email?.split("@")[0] ?? "Admin", detail: user?.email ?? "" };

  return (
    <html lang="en" className={body.variable}>
      {/* Browser extensions (ColorZilla, Grammarly...) add attributes to <body> before React loads.
          This ignores those attribute differences on <body> only, not on anything inside it. */}
      <body suppressHydrationWarning>
        {user ? (
          <AppShell alerts={alerts} attention={attention} who={who} authDisabled={AUTH_DISABLED} signOut={signOut}>
            {isAdmin ? children : (
              <Callout tone="warning" title="Your account is signed in but is not an admin yet">
                Run this in the Supabase SQL editor, then reload:
                <code className="mt-2 block rounded-lg bg-white px-3 py-2 font-mono text-xs text-slate-800 ring-1 ring-amber-200">
                  insert into public.app_admins (user_id) values (&apos;{user.id}&apos;);
                </code>
              </Callout>
            )}
          </AppShell>
        ) : (
          <main>{children}</main>
        )}
      </body>
    </html>
  );
}
