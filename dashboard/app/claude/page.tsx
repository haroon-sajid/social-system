import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ClaudeDraft, { type Draft } from "@/components/ClaudeDraft";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/ui";
import { PLATFORMS, type GroupTarget, type Platform } from "@/lib/platforms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Draft with Claude" };

export default async function ClaudePage({ searchParams }: { searchParams: Promise<{ topic?: string; type?: string; platforms?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: groups }, { data: recent }] = await Promise.all([
    supabase.from("group_targets").select("*").eq("is_active", true).order("name"),
    supabase.from("posts").select("id,title,master_text,created_at,post_variants(id,platform)")
      .eq("source", "claude").order("created_at", { ascending: false }).limit(4),
  ]);
  const ids = PLATFORMS.map((p) => p.id);
  const platforms = (sp.platforms ?? "").split(",").map((s) => s.trim()).filter((p): p is Platform => ids.includes(p as Platform));

  return (
    <>
      <PageHeader
        title={<>Draft with <strong>Claude</strong></>}
        description="Describe the post once. Claude writes a version for every platform and saves the drafts here for you to review."
        actions={
          <>
            <Link href="/settings?tab=claude" className="btn-secondary"><Icon name="code" size={15} /> Connector status</Link>
            <Link href="/compose" className="btn-secondary"><Icon name="compose" size={15} /> Write it myself</Link>
          </>
        }
      />
      <ClaudeDraft groups={(groups ?? []) as GroupTarget[]} recent={(recent ?? []) as Draft[]}
        prefill={{ topic: (sp.topic ?? "").slice(0, 2000), type: sp.type ?? "", platforms }} />
    </>
  );
}
