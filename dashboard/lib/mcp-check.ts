// Checks the n8n MCP server (Social 0) the same way the Claude app connects to it.
// Server only: N8N_MCP_URL, N8N_MCP_KEY and N8N_MCP_KEY_HEADER never reach the browser.

export type McpStatus = {
  configured: boolean;   // N8N_MCP_URL is set
  online: boolean;       // answered the MCP handshake with the key
  keyRequired: boolean | null; // true: a request without the key is refused
  tools: string[];
  error?: string;
};

const HANDSHAKE = JSON.stringify({
  jsonrpc: "2.0", id: 1, method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "social-hub-dashboard", version: "1.0" } },
});

async function post(url: string, headers: Record<string, string>, body: string) {
  const res = await fetch(url, {
    method: "POST",
    headers: { accept: "application/json, text/event-stream", "content-type": "application/json", ...headers },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  return { status: res.status, text: await res.text().catch(() => ""), session: res.headers.get("mcp-session-id") };
}

export async function checkMcp(): Promise<McpStatus> {
  const url = process.env.N8N_MCP_URL;
  const key = process.env.N8N_MCP_KEY;
  const header = process.env.N8N_MCP_KEY_HEADER || "x-api-key";
  const base: McpStatus = { configured: !!url, online: false, keyRequired: null, tools: [] };
  if (!url) return base;

  const auth: Record<string, string> = key ? { [header]: key } : {};
  try {
    const hello = await post(url, auth, HANDSHAKE);
    if (hello.status !== 200) {
      const why = hello.status === 401 || hello.status === 403 ? " The key does not match the Claude MCP Key credential."
        : hello.status === 404 ? " Social 0 is not active, or the URL is wrong." : "";
      return { ...base, error: `The MCP server answered ${hello.status}.${why}` };
    }
    const session: Record<string, string> = hello.session ? { "mcp-session-id": hello.session } : {};
    const list = await post(url, { ...auth, ...session }, JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }));
    const tools = [...new Set([...list.text.matchAll(/"name"\s*:\s*"([^"]+)"/g)].map((m) => m[1]))];
    // Close the test session (best effort)
    if (hello.session) fetch(url, { method: "DELETE", headers: { ...auth, ...session }, signal: AbortSignal.timeout(5_000) }).catch(() => {});

    let keyRequired: boolean | null = null;
    if (key) {
      const noKey = await post(url, {}, HANDSHAKE);
      keyRequired = noKey.status === 401 || noKey.status === 403;
    }
    return { ...base, online: true, keyRequired, tools };
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return { ...base, error: timeout ? "No answer within 10 seconds. Is n8n running?" : e instanceof Error ? e.message : String(e) };
  }
}
