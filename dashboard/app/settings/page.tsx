import Link from "next/link";
import { headers } from "next/headers";
import { createClient, serviceKeySet } from "@/lib/supabase/server";
import { apiKeySet } from "@/lib/claude-api";
import SettingsForms, { type SettingsTab } from "@/components/SettingsForms";
import ApiReference from "@/components/ApiReference";
import { Icon, type IconName } from "@/components/icons";
import { PageHeader, Panel } from "@/components/ui";
import type { Account, GroupTarget, Rule } from "@/lib/platforms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

type Tab = SettingsTab | "claude";
const DESCRIPTIONS: Record<Tab, string> = {
  accounts: "The Facebook Page, Instagram, Threads and LinkedIn accounts the publisher posts to.",
  groups: "Facebook Groups and subreddits you post in by hand, with their rules.",
  rules: "How Claude writes for each platform. Character limits are fixed by the platforms.",
  claude: "Connect your Claude agent: check the keys, then copy a ready-made request.",
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: raw } = await searchParams;
  const tab: Tab = raw === "groups" || raw === "rules" || raw === "claude" ? raw : "accounts";

  const supabase = await createClient();
  const [accounts, groups, rules] = await Promise.all([
    supabase.from("accounts").select("*").order("platform"),
    supabase.from("group_targets").select("*").order("platform").order("name"),
    supabase.from("platform_rules").select("*").order("platform"),
  ]);
  const apiOn = apiKeySet();

  const TABS: { id: Tab; label: string; icon: IconName; count?: number; dot?: string }[] = [
    { id: "accounts", label: "Accounts", icon: "user", count: (accounts.data ?? []).length },
    { id: "groups", label: "Groups & subreddits", icon: "users", count: (groups.data ?? []).length },
    { id: "rules", label: "Platform rules", icon: "file", count: (rules.data ?? []).length },
    { id: "claude", label: "Claude API", icon: "code", dot: apiOn ? "bg-emerald-500" : "bg-amber-500" },
  ];

  return (
    <>
      <PageHeader title={<>Workspace <strong>settings</strong></>} description={DESCRIPTIONS[tab]} />

      <nav className="mb-6 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-slate-200 bg-white p-1 shadow-[0_1px_2px_rgba(18,19,22,0.03)]" role="tablist" aria-label="Settings sections">
        {TABS.map((t) => {
          const on = t.id === tab;
          return (
            <Link key={t.id} href={t.id === "accounts" ? "/settings" : `/settings?tab=${t.id}`} role="tab" aria-selected={on} scroll={false}
              className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium transition ${on ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}>
              <Icon name={t.icon} size={15} />
              {t.label}
              {t.count != null && <span className={`tabular-nums ${on ? "text-white/60" : "text-slate-400"}`}>{t.count}</span>}
              {t.dot && <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />}
            </Link>
          );
        })}
      </nav>

      {tab !== "claude" ? (
        <SettingsForms tab={tab} accounts={(accounts.data ?? []) as Account[]} groups={(groups.data ?? []) as GroupTarget[]}
          rules={(rules.data ?? []) as Rule[]} />
      ) : (
        <ClaudeTab apiOn={apiOn} />
      )}
    </>
  );
}

function StatusTile({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <div className="flex items-start gap-3 px-6 py-5">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${ok ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
        <Icon name={ok ? "check" : "alert"} size={16} strokeWidth={2.4} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13.5px] font-semibold text-slate-900">{label}</span>
          <span className={`chip ${ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{ok ? "Set" : "Not set"}</span>
        </div>
        <p className="mt-1 font-mono text-[11.5px] text-slate-500">{hint}</p>
      </div>
    </div>
  );
}

async function ClaudeTab({ apiOn }: { apiOn: boolean }) {
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "127.0.0.1:3000"}`;
  const webhook = !!process.env.N8N_PUBLISH_WEBHOOK_URL && !process.env.N8N_PUBLISH_WEBHOOK_URL.includes("YOUR-N8N-DOMAIN");

  return (
    <div className="space-y-5">
      <Panel title="Connection status" desc="Read from .env.local on this PC (or your host's environment variables). Restart after changing them."
        action={<span className={`chip ${apiOn ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{apiOn ? "API on" : "API off"}</span>}>
        <div className="grid divide-y divide-slate-100 md:grid-cols-3 md:divide-x md:divide-y-0">
          <StatusTile ok={apiOn} label="Claude API key" hint="SOCIAL_HUB_API_KEY" />
          <StatusTile ok={serviceKeySet()} label="Service role key" hint="SUPABASE_SERVICE_ROLE_KEY" />
          <StatusTile ok={webhook} label="Publish webhook (n8n)" hint="N8N_PUBLISH_WEBHOOK_URL" />
        </div>
      </Panel>

      <ApiReference origin={origin} />
    </div>
  );
}
