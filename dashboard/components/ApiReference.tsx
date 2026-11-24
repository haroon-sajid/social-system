"use client";
import { useMemo, useState, type ReactNode } from "react";
import { Icon } from "./icons";

type Method = "GET" | "POST" | "PATCH";
type Lang = "curl" | "js" | "python";
type Endpoint = { method: Method; path: string; sample: string; title: string; desc: string; returns: string; body?: unknown };

const ENDPOINTS: Endpoint[] = [
  {
    method: "GET", path: "/context", sample: "/context", title: "Rules, groups and accounts",
    desc: "Everything Claude needs before writing: each platform's limits and tone, your saved groups and subreddits, and the connected accounts. Call this first.",
    returns: "{ how_to_write[], content_types[], platforms[], group_targets[], accounts[] }",
  },
  {
    method: "POST", path: "/drafts", sample: "/drafts", title: "Create a draft post",
    desc: "Creates a post with every field filled in, one version per platform. Nothing is published: you review it in the dashboard. Use platforms[] instead of variants[] to give every platform the same text.",
    returns: "201 { post_id, edit_url, variants: [{ variant_id, platform, char_count, max_chars, errors[] }] }",
    body: {
      title: "How I automated WhatsApp replies",
      master_text: "I built an n8n flow that answers WhatsApp in seconds...",
      topic: "n8n automation",
      content_type: "case_study",
      tags: ["automation"],
      media: [{ public_url: "https://example.com/cover.jpg", mime_type: "image/jpeg" }],
      variants: [
        { platform: "linkedin", body: "Long-form version...", hashtags: ["n8n", "automation"] },
        { platform: "x", body: "Short version...", hashtags: ["n8n"], link_url: "https://example.com" },
        { platform: "instagram", body: "Caption...", hashtags: ["automation", "ai"] },
      ],
    },
  },
  {
    method: "PATCH", path: "/variants/{id}", sample: "/variants/VARIANT_ID", title: "Fix one platform version",
    desc: "Edits a draft or failed version. Send only the fields to change; hashtags replaces the whole list. Use it to fix the errors returned by /drafts.",
    returns: "{ variant_id, platform, char_count, max_chars, errors[] }",
    body: { body: "A shorter version that fits.", hashtags: ["n8n"] },
  },
  {
    method: "GET", path: "/posts", sample: "/posts?limit=10", title: "Recent posts",
    desc: "The latest posts with each platform's status, post link and last error. limit is 1 to 50.",
    returns: "[{ post_id, title, variants: [{ platform, status, url, last_error }] }]",
  },
  {
    method: "GET", path: "/performance", sample: "/performance?days=30", title: "Performance summary",
    desc: "What worked over the last days: totals by platform, engagement by posting hour, best and worst posts. Use it to plan the next posts.",
    returns: "{ period_days, by_platform[], by_hour_pkt[], top_posts[], worst_posts[] }",
  },
];

const FIELDS: [string, string][] = [
  ["Title", "title"], ["Main text", "master_text"], ["Topic", "topic"], ["Content type", "content_type"],
  ["Internal tags", "tags[]"], ["Media", "media[]"], ["Platforms", "variants[].platform"], ["Platform text", "variants[].body"],
  ["Hashtags", "variants[].hashtags[]"], ["Link", "variants[].link_url"], ["Reddit title", "variants[].title"], ["Groups", "variants[].group_target_ids[]"],
  ["Facebook Pages", "variants[].account_ids[]"],
];

const METHOD_STYLE: Record<Method, string> = {
  GET: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  POST: "bg-brand-50 text-brand-700 ring-brand-200",
  PATCH: "bg-clay-50 text-clay-700 ring-clay-200",
};

function MethodBadge({ m }: { m: Method }) {
  return <span className={`inline-flex w-[52px] shrink-0 justify-center rounded-md py-0.5 font-mono text-[10.5px] font-semibold ring-1 ring-inset ${METHOD_STYLE[m]}`}>{m}</span>;
}

export function CopyButton({ text, label = "Copy", dark = false }: { text: string; label?: string; dark?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button"
      onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1600); } catch { /* blocked */ } }}
      className={dark
        ? "inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-200 transition hover:bg-white/10"
        : "inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-300"}>
      <Icon name={done ? "check" : "copy"} size={13} className={done ? (dark ? "text-emerald-300" : "text-emerald-600") : ""} />
      {done ? "Copied" : label}
    </button>
  );
}

const indent = (s: string, n: number) => s.split("\n").map((l, i) => (i ? " ".repeat(n) + l : l)).join("\n");

function example(ep: Endpoint, base: string, lang: Lang) {
  const url = `${base}${ep.sample}`;
  const json = ep.body ? JSON.stringify(ep.body, null, 2) : null;
  if (lang === "curl") {
    const lines = [`curl -X ${ep.method} "${url}"`, `  -H "Authorization: Bearer $SOCIAL_HUB_API_KEY"`];
    if (json) lines.push(`  -H "Content-Type: application/json"`, `  -d '${indent(json, 2)}'`);
    return lines.join(" \\\n");
  }
  if (lang === "js") {
    return [
      `const res = await fetch("${url}", {`,
      `  method: "${ep.method}",`,
      `  headers: {`,
      "    Authorization: `Bearer ${process.env.SOCIAL_HUB_API_KEY}`,",
      ...(json ? [`    "Content-Type": "application/json",`] : []),
      `  },`,
      ...(json ? [`  body: JSON.stringify(${indent(json, 2)}),`] : []),
      `});`,
      `console.log(await res.json());`,
    ].join("\n");
  }
  return [
    `import os, requests`,
    ``,
    `res = requests.${ep.method.toLowerCase()}(`,
    `    "${url}",`,
    `    headers={"Authorization": f"Bearer {os.environ['SOCIAL_HUB_API_KEY']}"},`,
    ...(json ? [`    json=${indent(json, 4)},`] : []),
    `)`,
    `print(res.json())`,
  ].join("\n");
}

// Small syntax colouring: keys, strings, keywords, flags, numbers
const TOKEN = /("(?:[^"\\\n]|\\.)*")|(`[^`]*`)|(\b(?:curl|const|await|fetch|import|print|console|res)\b)|((?<=\s)-[A-Za-z]\b)|(\b\d+\b)/g;
function highlight(code: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0, k = 0;
  for (const m of code.matchAll(TOKEN)) {
    const i = m.index ?? 0;
    if (i > last) out.push(code.slice(last, i));
    const t = m[0];
    const cls = m[1] ? (/^\s*:/.test(code.slice(i + t.length)) ? "text-sky-300" : "text-emerald-300")
      : m[2] ? "text-emerald-300" : m[3] ? "text-violet-300" : m[4] ? "text-pink-300" : "text-amber-300";
    out.push(<span key={k++} className={cls}>{t}</span>);
    last = i + t.length;
  }
  out.push(code.slice(last));
  return out;
}

export default function ApiReference({ origin }: { origin: string }) {
  const base = `${origin}/api/claude`;
  const [sel, setSel] = useState(1);
  const [lang, setLang] = useState<Lang>("curl");
  const ep = ENDPOINTS[sel];
  const code = useMemo(() => example(ep, base, lang), [ep, base, lang]);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(18,19,22,0.03)]">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-6 py-4">
        <div className="mr-auto min-w-0">
          <h2 className="section-title">API reference</h2>
          <p className="mt-0.5 text-[13px] text-slate-500">Claude can only create and edit drafts. Publishing is always your click.</p>
        </div>
        <div className="flex min-w-0 max-w-full items-center gap-2.5 rounded-full border border-slate-200 bg-slate-50 py-1 pl-4 pr-1">
          <span className="eyebrow shrink-0">Base URL</span>
          <code className="min-w-0 truncate font-mono text-[12.5px] text-slate-900">{base}</code>
          <CopyButton text={base} />
        </div>
      </div>

      <div className="grid lg:grid-cols-[290px_minmax(0,1fr)]">
        {/* Endpoint list */}
        <nav className="flex flex-col gap-1 border-b border-slate-100 bg-slate-50/70 p-3 lg:border-b-0 lg:border-r" aria-label="Endpoints">
          {ENDPOINTS.map((e, i) => {
            const on = i === sel;
            return (
              <button key={e.path} type="button" onClick={() => setSel(i)} aria-current={on ? "true" : undefined}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${on ? "bg-white shadow-[0_1px_3px_rgba(18,19,22,0.08)] ring-1 ring-slate-200" : "hover:bg-white/70"}`}>
                <MethodBadge m={e.method} />
                <span className="min-w-0">
                  <span className="block truncate font-mono text-[12.5px] font-medium text-slate-900">{e.path}</span>
                  <span className="block truncate text-[11.5px] text-slate-500">{e.title}</span>
                </span>
              </button>
            );
          })}
          <div className="mt-auto space-y-2 rounded-xl border border-dashed border-slate-300 bg-white/60 p-3.5 text-[12px] leading-relaxed text-slate-600 lg:mt-3">
            <div className="flex items-center gap-1.5 font-semibold text-slate-800"><Icon name="info" size={14} className="text-brand-600" /> Authentication</div>
            <p>Every request sends your key in this header. It lives in <code className="font-mono text-[11px]">.env.local</code> as <code className="font-mono text-[11px]">SOCIAL_HUB_API_KEY</code>.</p>
            <CopyButton text="Authorization: Bearer $SOCIAL_HUB_API_KEY" label="Copy header" />
            <p className="text-[11.5px] text-slate-500">An agent in the cloud needs your deployed address instead of localhost.</p>
          </div>
        </nav>

        {/* Selected endpoint */}
        <div className="min-w-0 p-6">
          <div className="flex flex-wrap items-center gap-3">
            <MethodBadge m={ep.method} />
            <code className="min-w-0 truncate font-mono text-[15px] font-semibold text-slate-900">{ep.path}</code>
            <span className="text-sm text-slate-400">·</span>
            <span className="text-sm font-medium text-slate-700">{ep.title}</span>
          </div>
          <p className="mt-2 max-w-3xl text-[13.5px] leading-relaxed text-slate-600">{ep.desc}</p>

          <div className="mt-5 overflow-hidden rounded-xl bg-[#0F1117] ring-1 ring-slate-900/10">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2">
              <div className="flex gap-1" role="tablist" aria-label="Example language">
                {([["curl", "cURL"], ["js", "JavaScript"], ["python", "Python"]] as [Lang, string][]).map(([id, label]) => (
                  <button key={id} type="button" role="tab" aria-selected={lang === id} onClick={() => setLang(id)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${lang === id ? "bg-white/10 text-white" : "text-slate-400 hover:text-slate-200"}`}>
                    {label}
                  </button>
                ))}
              </div>
              <CopyButton text={code} dark />
            </div>
            <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-[1.7] text-slate-200"><code>{highlight(code)}</code></pre>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0 rounded-xl border border-slate-200/80 px-4 py-3">
              <div className="eyebrow mb-1">Returns</div>
              <code className="block break-words font-mono text-[12px] text-slate-800">{ep.returns}</code>
            </div>
            <div className="rounded-xl border border-slate-200/80 px-4 py-3">
              <div className="eyebrow mb-1.5">Errors</div>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                <span className="chip bg-amber-50 text-amber-800" title="Bad input. The message says what to fix.">400 bad input</span>
                <span className="chip bg-rose-50 text-rose-700" title="Missing or wrong API key">401 wrong key</span>
                <span className="chip" title="SOCIAL_HUB_API_KEY or the service role key is not set">503 API off</span>
              </div>
            </div>
          </div>

          {ep.path === "/drafts" && (
            <div className="mt-5 rounded-xl border border-slate-200/80 px-4 py-3">
              <div className="eyebrow mb-2">Compose field → API field</div>
              <div className="grid gap-x-8 sm:grid-cols-2">
                {FIELDS.map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-3 border-b border-dashed border-slate-100 py-1.5 text-[12.5px] last:border-0 sm:[&:nth-last-child(2)]:border-0">
                    <span className="text-slate-600">{k}</span>
                    <code className="truncate rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11.5px] text-slate-800">{v}</code>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
