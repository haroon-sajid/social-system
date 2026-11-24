import { createClient } from "@/lib/supabase/server";
import ComposeForm, { type Prefill } from "@/components/ComposeForm";
import { PLATFORMS, type Account, type GroupTarget, type Platform, type Rule } from "@/lib/platforms";

export const dynamic = "force-dynamic";
export const metadata = { title: "New post" };

type SP = Partial<Record<"title" | "text" | "topic" | "type" | "tags" | "hashtags" | "link" | "platforms" | "media", string>>;
const list = (s?: string) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);

export default async function ComposePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [groups, rules, accounts] = await Promise.all([
    supabase.from("group_targets").select("*").eq("is_active", true).order("name"),
    supabase.from("platform_rules").select("*"),
    supabase.from("accounts").select("*").eq("is_active", true),
  ]);

  // Any field can be filled from the link, for example /compose?title=...&text=...&platforms=x,linkedin
  const ids = PLATFORMS.map((p) => p.id);
  const prefill: Prefill = {
    title: sp.title ?? "", text: sp.text ?? "", topic: sp.topic ?? "", type: sp.type ?? "",
    tags: list(sp.tags).join(", "), hashtags: list(sp.hashtags).join(" "), link: sp.link ?? "",
    platforms: list(sp.platforms).filter((p): p is Platform => ids.includes(p as Platform)),
    media: list(sp.media).filter((u) => /^https:\/\//i.test(u)),
  };

  return (
    <ComposeForm groups={(groups.data ?? []) as GroupTarget[]} rules={(rules.data ?? []) as Rule[]}
      accounts={(accounts.data ?? []) as Account[]} prefill={prefill} />
  );
}
