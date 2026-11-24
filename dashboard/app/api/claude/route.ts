import { apiKeySet, json } from "@/lib/claude-api";

export const dynamic = "force-dynamic";

// Self-describing index, so an agent (or you, with curl) can discover the API. No data, no key needed.
export async function GET(req: Request) {
  const base = `${new URL(req.url).origin}/api/claude`;
  return json({
    name: "Social Hub API for Claude",
    enabled: apiKeySet(),
    auth: "Authorization: Bearer <SOCIAL_HUB_API_KEY>",
    note: "Creates and edits DRAFTS only. Publishing is always a human click in the dashboard.",
    endpoints: {
      [`GET ${base}/context`]: "Platform rules, saved groups and subreddits, connected accounts, content types. Call this first.",
      [`POST ${base}/drafts`]: "Create a post with every field filled in. Returns post_id, edit_url and per-platform char counts and errors.",
      [`PATCH ${base}/variants/{variant_id}`]: "Fix one draft or failed platform version: body, title, hashtags, link_url.",
      [`GET ${base}/posts?limit=10`]: "Recent posts with each platform's status, link and last error.",
      [`GET ${base}/performance?days=30`]: "Analytics summary to decide what to post next.",
    },
  });
}
