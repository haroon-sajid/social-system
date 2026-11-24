import { db, dbError, guard, json } from "@/lib/claude-api";
import { CONTENT_TYPES } from "@/lib/platforms";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const supabase = db();
  const [rules, groups, accounts] = await Promise.all([
    supabase.from("platform_rules")
      .select("platform,publish_mode,max_chars,max_title_chars,max_hashtags,media_required,allowed_media,link_policy,tone_guide,format_notes")
      .order("platform"),
    supabase.from("group_targets").select("id,platform,name,url,subreddit,flair,rules_notes").eq("is_active", true).order("name"),
    supabase.from("accounts").select("id,platform,display_name").eq("is_active", true).order("created_at"),
  ]);
  const err = rules.error ?? groups.error ?? accounts.error;
  if (err) return dbError(err);

  return json({
    how_to_write: [
      "Write one version per platform that fits its rules below (max_chars counts the final text: body + link + hashtags).",
      "Put hashtags in the hashtags array without #. They are appended to the body automatically, so do not repeat them in body.",
      "link_url is appended to the text on threads, linkedin, x, reddit and facebook_group, and becomes a link preview on facebook. Instagram links are not clickable.",
      "reddit needs a title (max_title_chars) and a subreddit from group_targets. facebook_group needs a group from group_targets.",
      "There can be more than one Facebook Page (accounts with platform facebook). Set account_ids on the facebook variant to the Page ids it should go to; one version is saved per Page. Leave account_ids out to use every Page.",
      "Instagram needs one JPEG image. One-click publishing supports text plus 1 image; videos are posted by hand.",
      "Nothing is published. The user reviews every platform in the dashboard and clicks Publish.",
    ],
    content_types: CONTENT_TYPES,
    platforms: rules.data,
    group_targets: groups.data,
    accounts: accounts.data,
  });
}
