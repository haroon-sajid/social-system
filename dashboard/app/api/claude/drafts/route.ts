import { randomUUID } from "node:crypto";
import { EXT_OF, db, dbError, guard, json, mimeFromName, readJson } from "@/lib/claude-api";
import { PLATFORMS, type Platform } from "@/lib/platforms";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_MEDIA = 10;
const MAX_BYTES = 20 * 1024 * 1024;
const PLATFORM_IDS = PLATFORMS.map((p) => p.id);
const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const strList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/**
 * Create a post as a DRAFT with every field filled in.
 *
 * Body (JSON):
 *   title, master_text (or "text"), topic, content_type, tags[]
 *   media[]: { public_url, mime_type } for files already online (https), or
 *            { data_base64, mime_type, filename? } to upload a file (max 20 MB each, 10 files)
 *   variants[]: { platform, body, hashtags[], link_url, title (reddit), group_target_ids[], use_media,
 *                 account_ids[] (facebook: which Pages, ids from /context accounts; left out = every Page) }
 *   Shortcut instead of variants: platforms[] plus hashtags[] and link_url. Every platform then gets
 *   master_text, the link, and as many hashtags as it allows.
 */
export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const body = await readJson(req);
  if (!body) return json({ error: "Send a JSON object. See GET /api/claude for the shape." }, 400);

  const supabase = db();
  const master = str(body.master_text) ?? str(body.text) ?? "";
  if (!master.trim()) return json({ error: "master_text is required" }, 400);

  // Variants: explicit, or built from the platforms shortcut
  let variants = Array.isArray(body.variants) ? (body.variants as Record<string, unknown>[]) : [];
  if (!variants.length && Array.isArray(body.platforms)) {
    const { data: rules } = await supabase.from("platform_rules").select("platform,max_hashtags");
    const tags = strList(body.hashtags).map((t) => t.replace(/^#/, ""));
    variants = strList(body.platforms).map((p) => ({
      platform: p, body: master, link_url: str(body.link_url) ?? null, title: p === "reddit" ? str(body.title) : undefined,
      hashtags: tags.slice(0, rules?.find((r) => r.platform === p)?.max_hashtags ?? 0),
    }));
  }
  if (!variants.length) return json({ error: "Send variants[] (one per platform) or platforms[]." }, 400);
  const bad = variants.map((v) => v.platform).filter((p) => !PLATFORM_IDS.includes(p as Platform));
  if (bad.length) return json({ error: `Unknown platform: ${bad.join(", ")}. Use one of ${PLATFORM_IDS.join(", ")}.` }, 400);

  // Media: links are used as they are, base64 files are uploaded to Storage first
  const mediaIn = Array.isArray(body.media) ? (body.media as Record<string, unknown>[]) : [];
  if (mediaIn.length > MAX_MEDIA) return json({ error: `At most ${MAX_MEDIA} media items.` }, 400);
  const uploaded: string[] = [];
  const media: { public_url: string; mime_type: string; storage_path?: string }[] = [];
  const cleanup = async () => { if (uploaded.length) await supabase.storage.from("post-media").remove(uploaded); };
  try {
    for (const [i, m] of mediaIn.entries()) {
      const b64 = str(m.data_base64);
      if (b64) {
        const mime = str(m.mime_type) ?? mimeFromName(str(m.filename) ?? "") ?? "";
        if (!EXT_OF[mime]) throw new Error(`media[${i}]: mime_type must be one of ${Object.keys(EXT_OF).join(", ")}`);
        const bytes = Buffer.from(b64.replace(/^data:[^;]+;base64,/, ""), "base64");
        if (!bytes.length) throw new Error(`media[${i}]: data_base64 is empty or not base64`);
        if (bytes.length > MAX_BYTES) throw new Error(`media[${i}]: file is larger than 20 MB`);
        const path = `claude/${randomUUID()}.${EXT_OF[mime]}`;
        const { error } = await supabase.storage.from("post-media").upload(path, bytes, { contentType: mime, upsert: false });
        if (error) throw new Error(`media[${i}]: upload failed: ${error.message}`);
        uploaded.push(path);
        media.push({ public_url: supabase.storage.from("post-media").getPublicUrl(path).data.publicUrl, mime_type: mime, storage_path: path });
      } else {
        const url = str(m.public_url) ?? str(m.url) ?? "";
        if (!/^https:\/\/\S+$/i.test(url)) throw new Error(`media[${i}]: public_url must be an https link (or send data_base64)`);
        const mime = str(m.mime_type) ?? mimeFromName(url) ?? "";
        if (!EXT_OF[mime]) throw new Error(`media[${i}]: set mime_type (image/jpeg, image/png, image/webp, video/mp4 or video/quicktime)`);
        media.push({ public_url: url, mime_type: mime });
      }
    }
  } catch (e) {
    await cleanup();
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }

  const payload = {
    title: str(body.title) ?? null, master_text: master, topic: str(body.topic) ?? null,
    content_type: str(body.content_type) ?? null, tags: strList(body.tags), source: body.source === "manual" ? "manual" : "claude",
    media, variants,
  };
  const { data, error } = await supabase.rpc("create_draft_post", { payload });
  if (error) {
    await cleanup();
    return dbError(error);
  }
  const result = data as { post_id: string };
  return json({ ...result, edit_url: `${new URL(req.url).origin}/posts/${result.post_id}` }, 201);
}
