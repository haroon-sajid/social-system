from n8nlib import *

# =================== Social 2 - Daily Analytics and Token Check ===================
w = WF("Social 2 - Daily Analytics and Token Check")
w.add("Daily 3:15 AM", *T_SCHED, {"rule": {"interval": [{"field": "days", "triggerAtHour": 3, "triggerAtMinute": 15}]}}, (0, 300))

# --- metrics ---
w.add("Get Targets", *T_HTTP, rpc("list_metric_targets", "={{ JSON.stringify({ p_days: 30 }) }}"), (220, 100), creds=CRED_SUPA)
w.add("Has Target?", *T_IF, if_params(cond("={{ $json.variant_id }}", "string", "notEmpty", single=True)), (440, 100))
w.add("Route Metrics", *T_SWITCH, switch_params("={{ $json.platform }}", ["facebook", "instagram", "threads"], fallback=False), (660, 100))
# Each Facebook post is read with its own Page's token (list_metric_targets returns the credential name)
FB_TOKEN_NAMES = [name for name, _, _ in FB_TOKENS]
w.add("FB Stats Token", *T_SWITCH, switch_params("={{ $json.token || 'Meta Page Token' }}", FB_TOKEN_NAMES, fallback=False), (880, -100))
FB_STATS = []
for i, (name, cred, suffix) in enumerate(FB_TOKENS):
    FB_STATS.append(w.add(f"FB Stats{suffix}", *T_HTTP, http(
        f"={GRAPH}/{{{{ $json.platform_post_id }}}}?fields=reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares",
        creds=cred), (1100, -180 + 140 * i), creds=cred, on_error="continueRegularOutput"))
w.add("IG Insights", *T_HTTP, http(
    f"={GRAPH}/{{{{ $json.platform_post_id }}}}/insights?metric=views,reach,likes,comments,shares,saved",
    creds=CRED_META), (1100, 100), creds=CRED_META, on_error="continueRegularOutput")
w.add("Threads Insights", *T_HTTP, http(
    f"={THREADS}/{{{{ $json.platform_post_id }}}}/insights?metric=views,likes,replies,reposts,quotes",
    creds=CRED_THREADS), (1100, 250), creds=CRED_THREADS, on_error="continueRegularOutput")
w.add("Normalize Metrics", *T_CODE, code(r"""
const t = $('Has Target?').item.json;
const r = $json;
if (r.error) return { json: { skip: true, variant_id: t.variant_id, error: String(r.error.message || r.error) } };
const row = { variant_id: t.variant_id, raw: r };
if (t.platform === 'facebook') {
  row.likes = r.reactions?.summary?.total_count ?? null;
  row.comments = r.comments?.summary?.total_count ?? null;
  row.shares = r.shares?.count ?? 0;
} else {
  const m = {};
  for (const d of (r.data || [])) m[d.name] = d.values?.[0]?.value ?? d.total_value?.value ?? null;
  if (t.platform === 'instagram') Object.assign(row, { views: m.views, reach: m.reach, likes: m.likes,
    comments: m.comments, shares: m.shares, saves: m.saved });
  if (t.platform === 'threads') Object.assign(row, { views: m.views, likes: m.likes, comments: m.replies,
    shares: (m.reposts || 0) + (m.quotes || 0) });
}
return { json: row };
""", mode="runOnceForEachItem"), (1320, 100))
w.add("Collect Rows", *T_CODE, code(r"""
const rows = $input.all().map(i => i.json).filter(r => !r.skip);
return [{ json: { rows, skipped: $input.all().length - rows.length } }];
"""), (1540, 100))
w.add("Save Metrics", *T_HTTP, rpc("upsert_metrics", "={{ JSON.stringify({ p_rows: $json.rows }) }}"), (1760, 100), creds=CRED_SUPA)

w.link("Daily 3:15 AM", "Get Targets")
w.link("Get Targets", "Has Target?")
w.link("Has Target?", "Route Metrics", 0)
w.link("Route Metrics", "FB Stats Token", 0)
for i, n in enumerate(FB_STATS):
    w.link("FB Stats Token", n, i)
w.link("Route Metrics", "IG Insights", 1)
w.link("Route Metrics", "Threads Insights", 2)
for n in (*FB_STATS, "IG Insights", "Threads Insights"):
    w.link(n, "Normalize Metrics")
w.link("Normalize Metrics", "Collect Rows")
w.link("Collect Rows", "Save Metrics")

# --- token health ---
# Alerts are kept per account ("facebook:<page id>"), so one Page's good token never closes the other Page's alert.
w.add("Get Accounts", *T_HTTP, http(
    f"{SUPA}/rest/v1/accounts?is_active=eq.true&select=platform,external_id,display_name,token_expires_at,n8n_credential_name"),
    (220, 600), creds=CRED_SUPA)
w.add("Route Accounts", *T_SWITCH, switch_params("={{ $json.platform }}", ["facebook", "instagram", "threads", "linkedin"], fallback=False), (440, 600))
w.add("FB Page Token", *T_SWITCH,
      switch_params("={{ $json.n8n_credential_name || 'Meta Page Token' }}", FB_TOKEN_NAMES, fallback=False), (660, 380))
CHECK_FB = []
for i, (name, cred, suffix) in enumerate(FB_TOKENS):
    CHECK_FB.append(w.add(f"Check FB Token{suffix}", *T_HTTP, http(f"={GRAPH}/{{{{ $json.external_id }}}}?fields=id,name", creds=cred),
                          (880, 300 + 140 * i), creds=cred, on_error="continueErrorOutput"))
w.add("Check IG Token", *T_HTTP, http(f"={GRAPH}/{{{{ $json.external_id }}}}?fields=id,username", creds=CRED_META),
      (880, 600), creds=CRED_META, on_error="continueErrorOutput")
w.add("Check Threads Token", *T_HTTP, http(f"{THREADS}/me?fields=id,username", creds=CRED_THREADS),
      (880, 750), creds=CRED_THREADS, on_error="continueErrorOutput")
w.add("Check LinkedIn Token", *T_HTTP, http("https://api.linkedin.com/v2/userinfo", creds=CRED_LI),
      (880, 900), creds=CRED_LI, on_error="continueErrorOutput")
w.add("Token OK", *T_CODE, code(r"""
const a = $('Get Accounts').item.json;
return { json: { platform: `${a.platform}:${a.external_id}`, kind: 'token' } };
""", mode="runOnceForEachItem"), (1120, 550))
w.add("Token Bad", *T_CODE, code(r"""
const a = $('Get Accounts').item.json;
const e = $json.error ?? $json;
const msg = typeof e === 'string' ? e : [e.message, e.description].filter(Boolean).join(' | ');
const cred = a.platform === 'facebook' ? (a.n8n_credential_name || 'Meta Page Token')
  : { instagram: 'Meta Page Token', threads: 'Threads Token', linkedin: 'LinkedIn Bearer' }[a.platform] || 'token';
return { json: { platform: `${a.platform}:${a.external_id}`, kind: 'token',
  message: `${a.platform} (${a.display_name}) token check failed: ${msg || 'unknown error'}. Renew the "${cred}" credential in n8n.` } };
""", mode="runOnceForEachItem"), (1120, 800))
w.add("Resolve Token Alert", *T_HTTP, rpc("resolve_alerts",
      "={{ JSON.stringify({ p_platform: $json.platform, p_kind: $json.kind }) }}"), (1340, 550), creds=CRED_SUPA,
      on_error="continueRegularOutput")
w.add("Raise Token Alert", *T_HTTP, rpc("raise_alert",
      "={{ JSON.stringify({ p_platform: $json.platform, p_kind: $json.kind, p_message: $json.message }) }}"),
      (1340, 800), creds=CRED_SUPA, on_error="continueRegularOutput")
w.add("Expiring Soon", *T_CODE, code(r"""
const soon = Date.now() + 7 * 864e5;
return $input.all().map(i => i.json)
  .filter(a => a.token_expires_at && new Date(a.token_expires_at).getTime() < soon)
  .map(a => ({ json: { platform: `${a.platform}:${a.external_id}`, kind: 'token_expiry',
    message: `${a.platform} (${a.display_name}) token expires on ${String(a.token_expires_at).slice(0, 10)}. Renew it before then.` } }));
"""), (440, 1050))

w.link("Daily 3:15 AM", "Get Accounts")
w.link("Get Accounts", "Route Accounts")
w.link("Get Accounts", "Expiring Soon")
w.link("Route Accounts", "FB Page Token", 0)
for i, n in enumerate(CHECK_FB):
    w.link("FB Page Token", n, i)
for i, n in enumerate(["Check IG Token", "Check Threads Token", "Check LinkedIn Token"], start=1):
    w.link("Route Accounts", n, i)
for n in (*CHECK_FB, "Check IG Token", "Check Threads Token", "Check LinkedIn Token"):
    w.link(n, "Token OK", 0)
    w.link(n, "Token Bad", 1)
w.link("Token OK", "Resolve Token Alert")
w.link("Token Bad", "Raise Token Alert")
w.link("Expiring Soon", "Raise Token Alert")

w.add("Note", *T_STICKY, {"content": (
    "## Daily Analytics and Token Check\n"
    "Pulls likes, comments, shares, views for posts published in the last 30 days (Facebook, Instagram, Threads).\n"
    "Checks every token and raises a dashboard alert if one fails or expires within 7 days.\n"
    "Each Facebook Page is read and checked with its own token (Meta Page Token or Meta Page Token 2).\n"
    "LinkedIn personal post analytics are not available on the free API."), "height": 250, "width": 440}, (0, -300))
w.dump("social-2-analytics-tokens.json",
       {"executionOrder": "v1", "timezone": "Asia/Karachi", "saveDataSuccessExecution": "all", "saveDataErrorExecution": "all"})
print("analytics nodes", len(w.nodes))

# =================== Social 3 - Weekly Insights ===================
w = WF("Social 3 - Weekly Insights")
w.add("Monday 9:10 AM", *T_SCHED, {"rule": {"interval": [{"field": "weeks", "weeksInterval": 1, "triggerAtDay": [1],
                                                          "triggerAtHour": 9, "triggerAtMinute": 10}]}}, (0, 0))
w.add("Get Summary", *T_HTTP, rpc("get_performance_summary", "={{ JSON.stringify({ p_days: 28 }) }}"), (220, 0), creds=CRED_SUPA)
w.add("Enough Data?", *T_IF, if_params(cond("={{ $json.published_count }}", "number", "gte", 3)), (440, 0))
w.add("Build Prompt", *T_CODE, code(r"""
const s = $input.first().json;
const prompt = `You are a senior social media strategist. Below is 28 days of performance data for one creator
(AI automation and full-stack engineering content, audience in Pakistan and worldwide, times are Pakistan time).
Find what works and what does not. Be specific and use the numbers. Then give 5 concrete post ideas for next week.
Each idea must name the platform, content type, best posting hour (0 to 23 Pakistan time), why it should work based on
the data, and a ready-to-use example post written for that platform. Plain simple English. No emojis.

DATA:
${JSON.stringify(s)}`;
const schema = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    suggestions: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      title: { type: 'STRING' }, platform: { type: 'STRING' }, content_type: { type: 'STRING' },
      best_hour_pkt: { type: 'INTEGER' }, why: { type: 'STRING' }, example_post: { type: 'STRING' } },
      required: ['title', 'platform', 'why', 'example_post'] } },
  },
  required: ['summary', 'suggestions'],
};
return [{ json: { request: {
  contents: [{ role: 'user', parts: [{ text: prompt }] }],
  generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.4 },
} } }];
"""), (660, -100))
w.add("Ask Gemini", *T_HTTP, http(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent", "POST",
    "={{ JSON.stringify($json.request) }}", creds=CRED_GEMINI, options={"timeout": 120000}),
    (880, -100), creds=CRED_GEMINI, on_error="continueErrorOutput")
w.add("Parse Answer", *T_CODE, code(r"""
const r = $input.first().json;
const text = r.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
let parsed;
try { parsed = JSON.parse(text); } catch (e) { throw new Error('Gemini did not return valid JSON: ' + text.slice(0, 300)); }
const end = new Date();
const start = new Date(end.getTime() - 28 * 864e5);
return [{ json: { period_start: start.toISOString().slice(0, 10), period_end: end.toISOString().slice(0, 10),
  summary: parsed.summary, suggestions: parsed.suggestions || [] } }];
"""), (1100, -100), on_error="continueErrorOutput")
w.add("Save Insight", *T_HTTP, http(f"{SUPA}/rest/v1/insights", "POST", "={{ JSON.stringify($json) }}",
      headers=[("Prefer", "return=minimal")]), (1320, -100), creds=CRED_SUPA)
w.add("Gemini Failed", *T_CODE, code(r"""
const e = $json.error ?? $json;
const msg = typeof e === 'string' ? e : (e.message || JSON.stringify(e));
return [{ json: { platform: 'gemini', kind: 'insights',
  message: 'Weekly insights failed: ' + String(msg).slice(0, 500) } }];
"""), (1100, 100))
w.add("Raise Alert", *T_HTTP, rpc("raise_alert",
      "={{ JSON.stringify({ p_platform: $json.platform, p_kind: $json.kind, p_message: $json.message }) }}"),
      (1320, 100), creds=CRED_SUPA)
w.link("Monday 9:10 AM", "Get Summary")
w.link("Get Summary", "Enough Data?")
w.link("Enough Data?", "Build Prompt", 0)
w.link("Build Prompt", "Ask Gemini")
w.link("Ask Gemini", "Parse Answer", 0)
w.link("Ask Gemini", "Gemini Failed", 1)
w.link("Parse Answer", "Save Insight", 0)
w.link("Parse Answer", "Gemini Failed", 1)
w.link("Gemini Failed", "Raise Alert")
w.dump("social-3-weekly-insights.json")
print("insights nodes", len(w.nodes))
