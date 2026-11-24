"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteAccount, deleteGroup, updateRule, upsertAccount, upsertGroup } from "@/app/actions";
import { Icon, PlatformIcon } from "./icons";
import { Callout, Panel } from "./ui";
import { FB_TOKENS, credentialOf, fbToken, platformLabel, type Account, type GroupTarget, type Platform, type Rule } from "@/lib/platforms";

export type SettingsTab = "accounts" | "groups" | "rules";
type Run = (fn: () => Promise<{ ok: boolean; error?: string }>) => void;

const API_PLATFORMS: { id: Platform; idHelp: string; where: string; expires: string }[] = [
  { id: "facebook", idHelp: "Facebook Page ID (numbers)", where: "Graph API Explorer: me/accounts, the Page id. Each Page has its own token.", expires: "Never" },
  { id: "instagram", idHelp: "Instagram business account ID", where: "{page-id}?fields=instagram_business_account", expires: "Never" },
  { id: "threads", idHelp: "Threads user ID (numbers)", where: "graph.threads.net/v1.0/me, the id", expires: "60 days" },
  { id: "linkedin", idHelp: "LinkedIn person ID (sub)", where: "api.linkedin.com/v2/userinfo, the sub", expires: "60 days" },
];

// Date input value (YYYY-MM-DD) <-> stored timestamp. Saved as midnight UTC of that day.
const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const fromDateInput = (d: string) => (d ? new Date(d).toISOString() : null);

function Toggle({ checked, disabled, onChange, label }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition disabled:opacity-50 ${checked ? "bg-brand-600" : "bg-slate-300"}`}>
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
    </button>
  );
}

function Empty({ icon, title, text }: { icon: "user" | "users"; title: string; text: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400"><Icon name={icon} size={20} /></span>
      <p className="mt-3 text-sm font-medium text-slate-800">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-slate-500">{text}</p>
    </div>
  );
}

export default function SettingsForms({ tab, accounts, groups, rules }: { tab: SettingsTab; accounts: Account[]; groups: GroupTarget[]; rules: Rule[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run: Run = (fn) => start(async () => {
    const r = await fn();
    setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error ?? "Error" });
    router.refresh();
  });

  return (
    <div className="space-y-5">
      {msg && <Callout tone={msg.ok ? "success" : "danger"} onClose={() => setMsg(null)}>{msg.text}</Callout>}
      {tab === "accounts" && <AccountsTab accounts={accounts} pending={pending} run={run} />}
      {tab === "groups" && <GroupsTab groups={groups} pending={pending} run={run} />}
      {tab === "rules" && (
        <div className="grid gap-5 2xl:grid-cols-2">
          {rules.map((r) => <RuleCard key={r.platform} r={r} pending={pending} run={run} />)}
          <RulesOverview rules={rules} />
        </div>
      )}
    </div>
  );
}

// ---------------- Accounts ----------------
function AccountsTab({ accounts, pending, run }: { accounts: Account[]; pending: boolean; run: Run }) {
  const [acc, setAcc] = useState({ platform: "facebook" as Platform, display_name: "", external_id: "", token_expires_at: "", token: "" });
  const help = API_PLATFORMS.find((p) => p.id === acc.platform);
  // A new Facebook Page gets the first token no active Page uses yet
  const usedTokens = accounts.filter((a) => a.platform === "facebook" && a.is_active).map(fbToken);
  const token = acc.token || FB_TOKENS.find((t) => !usedTokens.includes(t)) || FB_TOKENS[0];
  const fb = acc.platform === "facebook";

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Panel
        title="Connected accounts"
        desc="The publisher posts to these IDs. Tokens stay in n8n under the credential shown; set the expiry date to get a warning 7 days before."
        action={<span className="chip">{accounts.length} connected</span>}
        footer={
          <div>
            <div className="mb-3 text-[13px] font-semibold text-slate-800">Add an account</div>
            <div className={`grid gap-3 sm:grid-cols-2 2xl:items-end ${fb ? "2xl:grid-cols-[170px_minmax(0,1fr)_minmax(0,1fr)_190px_150px_auto]" : "2xl:grid-cols-[170px_minmax(0,1fr)_minmax(0,1fr)_160px_auto]"}`}>
              <div>
                <label className="label" htmlFor="a-platform">Platform</label>
                <select id="a-platform" className="input" value={acc.platform} onChange={(e) => setAcc({ ...acc, platform: e.target.value as Platform })}>
                  {API_PLATFORMS.map((p) => <option key={p.id} value={p.id}>{platformLabel(p.id)}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="a-name">Display name</label>
                <input id="a-name" className="input" placeholder="Shown in previews" value={acc.display_name} onChange={(e) => setAcc({ ...acc, display_name: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="a-id">Account ID</label>
                <input id="a-id" className="input" placeholder={help?.idHelp} value={acc.external_id} onChange={(e) => setAcc({ ...acc, external_id: e.target.value })} />
              </div>
              {fb && (
                <div>
                  <label className="label" htmlFor="a-token">Page token (n8n)</label>
                  <select id="a-token" className="input" value={token} onChange={(e) => setAcc({ ...acc, token: e.target.value })}>
                    {FB_TOKENS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="label" htmlFor="a-exp">Token expires</label>
                <input id="a-exp" className="input" type="date" title="Leave empty if it never expires" value={acc.token_expires_at} onChange={(e) => setAcc({ ...acc, token_expires_at: e.target.value })} />
              </div>
              <button className="btn-primary h-[42px] sm:col-span-2 2xl:col-span-1" disabled={pending} onClick={() => run(async () => {
                const r = await upsertAccount({ platform: acc.platform, display_name: acc.display_name, external_id: acc.external_id,
                  token_expires_at: fromDateInput(acc.token_expires_at), is_active: true, n8n_credential_name: fb ? token : null });
                if (r.ok) setAcc({ ...acc, display_name: "", external_id: "", token_expires_at: "", token: "" });
                return r;
              })}><Icon name="plus" size={15} /> Add account</button>
            </div>
            <p className="hint">
              {help ? `${platformLabel(help.id)} token expires: ${help.expires}. ${help.expires === "Never" ? "Leave the date empty." : "Enter the date 60 days after you made the token."}` : ""}
              {fb ? " Each Facebook Page has its own Page token: Page 1 uses the \"Meta Page Token\" credential (also used by Instagram), Page 2 uses \"Meta Page Token 2\"." : ""}
            </p>
          </div>
        }
      >
        {accounts.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-slate-50/70 text-left text-xs font-medium text-slate-500">
                <tr><th className="px-6 py-2.5">Account</th><th className="px-3 py-2.5">ID</th><th className="px-3 py-2.5">Token (n8n credential)</th><th className="px-3 py-2.5">Token expires</th><th className="px-3 py-2.5">Active</th><th className="px-6 py-2.5" /></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accounts.map((a) => <AccountRow key={a.id} a={a} pending={pending} run={run} />)}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="user" title="No accounts yet" text="Add your Facebook Page, Instagram, Threads and LinkedIn below. The publisher needs them to post." />
        )}
      </Panel>

      <Panel title="Where to find each ID" desc="From the setup guide (SETUP.md, step 1).">
        {/* Rows share the panel height evenly, so the panel never has an empty bottom */}
        <ul className="flex h-full flex-col divide-y divide-slate-100">
          {API_PLATFORMS.map((p) => {
            const count = accounts.filter((a) => a.platform === p.id && a.is_active).length;
            const on = count > 0;
            return (
              <li key={p.id} className="flex flex-1 items-center gap-3 px-6 py-3.5">
                <PlatformIcon platform={p.id} size={30} rounded="rounded-[9px]" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-slate-900">{platformLabel(p.id)}</span>
                    {on && <span className="chip bg-emerald-50 text-emerald-700"><Icon name="check" size={10} strokeWidth={3} /> {count > 1 ? `${count} connected` : "Connected"}</span>}
                  </div>
                  <p className="mt-0.5 break-words font-mono text-[11px] text-slate-500">{p.where}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">Token: {p.expires === "Never" ? "never expires" : "expires every 60 days"}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}

function AccountRow({ a, pending, run }: { a: Account; pending: boolean; run: Run }) {
  const [expires, setExpires] = useState(toDateInput(a.token_expires_at));
  const changed = expires !== toDateInput(a.token_expires_at);
  const days = a.token_expires_at ? Math.ceil((new Date(a.token_expires_at).getTime() - Date.now()) / 864e5) : null;
  const save = (patch: Partial<Pick<Account, "token_expires_at" | "is_active" | "n8n_credential_name">>) => run(() => upsertAccount({
    id: a.id, platform: a.platform, display_name: a.display_name, external_id: a.external_id ?? "",
    token_expires_at: a.token_expires_at, is_active: a.is_active, n8n_credential_name: a.n8n_credential_name, ...patch,
  }));
  return (
    <tr className={a.is_active ? "" : "opacity-60"}>
      <td className="px-6 py-3">
        <span className="flex items-center gap-2.5">
          <PlatformIcon platform={a.platform} size={30} rounded="rounded-[9px]" />
          <span className="leading-tight">
            <span className="block font-semibold text-slate-900">{a.display_name}</span>
            <span className="block text-xs text-slate-500">{platformLabel(a.platform)}</span>
          </span>
        </span>
      </td>
      <td className="px-3 py-3 font-mono text-xs text-slate-600">{a.external_id}</td>
      <td className="px-3 py-3">
        {a.platform === "facebook" ? (
          <select className="input w-44 py-1.5" value={fbToken(a)} disabled={pending} aria-label="Page token credential in n8n"
            onChange={(e) => save({ n8n_credential_name: e.target.value })}>
            {FB_TOKENS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        ) : (
          <span className="whitespace-nowrap text-xs text-slate-500">{credentialOf(a)}</span>
        )}
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-2">
          <input className="input w-40 py-1.5" type="date" value={expires} disabled={pending} aria-label="Token expires"
            title="Leave empty if it never expires" onChange={(e) => setExpires(e.target.value)} />
          {changed ? (
            <button className="btn-primary btn-sm" disabled={pending} onClick={() => save({ token_expires_at: fromDateInput(expires) })}>Save</button>
          ) : days == null ? (
            <span className="text-xs text-slate-400">Never</span>
          ) : (
            <span className={`whitespace-nowrap text-xs font-medium ${days < 0 ? "text-rose-600" : days <= 7 ? "text-amber-700" : "text-slate-500"}`}>
              {days < 0 ? "Expired" : `${days} days left`}
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-3"><Toggle label="Active" checked={a.is_active} disabled={pending} onChange={(v) => save({ is_active: v })} /></td>
      <td className="px-6 py-3 text-right">
        <button className="btn-icon h-8 w-8 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700" disabled={pending} aria-label="Delete account"
          onClick={() => confirm("Delete this account?") && run(() => deleteAccount(a.id))}><Icon name="trash" size={15} /></button>
      </td>
    </tr>
  );
}

// ---------------- Groups and subreddits ----------------
function GroupsTab({ groups, pending, run }: { groups: GroupTarget[]; pending: boolean; run: Run }) {
  const [grp, setGrp] = useState({ platform: "facebook_group" as Platform, name: "", url: "", subreddit: "", flair: "", rules_notes: "" });
  const reddit = grp.platform === "reddit";

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Panel title="Groups and subreddits" desc="You post here by hand from the dashboard. Add each group's rules so you and Claude follow them."
        action={<span className="chip">{groups.length} saved</span>}>
        {groups.length ? (
          <ul className="divide-y divide-slate-100">
            {groups.map((g) => (
              <li key={g.id} className={`flex items-start gap-3 px-6 py-4 ${g.is_active ? "" : "opacity-60"}`}>
                <PlatformIcon platform={g.platform} size={32} rounded="rounded-[10px]" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-semibold text-slate-900">{g.platform === "reddit" ? `r/${g.subreddit}` : g.name}</span>
                    {g.platform === "reddit" && g.name && <span className="text-xs text-slate-400">{g.name}</span>}
                    {g.flair && <span className="chip">{g.flair}</span>}
                  </div>
                  <a className="block truncate text-xs text-slate-500 hover:text-brand-700" href={g.url} target="_blank" rel="noreferrer">{g.url}</a>
                  {g.rules_notes && (
                    <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 ring-1 ring-inset ring-amber-200">Rules: {g.rules_notes}</p>
                  )}
                </div>
                <Toggle label="Active" checked={g.is_active} disabled={pending} onChange={(v) => run(() => upsertGroup({ ...g, is_active: v }))} />
                <button className="btn-icon h-8 w-8 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700" disabled={pending} aria-label="Delete"
                  onClick={() => confirm("Delete this target?") && run(() => deleteGroup(g.id))}><Icon name="trash" size={15} /></button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon="users" title="No groups or subreddits yet" text="Add the Facebook Groups and subreddits you post in. They show up in Compose." />
        )}
      </Panel>

      <Panel title="Add a group or subreddit" desc="One draft is made for each one you pick in Compose." bodyClass="space-y-4 px-6 py-5">
        <div className="grid grid-cols-2 gap-1 rounded-full bg-slate-100 p-1">
          {(["facebook_group", "reddit"] as Platform[]).map((p) => (
            <button key={p} type="button" onClick={() => setGrp({ ...grp, platform: p })}
              className={`flex items-center justify-center gap-1.5 rounded-full py-1.5 text-[13px] font-medium transition ${grp.platform === p ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
              <PlatformIcon platform={p} size={16} rounded="rounded-full" /> {p === "reddit" ? "Subreddit" : "Facebook Group"}
            </button>
          ))}
        </div>
        <div>
          <label className="label" htmlFor="g-name">Name</label>
          <input id="g-name" className="input" placeholder={reddit ? "For example: n8n community" : "Group name"} value={grp.name} onChange={(e) => setGrp({ ...grp, name: e.target.value })} />
        </div>
        {reddit && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="g-sub">Subreddit</label>
              <input id="g-sub" className="input" placeholder="n8n" value={grp.subreddit} onChange={(e) => setGrp({ ...grp, subreddit: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="g-flair">Flair</label>
              <input id="g-flair" className="input" placeholder="Optional" value={grp.flair} onChange={(e) => setGrp({ ...grp, flair: e.target.value })} />
            </div>
          </div>
        )}
        <div>
          <label className="label" htmlFor="g-url">Link</label>
          <input id="g-url" className="input" placeholder="https://" value={grp.url} onChange={(e) => setGrp({ ...grp, url: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="g-rules">Rules</label>
          <textarea id="g-rules" className="input min-h-20" placeholder="For example: no links, value posts only, promo on Saturdays" value={grp.rules_notes}
            onChange={(e) => setGrp({ ...grp, rules_notes: e.target.value })} />
        </div>
        <button className="btn-primary w-full" disabled={pending} onClick={() => run(async () => {
          const r = await upsertGroup({ platform: grp.platform, name: grp.name, url: grp.url, subreddit: grp.subreddit || null,
            flair: grp.flair || null, rules_notes: grp.rules_notes || null, is_active: true });
          if (r.ok) setGrp({ ...grp, name: "", url: "", subreddit: "", flair: "", rules_notes: "" });
          return r;
        })}><Icon name="plus" size={15} /> Add {reddit ? "subreddit" : "group"}</button>
      </Panel>
    </div>
  );
}

// ---------------- Platform rules ----------------
// Fills the last grid cell: every platform's hard limits side by side
function RulesOverview({ rules }: { rules: Rule[] }) {
  return (
    <Panel title={<span className="flex items-center gap-2.5"><span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-slate-900 text-white"><Icon name="analytics" size={15} /></span> Limits at a glance</span>}
      desc="What the dashboard and Claude check before every draft.">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-slate-50/70 text-left text-xs font-medium text-slate-500">
            <tr><th className="px-6 py-2.5">Platform</th><th className="px-3 py-2.5 text-right">Characters</th><th className="px-3 py-2.5 text-right">Hashtags</th>
              <th className="px-3 py-2.5 text-right">Title</th><th className="px-3 py-2.5">Media</th><th className="px-6 py-2.5">Publishing</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rules.map((r) => (
              <tr key={r.platform}>
                <td className="px-6 py-2.5">
                  <span className="flex items-center gap-2 font-medium text-slate-900"><PlatformIcon platform={r.platform} size={20} rounded="rounded-full" />{platformLabel(r.platform)}</span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{r.max_chars.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{r.max_hashtags}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{r.max_title_chars ?? "–"}</td>
                <td className="px-3 py-2.5 text-slate-600">{r.media_required ? "Required" : "Optional"}</td>
                <td className="px-6 py-2.5">
                  <span className={`chip ${r.publish_mode === "api" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                    {r.publish_mode === "api" ? "Auto" : "By hand"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function RuleCard({ r, pending, run }: { r: Rule; pending: boolean; run: Run }) {
  const [tags, setTags] = useState(r.max_hashtags);
  const [tone, setTone] = useState(r.tone_guide ?? "");
  const [notes, setNotes] = useState(r.format_notes ?? "");
  const changed = tags !== r.max_hashtags || tone !== (r.tone_guide ?? "") || notes !== (r.format_notes ?? "");
  const id = `rule-${r.platform}`;
  return (
    <Panel
      title={<span className="flex items-center gap-2.5"><PlatformIcon platform={r.platform} size={28} rounded="rounded-[9px]" /> {platformLabel(r.platform)}</span>}
      action={
        <div className="flex items-center gap-2">
          <span className="chip">{r.max_chars.toLocaleString()} chars</span>
          <span className="chip">{r.publish_mode === "api" ? "Auto publish" : "By hand"}</span>
          <button className="btn-primary btn-sm" disabled={pending || !changed}
            onClick={() => run(() => updateRule(r.platform, { max_hashtags: tags, tone_guide: tone || null, format_notes: notes || null }))}>
            {changed ? "Save" : <><Icon name="check" size={12} strokeWidth={2.6} /> Saved</>}
          </button>
        </div>
      }
      bodyClass="space-y-4 px-6 py-5"
    >
      <div className="grid gap-4 sm:grid-cols-[120px_minmax(0,1fr)]">
        <div>
          <label className="label" htmlFor={`${id}-tags`}>Max hashtags</label>
          <input id={`${id}-tags`} className="input" type="number" min={0} max={30} value={tags} onChange={(e) => setTags(Number(e.target.value))} />
        </div>
        <div>
          <label className="label" htmlFor={`${id}-tone`}>Tone</label>
          <input id={`${id}-tone`} className="input" value={tone} onChange={(e) => setTone(e.target.value)} placeholder="How it should sound" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor={`${id}-notes`}>Format notes</label>
        <textarea id={`${id}-notes`} className="input min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Length, structure, hooks, calls to action" />
      </div>
      {r.link_policy && <p className="flex items-start gap-1.5 text-xs text-slate-500"><Icon name="link" size={13} className="mt-px shrink-0" /> {r.link_policy}</p>}
    </Panel>
  );
}
