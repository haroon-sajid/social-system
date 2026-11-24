import json
import os
import uuid
from n8nlib import *

# The MCP path is the key to your Claude connector, so it never goes into git.
# It comes from N8N_MCP_PATH, or tools/secrets.local.json (git-ignored, created with a new random path if missing).
SECRETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "secrets.local.json")


def mcp_path():
    if os.environ.get("N8N_MCP_PATH"):
        return os.environ["N8N_MCP_PATH"]
    data = {}
    if os.path.exists(SECRETS):
        with open(SECRETS, encoding="utf-8") as f:
            data = json.load(f)
    if not data.get("mcp_path"):
        data["mcp_path"] = f"social-mcp-{uuid.uuid4()}"
        with open(SECRETS, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    return data["mcp_path"]


MCP_PATH = mcp_path()
w = WF("Social 0 - MCP Server (Claude)")

# Header auth: Claude's connector sends "x-api-key: <key>" (credential "Claude MCP Key").
# Claude only allows approved header names, and x-api-key is one of them.
w.add("MCP Server", *T_MCP, {"authentication": "headerAuth", "path": MCP_PATH}, (600, 0),
      creds=("httpHeaderAuth", "Claude MCP Key"), extra={"webhookId": MCP_PATH})


def tool(name, desc, params, pos):
    p = dict(params)
    p["toolDescription"] = desc
    w.add(name, *T_HTTPTOOL, p, pos, creds=CRED_SUPA)
    w.link(name, "MCP Server", kind="ai_tool")


tool("get_platform_rules",
     "Get the writing and publishing rules for every platform: facebook, instagram, threads, linkedin, x, reddit, "
     "facebook_group. Returns max_chars, max_hashtags, max_title_chars, media_required, allowed_media, link_policy, "
     "tone_guide and format_notes. ALWAYS call this before writing platform versions of a post.",
     http(f"{SUPA}/rest/v1/platform_rules?select=platform,publish_mode,max_chars,max_title_chars,max_hashtags,"
          "media_required,allowed_media,link_policy,tone_guide,format_notes&order=platform"),
     (0, 300))

tool("list_group_targets",
     "List the user's saved Facebook groups and subreddits (id, platform, name, url, subreddit, flair, rules_notes). "
     "Use the id values as group_target_ids when drafting reddit or facebook_group variants.",
     http(f"{SUPA}/rest/v1/group_targets?is_active=eq.true&select=id,platform,name,url,subreddit,flair,rules_notes"),
     (200, 300))

tool("list_accounts",
     "List the user's connected accounts (id, platform, display_name). The user can have more than one Facebook Page. "
     "Use the facebook ids as account_ids in create_draft to choose which Pages get the post.",
     http(f"{SUPA}/rest/v1/accounts?is_active=eq.true&select=id,platform,display_name&order=platform,created_at"),
     (300, 450))

CREATE_DESC = (
    "Save a new post as a DRAFT with one version per platform. Nothing is published. The user reviews and publishes "
    "in the dashboard. Call get_platform_rules first and write each version to fit its platform. Count characters "
    "carefully; hashtags are appended to the body automatically, do not also put them in body. "
    "payload JSON shape: {"
    "\"title\": short internal title, "
    "\"master_text\": the full original content (required), "
    "\"topic\": short topic, "
    "\"content_type\": one of tip, story, announcement, promo, question, case_study, opinion, news, "
    "\"tags\": [internal tags], "
    "\"source\": \"claude\" or \"manual\" (manual when the user wrote the text), "
    "\"media\": [{\"public_url\": \"https://...\", \"mime_type\": \"image/jpeg\"}] optional, only real public URLs the user gave. The first image is attached to facebook, instagram, threads and linkedin (one click publish supports 1 image, no video), "
    "\"variants\": [{\"platform\": facebook|instagram|threads|linkedin|x|reddit|facebook_group, "
    "\"body\": text without hashtags, \"hashtags\": [\"tag\"], \"link_url\": optional, "
    "\"title\": required for reddit, \"group_target_ids\": [ids] for reddit and facebook_group, "
    "\"account_ids\": [ids from list_accounts] optional for facebook: which Facebook Pages get this version "
    "(one version is saved per Page; leave it out to use every connected Page), "
    "\"use_media\": true or false}]}. "
    "Returns post_id and each variant with char_count, max_chars and errors. If any variant has errors, fix it with "
    "update_variant. Instagram errors about missing media are fine: the user uploads media in the dashboard.")
tool("create_draft", CREATE_DESC,
     http(f"{SUPA}/rest/v1/rpc/create_draft_post", "POST",
          "={{ JSON.stringify({ payload: $fromAI('payload', 'Draft post JSON exactly as described in the tool description', 'json') }) }}"),
     (400, 300))

tool("update_variant",
     "Edit one DRAFT or FAILED platform version. Pass only the fields to change. hashtags replaces the whole list. "
     "Returns char_count, max_chars and remaining errors.",
     http(f"{SUPA}/rest/v1/rpc/update_variant_draft", "POST",
          "={{ JSON.stringify({ "
          "p_variant_id: $fromAI('variant_id', 'variant_id returned by create_draft or list_recent_posts', 'string'), "
          "p_body: $fromAI('body', 'New text without hashtags. Empty string to keep current text', 'string') || null, "
          "p_title: $fromAI('title', 'New title (reddit). Empty string to keep current', 'string') || null, "
          "p_hashtags: $fromAI('hashtags', 'Full new hashtag list as JSON array of strings, or null to keep current', 'json') ?? null, "
          "p_link_url: $fromAI('link_url', 'New link. Empty string to keep current', 'string') || null "
          "}) }}"),
     (600, 300))

tool("list_recent_posts",
     "List recent posts with each platform version's status (draft, scheduled, processing, published, failed), "
     "post URL and last error.",
     http(f"{SUPA}/rest/v1/rpc/list_recent_posts", "POST",
          "={{ JSON.stringify({ p_limit: $fromAI('limit', 'How many posts, 1 to 50', 'number') || 10 }) }}"),
     (800, 300))

tool("get_performance",
     "Get analytics for published posts: totals by platform, engagement by content type, by posting hour "
     "(Pakistan time), top 10 and worst 5 posts with their opening text. Use it to suggest what to post next.",
     http(f"{SUPA}/rest/v1/rpc/get_performance_summary", "POST",
          "={{ JSON.stringify({ p_days: $fromAI('days', 'Look back this many days, for example 30', 'number') || 30 }) }}"),
     (1000, 300))

w.add("Note", *T_STICKY, {"content": (
    "## Claude MCP Server\n"
    "Claude can read rules, create and edit DRAFTS, and read analytics.\n"
    "Claude can NOT publish. Publishing only happens from the dashboard.\n\n"
    "Connect in Claude: Settings > Connectors > Add custom connector > paste the Production URL of the MCP Server node,\n"
    "choose No sign-in, and add the request header x-api-key (value from the Claude MCP Key credential).\n"
    "Keep the URL and the key private."), "height": 260, "width": 500}, (0, -280))

w.dump("social-0-mcp-server.json")
print("nodes", len(w.nodes))
