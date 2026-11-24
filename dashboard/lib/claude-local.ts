// Runs Claude Code (the `claude` command) on this computer for "Draft with Claude", instead of the Claude app in
// the browser. Conversations then stay on this PC (Claude Code keeps them locally) and are not added to your
// claude.ai chat history. They are still sent to Anthropic to be answered.
//
// Two ways:
//   terminal:   opens a terminal window with Claude already working on the request (you can reply to it there)
//   background: runs Claude without a window; the dashboard shows its progress
//
// Server only, and only when the dashboard runs on your own computer (npm run dev / npm start), never on Vercel.
// Claude reaches the database through the same Social Hub MCP server (Social 0) as the Claude app, using
// N8N_MCP_URL and N8N_MCP_KEY from .env.local, and may only use those tools without asking.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export type LocalStatus = { available: boolean; reason?: string };
export type LocalClaude = { terminal: LocalStatus; background: LocalStatus };
export type JobView = {
  id: string;
  status: "running" | "done" | "failed" | "stopped";
  steps: string[];
  result: string | null;
  error: string | null;
  postIds: string[];
  startedAt: number;
  endedAt: number | null;
};

const WIN = process.platform === "win32";
const SERVER = "social-hub"; // MCP server name inside these Claude sessions
const MAX_MINUTES = 10;
const UNSAFE = /["%&|<>^\r\n]/; // characters that would break a cmd.exe command line

// ---------- where Claude runs ----------
function workDir() {
  return WIN
    ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "SocialHub", "claude")
    : path.join(os.homedir(), ".social-hub", "claude");
}

// Standing instructions for every session in the work folder (Claude Code reads CLAUDE.md automatically)
const GUIDE = `# Social Hub drafting

You draft social media posts for the user's Social Hub dashboard with the ${SERVER} MCP tools:
get_platform_rules, list_accounts, list_group_targets, create_draft, update_variant, list_recent_posts, get_performance.

- Nothing is ever published from here. The user reviews every draft and publishes it in the dashboard.
- The request-*.md files in this folder are written by the dashboard. Do not create, edit or delete files here.
`;

let cliCache: { at: number; cmd: string | null; reason?: string } | null = null;

// The claude command: CLAUDE_CLI from .env.local, or `claude` on the PATH. Checked at most once a minute.
function findCli() {
  if (cliCache && Date.now() - cliCache.at < 60_000) return cliCache;
  let cmd: string | null = process.env.CLAUDE_CLI?.trim() || null;
  let reason: string | undefined;
  if (!cmd) {
    const r = spawnSync(WIN ? "where" : "which", ["claude"], { encoding: "utf8", windowsHide: true, timeout: 5000 });
    if (r.status === 0 && r.stdout.trim()) cmd = "claude";
    else reason = "The claude command was not found. Install Claude Code (npm install -g @anthropic-ai/claude-code) or set CLAUDE_CLI in .env.local to its full path, then restart the dashboard.";
  }
  if (cmd && UNSAFE.test(cmd)) {
    reason = "CLAUDE_CLI contains characters that cannot be used in a command line.";
    cmd = null;
  }
  cliCache = { at: Date.now(), cmd, reason };
  return cliCache;
}
const quoted = (s: string) => (/\s/.test(s) ? `"${s}"` : s);

function common(): LocalStatus {
  if (process.env.VERCEL) return { available: false, reason: "Only when the dashboard runs on your own computer (npm run dev), not on Vercel." };
  const url = process.env.N8N_MCP_URL;
  if (!url || url.includes("YOUR-N8N-DOMAIN")) {
    return { available: false, reason: "Set N8N_MCP_URL and N8N_MCP_KEY in .env.local (Social 0's MCP Server URL and the Claude MCP Key), then restart." };
  }
  if (UNSAFE.test(workDir())) return { available: false, reason: `The folder ${workDir()} has characters cmd.exe cannot handle.` };
  const cli = findCli();
  return cli.cmd ? { available: true } : { available: false, reason: cli.reason };
}

export function localClaudeStatus(): LocalClaude {
  const base = common();
  return {
    background: base,
    terminal: base.available && !WIN
      ? { available: false, reason: "Opening a terminal window is supported on Windows. Use Background instead." }
      : base,
  };
}

// Writes the connector settings, the standing instructions and this request into the work folder
function prepare(prompt: string) {
  const dir = workDir();
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) {
    if (!/^request-.*\.md$/.test(f)) continue;
    try { if (Date.now() - statSync(path.join(dir, f)).mtimeMs > 7 * 864e5) unlinkSync(path.join(dir, f)); } catch { /* in use */ }
  }
  const key = process.env.N8N_MCP_KEY;
  const header = process.env.N8N_MCP_KEY_HEADER || "x-api-key";
  const server = { type: "http", url: process.env.N8N_MCP_URL, ...(key ? { headers: { [header]: key } } : {}) };
  writeFileSync(path.join(dir, "mcp.json"), JSON.stringify({ mcpServers: { [SERVER]: server } }, null, 2), { mode: 0o600 });
  writeFileSync(path.join(dir, "CLAUDE.md"), GUIDE);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
  const file = `request-${stamp}-${randomUUID().slice(0, 6)}.md`;
  writeFileSync(path.join(dir, file), prompt, "utf8");
  return { dir, file };
}

// Checks the Social Hub MCP server with the key before Claude starts, so a wrong key or a stopped n8n gives a clear
// message here. (Claude Code would only report "needs-auth" and then remember that for a while.)
async function checkConnector(): Promise<string | null> {
  const url = process.env.N8N_MCP_URL!;
  const key = process.env.N8N_MCP_KEY;
  const header = process.env.N8N_MCP_KEY_HEADER || "x-api-key";
  const auth: Record<string, string> = key ? { [header]: key } : {};
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "social-hub-dashboard", version: "1.0" } } });
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) { // n8n can be slow to answer the first request
    try {
      const res = await fetch(url, {
        method: "POST", body, cache: "no-store", signal: AbortSignal.timeout(12_000),
        headers: { accept: "application/json, text/event-stream", "content-type": "application/json", ...auth },
      });
      const session = res.headers.get("mcp-session-id");
      if (session) fetch(url, { method: "DELETE", headers: { ...auth, "mcp-session-id": session }, signal: AbortSignal.timeout(5_000) }).catch(() => {});
      if (res.ok) return null;
      if (res.status === 401 || res.status === 403) return "The Social Hub MCP server refused the key. N8N_MCP_KEY in .env.local must equal the Claude MCP Key credential in n8n.";
      if (res.status === 404) return "The Social Hub MCP server was not found. Activate Social 0 in n8n and check N8N_MCP_URL.";
      return `The Social Hub MCP server answered ${res.status}. Check Social 0 in n8n.`;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  return `Could not reach the Social Hub MCP server (${lastError}). Is n8n running?`;
}

// Claude Code remembers a server that once asked for a login and skips it for a while. The check above just
// proved the key works, so forget an old "needs-auth" for this server (best effort; other entries stay as they are).
function forgetNeedsAuth() {
  try {
    const file = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"), "mcp-needs-auth-cache.json");
    const cache = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    if (!(SERVER in cache)) return;
    delete cache[SERVER];
    writeFileSync(file, JSON.stringify(cache));
  } catch { /* no cache file, or a format this version does not use */ }
}

async function ready(kind: keyof LocalClaude): Promise<string | null> {
  const st = localClaudeStatus()[kind];
  if (!st.available) return st.reason ?? "Not available";
  const problem = await checkConnector();
  if (problem) return problem;
  forgetNeedsAuth();
  return null;
}

// Claude gets this PC's environment minus the dashboard's own secrets, and without the markers of the
// Claude Code session the dashboard may have been started from (a nested session would refuse to start).
const DROP_ENV = ["CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "CLAUDE_CODE_SSE_PORT", "SUPABASE_SERVICE_ROLE_KEY", "SOCIAL_HUB_API_KEY",
  "N8N_WEBHOOK_SECRET", "N8N_MCP_KEY", "FB_PAGE_1_TOKEN", "FB_PAGE_2_TOKEN", "Email", "Password"];
function childEnv() {
  const env = { ...process.env };
  for (const k of DROP_ENV) delete env[k];
  return env;
}

// Fixed flags: only the Social Hub connector, and its tools are allowed without asking
const FLAGS = `--mcp-config mcp.json --strict-mcp-config --allowedTools mcp__${SERVER}`;

// ---------- 1. terminal window ----------
export async function openClaudeTerminal(prompt: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const problem = await ready("terminal");
  if (problem) return { ok: false, error: problem };
  const { dir, file } = prepare(prompt);
  const cli = quoted(findCli().cmd!);
  // The request itself stays in the file; the command line holds only fixed text and our own file name.
  // The prompt comes first because --mcp-config and --allowedTools take several values.
  const ask = `Read ${file} in this folder and follow its instructions exactly.`;
  const line = `start "Social Hub - Claude" /d "${dir}" cmd.exe /k ${cli} "${ask}" ${FLAGS} Read`;
  const child = spawn("cmd.exe", ["/d", "/s", "/c", `"${line}"`], { windowsVerbatimArguments: true, stdio: "ignore", env: childEnv() });
  child.on("error", () => { /* reported below if it fails at once */ });
  child.unref();
  return { ok: true };
}

// ---------- 2. background ----------
type Step = { text: string; count: number };
type Job = Omit<JobView, "steps"> & { steps: Step[]; child?: ChildProcess; stderr: string; timer?: NodeJS.Timeout };

// Kept on globalThis so jobs survive the dev server reloading this module
const store = globalThis as unknown as { __socialHubClaudeJobs?: Map<string, Job> };
const jobs = (store.__socialHubClaudeJobs ??= new Map<string, Job>());

const STEP_TEXT: Record<string, string> = {
  ToolSearch: "Loading the Social Hub tools",
  get_platform_rules: "Reading your platform rules",
  list_accounts: "Checking your Facebook Pages and accounts",
  list_group_targets: "Reading your groups and subreddits",
  create_draft: "Saving the drafts",
  update_variant: "Fixing a platform version",
  list_recent_posts: "Looking at your recent posts",
  get_performance: "Reading your analytics",
};

function addStep(job: Job, text: string) {
  const last = job.steps[job.steps.length - 1];
  if (last?.text === text) last.count += 1;
  else job.steps.push({ text, count: 1 });
}

function finish(job: Job, status: Job["status"], error: string | null = null) {
  if (job.status !== "running") return;
  job.status = status;
  job.error = error;
  job.endedAt = Date.now();
  if (job.timer) clearTimeout(job.timer);
}

type StreamEvent = {
  type?: string; subtype?: string; is_error?: boolean; result?: unknown; errors?: unknown;
  mcp_servers?: { name: string; status: string }[];
  message?: { content?: { type?: string; name?: string }[] };
};

function onLine(job: Job, line: string) {
  if (!line.trim()) return;
  let e: StreamEvent;
  try { e = JSON.parse(line); } catch { return; }
  if (e.type === "system" && e.subtype === "init") {
    const s = e.mcp_servers?.find((m) => m.name === SERVER);
    addStep(job, s?.status === "connected" ? "Connected to Social Hub" : `Social Hub connector: ${s?.status ?? "not loaded"}`);
  } else if (e.type === "assistant") {
    for (const c of e.message?.content ?? []) {
      if (c.type !== "tool_use" || !c.name) continue;
      const short = c.name.replace(`mcp__${SERVER}__`, "");
      addStep(job, STEP_TEXT[short] ?? `Using ${short}`);
    }
  } else if (e.type === "user") {
    // create_draft answers with the new post_id (inside an escaped JSON string)
    for (const m of line.matchAll(/post_id\\*"\s*:\s*\\*"([0-9a-f-]{36})/g)) if (!job.postIds.includes(m[1])) job.postIds.push(m[1]);
  } else if (e.type === "result") {
    job.result = typeof e.result === "string" ? e.result : null;
    if (e.is_error || e.subtype !== "success") {
      const errs = Array.isArray(e.errors) ? e.errors.join("; ") : "";
      finish(job, "failed", job.result || errs || `Claude stopped (${e.subtype ?? "error"})`);
    } else finish(job, "done");
  }
}

function kill(job: Job) {
  const pid = job.child?.pid;
  if (!pid) return;
  if (WIN) spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }).on("error", () => {});
  else job.child?.kill("SIGTERM");
}

export async function startClaudeBackground(prompt: string): Promise<{ ok: true; jobId: string } | { ok: false; error: string }> {
  for (const [id, j] of jobs) if (j.endedAt && Date.now() - j.endedAt > 3600_000) jobs.delete(id);
  if ([...jobs.values()].some((j) => j.status === "running")) {
    return { ok: false, error: "Claude is already working on a request in the background. Wait for it or stop it first." };
  }
  const problem = await ready("background");
  if (problem) return { ok: false, error: problem };

  const { dir } = prepare(prompt);
  const cli = findCli().cmd!;
  const args = `-p --output-format stream-json --verbose ${FLAGS}`;
  const child = WIN
    ? spawn("cmd.exe", ["/d", "/s", "/c", `"${quoted(cli)} ${args}"`], { cwd: dir, env: childEnv(), windowsHide: true, windowsVerbatimArguments: true })
    : spawn(cli, args.split(" "), { cwd: dir, env: childEnv() });

  const job: Job = { id: randomUUID(), status: "running", steps: [{ text: "Starting Claude Code", count: 1 }], result: null, error: null,
    postIds: [], startedAt: Date.now(), endedAt: null, child, stderr: "" };
  jobs.set(job.id, job);

  let buf = "";
  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (d: string) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) { onLine(job, buf.slice(0, i)); buf = buf.slice(i + 1); }
  });
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (d: string) => { job.stderr = (job.stderr + d).slice(-4000); });
  child.on("error", (e) => finish(job, "failed", `Could not start Claude Code: ${e.message}`));
  child.on("close", (code) => {
    onLine(job, buf);
    const tail = job.stderr.trim().split(/\r?\n/).slice(-3).join(" ").slice(0, 600);
    finish(job, "failed", tail || `Claude Code stopped without an answer (exit code ${code}).`);
    job.child = undefined;
  });
  job.timer = setTimeout(() => {
    finish(job, "failed", `Stopped after ${MAX_MINUTES} minutes without finishing.`);
    kill(job);
  }, MAX_MINUTES * 60_000);

  // The request goes in through stdin, never on the command line
  child.stdin?.on("error", () => {});
  child.stdin?.end(prompt, "utf8");
  return { ok: true, jobId: job.id };
}

export function claudeJobView(id: string): JobView | null {
  const j = jobs.get(id);
  if (!j) return null;
  return {
    id: j.id, status: j.status, result: j.result, error: j.error, postIds: j.postIds, startedAt: j.startedAt, endedAt: j.endedAt,
    steps: j.steps.map((s) => (s.count > 1 ? `${s.text} (${s.count}x)` : s.text)),
  };
}

export function stopClaude(id: string) {
  const j = jobs.get(id);
  if (!j || j.status !== "running") return false;
  finish(j, "stopped");
  kill(j);
  return true;
}
