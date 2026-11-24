"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AUTH_DISABLED } from "@/lib/auth-mode";
import { platformMode, type Media, type Platform } from "@/lib/platforms";

type Result = { ok: true; message?: string } | { ok: false; error: string };
type Db = Awaited<ReturnType<typeof createClient>>;

async function db() {
  const supabase = await createClient();
  if (AUTH_DISABLED) return supabase; // login off (local only): service role client
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  return supabase;
}

const EDITABLE = ["draft", "failed", "manual_pending"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UPLOAD_TYPES: Record<string, string> = { jpg: "image/jpeg", mp4: "video/mp4", mov: "video/quicktime" };

// ---------- create a post (Compose page) ----------
export async function createPost(fields: {
  title: string | null; master_text: string; topic: string | null; content_type: string; tags?: string[];
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const supabase = await db();
    if (!fields.master_text.trim()) return { ok: false, error: "Write the post text first" };
    const tags = (fields.tags ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 20);
    const { data, error } = await supabase.from("posts")
      .insert({ ...fields, tags, source: "manual" }).select("id").single();
    if (error) throw error;
    return { ok: true, id: data.id };
  } catch (e) { return fail(e); }
}

export async function insertVariants(rows: {
  post_id: string; platform: Platform; body: string; title: string | null;
  media_ids: string[]; group_target_id?: string | null; hashtags?: string[]; link_url?: string | null;
}[]): Promise<Result> {
  try {
    const supabase = await db();
    const { error } = await supabase.from("post_variants").insert(rows);
    if (error) throw error;
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) { return fail(e); }
}

// ---------- Draft with Claude: drafts Claude saved through the connector since a moment ----------
export async function recentClaudeDrafts(sinceIso: string): Promise<
  { ok: true; posts: { id: string; title: string | null; master_text: string; created_at: string; post_variants: { id: string; platform: Platform }[] }[] }
  | { ok: false; error: string }> {
  try {
    const supabase = await db();
    const since = new Date(sinceIso);
    if (Number.isNaN(since.getTime())) return { ok: false, error: "Bad time" };
    const { data, error } = await supabase.from("posts")
      .select("id,title,master_text,created_at,post_variants(id,platform)")
      .eq("source", "claude").gte("created_at", since.toISOString())
      .order("created_at", { ascending: false }).limit(10);
    if (error) throw error;
    return { ok: true, posts: (data ?? []) as { id: string; title: string | null; master_text: string; created_at: string; post_variants: { id: string; platform: Platform }[] }[] };
  } catch (e) { return fail(e); }
}

// ---------- media ----------
// The browser uploads the file straight to Supabase Storage with a one-time signed URL made here,
// so big files never pass through the server and no login is needed in the browser.
export async function prepareUpload(postId: string, ext: string):
  Promise<{ ok: true; path: string; token: string } | { ok: false; error: string }> {
  try {
    const supabase = await db();
    if (!UUID.test(postId) || !UPLOAD_TYPES[ext]) return { ok: false, error: "Bad upload request" };
    const { data: post } = await supabase.from("posts").select("id").eq("id", postId).maybeSingle();
    if (!post) return { ok: false, error: "Post not found" };
    const { data, error } = await supabase.storage.from("post-media")
      .createSignedUploadUrl(`${postId}/${crypto.randomUUID()}.${ext}`);
    if (error) throw error;
    return { ok: true, path: data.path, token: data.token };
  } catch (e) { return fail(e); }
}

export async function addMedia(postId: string, path: string, sortOrder: number):
  Promise<{ ok: true; media: Media } | { ok: false; error: string }> {
  try {
    const supabase = await db();
    const ext = path.split(".").pop() ?? "";
    if (!UUID.test(postId) || !path.startsWith(`${postId}/`) || !UPLOAD_TYPES[ext]) return { ok: false, error: "Bad upload path" };
    const { data: pub } = supabase.storage.from("post-media").getPublicUrl(path);
    const { data, error } = await supabase.from("media")
      .insert({ post_id: postId, storage_path: path, public_url: pub.publicUrl, mime_type: UPLOAD_TYPES[ext], sort_order: sortOrder })
      .select("*").single();
    if (error) {
      await supabase.storage.from("post-media").remove([path]);
      throw error;
    }
    revalidatePath(`/posts/${postId}`);
    return { ok: true, media: data as Media };
  } catch (e) { return fail(e); }
}

// Media that already lives on the web (for example an image URL Claude found or made)
const EXTERNAL_TYPES = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"];
export async function addExternalMedia(postId: string, url: string, mime: string, sortOrder: number):
  Promise<{ ok: true; media: Media } | { ok: false; error: string }> {
  try {
    const supabase = await db();
    if (!UUID.test(postId)) return { ok: false, error: "Bad post id" };
    if (!/^https:\/\/\S+$/i.test(url.trim())) return { ok: false, error: "Media links must start with https://" };
    if (!EXTERNAL_TYPES.includes(mime)) return { ok: false, error: `Unsupported media type ${mime}` };
    const { data, error } = await supabase.from("media")
      .insert({ post_id: postId, storage_path: "external", public_url: url.trim(), mime_type: mime, sort_order: sortOrder })
      .select("*").single();
    if (error) throw error;
    revalidatePath(`/posts/${postId}`);
    return { ok: true, media: data as Media };
  } catch (e) { return fail(e); }
}

export async function removeMedia(mediaId: string): Promise<Result> {
  try {
    const supabase = await db();
    const { data: m, error: me } = await supabase.from("media").select("id,post_id,storage_path").eq("id", mediaId).maybeSingle();
    if (me) throw me;
    if (!m) return { ok: false, error: "File not found" };
    const { data: users, error: ve } = await supabase.from("post_variants").select("id,status,media_ids")
      .eq("post_id", m.post_id).contains("media_ids", [mediaId]);
    if (ve) throw ve;
    if ((users ?? []).some((v) => !EDITABLE.includes(v.status))) {
      return { ok: false, error: "This file is used by a scheduled or published version." };
    }
    for (const v of users ?? []) {
      const { error } = await supabase.from("post_variants")
        .update({ media_ids: (v.media_ids as string[]).filter((x) => x !== mediaId) }).eq("id", v.id);
      if (error) throw error;
    }
    if (m.storage_path && m.storage_path !== "external") await supabase.storage.from("post-media").remove([m.storage_path]);
    const { error } = await supabase.from("media").delete().eq("id", mediaId);
    if (error) throw error;
    revalidatePath(`/posts/${m.post_id}`);
    return { ok: true, message: "File removed." };
  } catch (e) { return fail(e); }
}

function fail(e: unknown): { ok: false; error: string } {
  const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
  return { ok: false, error: msg };
}

export async function saveVariant(id: string, patch: {
  body?: string; title?: string | null; hashtags?: string[]; link_url?: string | null;
  media_ids?: string[]; group_target_id?: string | null; account_id?: string | null;
}): Promise<Result> {
  try {
    const supabase = await db();
    const clean = { ...patch };
    if (clean.hashtags) clean.hashtags = clean.hashtags.map((t) => t.trim().replace(/^#/, "")).filter(Boolean);
    const { data, error } = await supabase.from("post_variants").update(clean).eq("id", id)
      .in("status", ["draft", "failed", "manual_pending"]).select("id");
    if (error) throw error;
    if (!data?.length) return { ok: false, error: "Published versions cannot be edited." };
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) { return fail(e); }
}

// One click publish: n8n posts this version and replies with the link or the exact error.
async function callPublisher(supabase: Db, id: string): Promise<Result> {
  // RLS: only an admin can see the version, so this also checks permission
  const { data: v, error } = await supabase.from("post_variants").select("id,platform").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!v) return { ok: false, error: "Version not found" };

  const url = process.env.N8N_PUBLISH_WEBHOOK_URL;
  const secret = process.env.N8N_WEBHOOK_SECRET;
  const header = process.env.N8N_WEBHOOK_SECRET_HEADER || "x-publish-secret";
  if (!url || !secret || url.includes("YOUR-N8N-DOMAIN")) {
    return { ok: false, error: "Publish webhook is not configured. Set N8N_PUBLISH_WEBHOOK_URL and N8N_WEBHOOK_SECRET (.env.local when running locally, Environment Variables on Vercel), then restart." };
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { [header]: secret, "content-type": "application/json" },
      body: JSON.stringify({ variant_id: id }),
      signal: AbortSignal.timeout(55_000),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "n8n did not answer in time. Refresh in a minute to see the result." };
  }

  const raw = await res.text().catch(() => "");
  let body: { ok?: boolean; url?: string | null; error?: string; message?: string } | null = null;
  try { body = JSON.parse(raw); } catch { /* not JSON */ }

  // The workflow itself always answers { ok, url | error }
  if (body && typeof body.ok === "boolean") {
    if (!body.ok) return { ok: false, error: body.error ?? "Publish failed" };
    return { ok: true, message: body.url ? `Published: ${body.url}` : "Published." };
  }
  // Anything else came from n8n before the workflow ran
  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: "n8n rejected the secret. N8N_WEBHOOK_SECRET must equal the value of the \"Publish Webhook Secret\" credential in n8n." };
  }
  if (res.status === 404) {
    return { ok: false, error: "n8n has no active webhook at this URL. Turn on Social 1 and use the Production URL (it ends with /webhook/social-publish, not /webhook-test/)." };
  }
  const detail = body?.message ?? raw.replace(/\s+/g, " ").trim().slice(0, 200);
  return { ok: false, error: `n8n answered ${res.status}${detail ? `: ${detail}` : ""}. Open the Social 1 executions in n8n to see what failed.` };
}

export async function publishOne(id: string): Promise<Result> {
  try {
    return await callPublisher(await db(), id);
  } catch (e) {
    return fail(e);
  } finally {
    revalidatePath("/", "layout");
  }
}

// Server actions called from the browser run one at a time, so "Publish all" sends
// every version from here in one call to really post them in parallel.
export async function publishMany(ids: string[]): Promise<{ id: string; result: Result }[]> {
  try {
    const supabase = await db();
    return await Promise.all(ids.map(async (id) => ({ id, result: await callPublisher(supabase, id).catch(fail) })));
  } catch (e) {
    const r = fail(e);
    return ids.map((id) => ({ id, result: r }));
  } finally {
    revalidatePath("/", "layout");
  }
}

export async function startManual(id: string): Promise<Result> {
  try {
    const supabase = await db();
    const { error } = await supabase.from("post_variants").update({ status: "manual_pending" })
      .eq("id", id).in("status", ["draft", "failed", "manual_pending"]);
    if (error) throw error;
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function markManualDone(id: string, url: string): Promise<Result> {
  try {
    const supabase = await db();
    const clean = url.trim();
    if (clean && !/^https?:\/\//i.test(clean)) return { ok: false, error: "Post link must start with http" };
    const { error } = await supabase.rpc("mark_manual_done", { p_variant_id: id, p_platform_post_url: clean || null });
    if (error) throw error;
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function addVariant(postId: string, platform: Platform, groupTargetId: string | null): Promise<Result> {
  try {
    const supabase = await db();
    const { data: post, error: pe } = await supabase.from("posts").select("master_text,title").eq("id", postId).single();
    if (pe) throw pe;
    const { data: media } = await supabase.from("media").select("id,mime_type").eq("post_id", postId).order("sort_order");
    // Same rule as Compose: one click publish takes 1 image, hand-posted platforms get none
    const firstImage = (media ?? []).find((m) => m.mime_type.startsWith("image/"));
    const { error } = await supabase.from("post_variants").insert({
      post_id: postId, platform, group_target_id: groupTargetId,
      body: post.master_text, title: platform === "reddit" ? post.title : null,
      media_ids: platformMode(platform) === "api" && firstImage ? [firstImage.id] : [],
    });
    if (error) throw error;
    revalidatePath(`/posts/${postId}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function removeVariant(id: string): Promise<Result> {
  try {
    const supabase = await db();
    const { data, error } = await supabase.from("post_variants").delete().eq("id", id)
      .in("status", ["draft", "failed", "manual_pending", "canceled"]).select("id");
    if (error) throw error;
    if (!data?.length) return { ok: false, error: "Published versions cannot be removed." };
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function deletePost(postId: string): Promise<Result> {
  try {
    const supabase = await db();
    const { data: busy } = await supabase.from("post_variants").select("id")
      .eq("post_id", postId).eq("status", "publishing");
    if (busy?.length) return { ok: false, error: "A version is publishing right now. Try again in a minute." };
    const { data: files } = await supabase.from("media").select("storage_path").eq("post_id", postId);
    const paths = (files ?? []).map((f) => f.storage_path).filter((p) => p && p !== "external");
    if (paths.length) await supabase.storage.from("post-media").remove(paths);
    const { error } = await supabase.from("posts").delete().eq("id", postId);
    if (error) throw error;
  } catch (e) { return fail(e); }
  revalidatePath("/", "layout");
  redirect("/posts");
}

export async function updatePostText(postId: string, fields: { title?: string; master_text?: string; topic?: string; content_type?: string }): Promise<Result> {
  try {
    const supabase = await db();
    const { error } = await supabase.from("posts").update(fields).eq("id", postId);
    if (error) throw error;
    revalidatePath(`/posts/${postId}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

// ---------- settings ----------
export async function upsertAccount(row: {
  id?: string; platform: Platform; display_name: string; external_id: string;
  token_expires_at: string | null; is_active: boolean;
}): Promise<Result> {
  try {
    const supabase = await db();
    if (!row.display_name.trim() || !row.external_id.trim()) return { ok: false, error: "Name and ID are required" };
    const { error } = await supabase.from("accounts").upsert({
      ...row, display_name: row.display_name.trim(), external_id: row.external_id.trim(),
    });
    if (error) throw error;
    // A renewed (or switched off) token clears its "expires soon" alert now, not at the next nightly check
    const exp = row.token_expires_at ? new Date(row.token_expires_at).getTime() : null;
    if (!row.is_active || exp === null || exp > Date.now() + 7 * 864e5) await closeAlerts(supabase, row.platform, ["token_expiry"]);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function deleteAccount(id: string): Promise<Result> {
  try {
    const supabase = await db();
    const { data, error } = await supabase.from("accounts").delete().eq("id", id).select("platform");
    if (error) throw error;
    for (const a of data ?? []) await closeAlerts(supabase, a.platform, ["token", "token_expiry"]);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) { return fail(e); }
}

async function closeAlerts(supabase: Db, platform: string, kinds: string[]) {
  await supabase.from("system_alerts").update({ is_open: false, resolved_at: new Date().toISOString() })
    .eq("platform", platform).in("kind", kinds).eq("is_open", true);
}

export async function upsertGroup(row: {
  id?: string; platform: Platform; name: string; url: string; subreddit: string | null;
  flair: string | null; rules_notes: string | null; is_active: boolean;
}): Promise<Result> {
  try {
    const supabase = await db();
    if (!row.name.trim() || !row.url.trim()) return { ok: false, error: "Name and URL are required" };
    if (row.platform === "reddit" && !row.subreddit?.trim()) return { ok: false, error: "Subreddit name is required" };
    const { error } = await supabase.from("group_targets").upsert({
      ...row, subreddit: row.subreddit?.trim().replace(/^r\//, "") || null,
    });
    if (error) throw error;
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function deleteGroup(id: string): Promise<Result> {
  try {
    const supabase = await db();
    const { error } = await supabase.from("group_targets").delete().eq("id", id);
    if (error) throw error;
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function updateRule(platform: Platform, fields: {
  max_hashtags: number; tone_guide: string | null; format_notes: string | null;
}): Promise<Result> {
  try {
    const supabase = await db();
    const { error } = await supabase.from("platform_rules").update(fields).eq("platform", platform);
    if (error) throw error;
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function dismissAlert(id: string): Promise<Result> {
  try {
    const supabase = await db();
    const { error } = await supabase.from("system_alerts").update({ is_open: false, resolved_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function signOut() {
  if (AUTH_DISABLED) redirect("/");
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
