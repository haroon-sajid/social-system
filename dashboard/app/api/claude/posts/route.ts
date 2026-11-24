import { db, dbError, guard, json } from "@/lib/claude-api";

export const dynamic = "force-dynamic";

// Recent posts with each platform version's status, post link and last error.
export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const limit = Math.min(50, Math.max(1, Number(new URL(req.url).searchParams.get("limit")) || 10));
  const { data, error } = await db().rpc("list_recent_posts", { p_limit: limit });
  if (error) return dbError(error);
  return json(data);
}
