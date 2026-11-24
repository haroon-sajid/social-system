import Link from "next/link";
import { Suspense } from "react";
import { headers } from "next/headers";
import { checkMcp } from "@/lib/mcp-check";
import { fmtDate } from "@/lib/platforms";
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

      <Suspense fallback={<McpPanelLoading />}>
        <McpPanel />
      </Suspense>

      <ApiReference origin={origin} />
    </div>
  );
}

const MCP_TOOLS = ["get_platform_rules", "list_group_targets", "create_draft", "update_variant", "list_recent_posts", "get_performance"];

function McpTile({ tone, label, value, hint }: { tone: "ok" | "warn" | "bad" | "idle"; label: string; value: string; hint?: string }) {
  const style = { ok: "bg-emerald-50 text-emerald-600", warn: "bg-amber-50 text-amber-600", bad: "bg-rose-50 text-rose-600", idle: "bg-slate-100 text-slate-400" }[tone];
  const icon: IconName = tone === "ok" ? "check" : tone === "idle" ? "clock" : "alert";
  return (
    <div className="flex items-start gap-3 px-6 py-5">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${style}`}><Icon name={icon} size={16} strokeWidth={2.4} /></span>
      <div className="min-w-0">
        <div className="text-xs font-medium text-slate-500">{label}</div>
        <div className="mt-0.5 text-[14px] font-semibold text-slate-900">{value}</div>
        {hint && <p className="mt-1 text-xs leading-relaxed text-slate-500">{hint}</p>}
      </div>
    </div>
  );
}

function McpPanelLoading() {
  return (
    <Panel title="Claude app connector" desc="Checking your n8n MCP server...">
      <div className="grid animate-pulse divide-y divide-slate-100 md:grid-cols-4 md:divide-x md:divide-y-0">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 px-6 py-5"><div className="h-9 w-9 rounded-full bg-slate-100" /><div className="flex-1 space-y-2"><div className="h-3 w-20 rounded bg-slate-100" /><div className="h-4 w-28 rounded bg-slate-200/70" /></div></div>
        ))}
      </div>
    </Panel>
  );
}

// Live check of Social 0 (the MCP server the Claude app connects to), plus the last draft Claude made
async function McpPanel() {
  const supabase = await createClient();
  const [status, last, count] = await Promise.all([
    checkMcp(),
    supabase.from("posts").select("id,title,master_text,created_at").eq("source", "claude").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("source", "claude"),
  ]);
  const found = MCP_TOOLS.filter((t) => status.tools.includes(t));
  const lastPost = last.data as { id: string; title: string | null; master_text: string; created_at: string } | null;

  return (
    <Panel
      title="Claude app connector"
      desc="Social 0 in n8n is what the Claude app talks to. This checks it live, the same way Claude connects."
      action={<Link href="/settings?tab=claude" scroll={false} className="btn-secondary btn-sm"><Icon name="clock" size={13} /> Check again</Link>}
      footer={status.error ? <p className="text-[13px] text-rose-700">{status.error}</p> : !status.configured ? (
        <p className="text-[13px] text-slate-600">
          Add <code className="font-mono text-xs">N8N_MCP_URL</code> (the MCP Server Production URL) and <code className="font-mono text-xs">N8N_MCP_KEY</code> (the exact value of the Claude MCP Key credential) to .env.local, then restart.
        </p>
      ) : (
        <p className="text-[13px] text-slate-600">
          To test Claude itself: open a new chat, turn on <b>Social Hub</b> in the tools menu, and ask &ldquo;check my platform rules&rdquo;.
          A draft Claude creates shows up here as &ldquo;Last draft from Claude&rdquo;.
        </p>
      )}
    >
      <div className="grid divide-y divide-slate-100 md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-4">
        <McpTile
          tone={!status.configured ? "idle" : status.online ? "ok" : "bad"}
          label="MCP server (n8n)"
          value={!status.configured ? "Not set up here" : status.online ? "Online" : "Not reachable"}
          hint={!status.configured ? "Set N8N_MCP_URL" : status.online ? "Social 0 answered the handshake" : "See the message below"}
        />
        <McpTile
          tone={status.keyRequired == null ? "idle" : status.keyRequired ? "ok" : "warn"}
          label="Key check"
          value={status.keyRequired == null ? "Unknown" : status.keyRequired ? "Key required" : "Not enforced"}
          hint={status.keyRequired === false ? "Anyone with the URL can connect. In the MCP Server node set Header Auth, then Publish." : status.keyRequired ? "Requests without the key are refused" : undefined}
        />
        <McpTile
          tone={!status.online ? "idle" : found.length === MCP_TOOLS.length ? "ok" : "warn"}
          label="Tools for Claude"
          value={status.online ? `${found.length} of ${MCP_TOOLS.length}` : "–"}
          hint={status.online ? (found.length === MCP_TOOLS.length ? "All tools available" : `Missing: ${MCP_TOOLS.filter((t) => !found.includes(t)).join(", ")}`) : undefined}
        />
        <McpTile
          tone={lastPost ? "ok" : "idle"}
          label="Last draft from Claude"
          value={lastPost ? fmtDate(lastPost.created_at) : "None yet"}
          hint={lastPost ? `${(lastPost.title || lastPost.master_text).slice(0, 48)} · ${count.count ?? 0} in total` : "Ask Claude to draft a post to see it here"}
        />
      </div>
    </Panel>
  );
}
