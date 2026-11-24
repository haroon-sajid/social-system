import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PostEditor from "@/components/PostEditor";
import type { Account, GroupTarget, Media, Rule, Variant } from "@/lib/platforms";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // one click publish waits for n8n

const ORDER = ["facebook", "instagram", "threads", "linkedin", "x", "reddit", "facebook_group"];

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [post, variants, media, rules, groups, accounts, logs] = await Promise.all([
    supabase.from("posts").select("*").eq("id", id).maybeSingle(),
    supabase.from("post_variants").select("*").eq("post_id", id),
    supabase.from("media").select("*").eq("post_id", id).order("sort_order"),
    supabase.from("platform_rules").select("*"),
    supabase.from("group_targets").select("*").eq("is_active", true).order("name"),
    supabase.from("accounts").select("*").eq("is_active", true),
    supabase.from("publish_log").select("variant_id,attempt,outcome,error,created_at")
      .in("variant_id", (await supabase.from("post_variants").select("id").eq("post_id", id)).data?.map((v) => v.id) ?? [])
      .order("created_at", { ascending: false }).limit(50),
  ]);
  if (!post.data) notFound();

  const sorted = ((variants.data ?? []) as Variant[]).sort(
    (a, b) => ORDER.indexOf(a.platform) - ORDER.indexOf(b.platform));

  return (
    <PostEditor
      post={post.data}
      variants={sorted}
      media={(media.data ?? []) as Media[]}
      rules={(rules.data ?? []) as Rule[]}
      groups={(groups.data ?? []) as GroupTarget[]}
      accounts={(accounts.data ?? []) as Account[]}
      logs={logs.data ?? []}
    />
  );
}
