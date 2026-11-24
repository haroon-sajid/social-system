import { db, dbError, guard, json, readJson } from "@/lib/claude-api";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Fix one DRAFT or FAILED platform version. Send only the fields to change.
// hashtags replaces the whole list. Returns char_count, max_chars and the remaining errors.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = guard(req);
  if (denied) return denied;
  const { id } = await params;
  if (!UUID.test(id)) return json({ error: "variant id must be a uuid" }, 400);
  const body = await readJson(req);
  if (!body) return json({ error: "Send a JSON object with body, title, hashtags or link_url." }, 400);

  const s = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
  const { data, error } = await db().rpc("update_variant_draft", {
    p_variant_id: id,
    p_body: s(body.body),
    p_title: s(body.title),
    p_hashtags: Array.isArray(body.hashtags) ? body.hashtags.filter((x) => typeof x === "string") : null,
    p_link_url: s(body.link_url),
  });
  if (error) return dbError(error);
  return json(data);
}
