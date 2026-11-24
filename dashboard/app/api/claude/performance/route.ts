import { db, dbError, guard, json } from "@/lib/claude-api";

export const dynamic = "force-dynamic";

// Analytics summary: totals by platform, engagement by content type and posting hour, top and worst posts.
export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const days = Math.min(365, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 30));
  const { data, error } = await db().rpc("get_performance_summary", { p_days: days });
  if (error) return dbError(error);
  return json(data);
}
