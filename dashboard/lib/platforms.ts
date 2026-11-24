// Mirrors the database rules (compose_full, platform_char_count, validate_variant)
// so the dashboard shows the same counts and errors the database will enforce.

export type Platform = "facebook" | "instagram" | "threads" | "linkedin" | "x" | "reddit" | "facebook_group";
export type PublishMode = "api" | "intent_link" | "copy_open";
export type VariantStatus =
  | "draft" | "approved" | "scheduled" | "publishing" | "processing"
  | "published" | "failed" | "manual_pending" | "canceled";

export interface Rule {
  platform: Platform;
  publish_mode: PublishMode;
  max_chars: number;
  max_title_chars: number | null;
  max_hashtags: number;
  media_required: boolean;
  allowed_media: string[];
  link_policy: string | null;
  tone_guide: string | null;
  format_notes: string | null;
}

export interface Variant {
  id: string;
  post_id: string;
  platform: Platform;
  account_id: string | null;
  group_target_id: string | null;
  title: string | null;
  body: string;
  hashtags: string[];
  link_url: string | null;
  media_ids: string[];
  status: VariantStatus;
  scheduled_at: string | null;
  published_at: string | null;
  platform_post_url: string | null;
  last_error: string | null;
  publish_attempts: number;
  locked_at: string | null;
}

// The database lets a stuck "publishing" version be retried after 3 minutes (start_publish)
export const STUCK_AFTER_MS = 3 * 60_000;
export function isStuck(v: Pick<Variant, "status" | "locked_at">, now = Date.now()) {
  return v.status === "publishing" && (!v.locked_at || now - new Date(v.locked_at).getTime() > STUCK_AFTER_MS);
}

export interface Media {
  id: string;
  post_id: string;
  public_url: string;
  mime_type: string;
  storage_path: string;
  sort_order: number;
}

export interface GroupTarget {
  id: string;
  platform: Platform;
  name: string;
  url: string;
  subreddit: string | null;
  flair: string | null;
  rules_notes: string | null;
  is_active: boolean;
}

export interface Account {
  id: string;
  platform: Platform;
  display_name: string;
  external_id: string | null;
  n8n_credential_name: string | null;
  token_expires_at: string | null;
  is_active: boolean;
  is_default: boolean;
}

// Each Facebook Page has its own Page token, saved in n8n under one of these credential names.
// The publisher picks the one set on the Page (Settings > Connected accounts). Page 1's token also serves Instagram.
export const FB_TOKENS = ["Meta Page Token", "Meta Page Token 2"] as const;
export const fbToken = (a: Pick<Account, "n8n_credential_name">) => a.n8n_credential_name || FB_TOKENS[0];

// The n8n credential each platform's account uses (Facebook: chosen per Page)
export function credentialOf(a: Pick<Account, "platform" | "n8n_credential_name">) {
  if (a.platform === "facebook") return fbToken(a);
  return ({ instagram: "Meta Page Token", threads: "Threads Token", linkedin: "LinkedIn Bearer" } as Record<string, string>)[a.platform] ?? "";
}

// The account a version posts to: its own, or the only active one for that platform.
// Facebook Groups have no account of their own; their previews use the first Facebook Page.
export function accountOf(v: Pick<Variant, "platform" | "account_id">, accounts: Account[]) {
  const platform = v.platform === "facebook_group" ? "facebook" : v.platform;
  const pool = accounts.filter((a) => a.platform === platform && a.is_active);
  if (v.account_id) return pool.find((a) => a.id === v.account_id);
  return v.platform === "facebook_group" || pool.length === 1 ? pool[0] : undefined;
}

// Facebook Page names show next to the platform only when there is more than one Page
export function pageName(v: Pick<Variant, "platform" | "account_id">, accounts: Account[]) {
  if (v.platform !== "facebook" || accounts.filter((a) => a.platform === "facebook" && a.is_active).length < 2) return undefined;
  return accountOf(v, accounts)?.display_name;
}

export const PLATFORMS: { id: Platform; label: string; mode: PublishMode; color: string }[] = [
  { id: "facebook", label: "Facebook Page", mode: "api", color: "bg-blue-600" },
  { id: "instagram", label: "Instagram", mode: "api", color: "bg-pink-600" },
  { id: "threads", label: "Threads", mode: "api", color: "bg-neutral-900" },
  { id: "linkedin", label: "LinkedIn", mode: "api", color: "bg-sky-700" },
  { id: "x", label: "X", mode: "intent_link", color: "bg-black" },
  { id: "reddit", label: "Reddit", mode: "intent_link", color: "bg-orange-600" },
  { id: "facebook_group", label: "Facebook Group", mode: "copy_open", color: "bg-indigo-600" },
];

export const platformLabel = (p: Platform) => PLATFORMS.find((x) => x.id === p)?.label ?? p;
export const platformMode = (p: Platform) => PLATFORMS.find((x) => x.id === p)?.mode ?? "api";

export const MODE_HINT: Record<PublishMode, string> = {
  api: "Publishes from the dashboard",
  intent_link: "Opens the site with your text, you press Post",
  copy_open: "Copies your text and opens the group",
};

export const STATUS_LABEL: Record<VariantStatus, string> = {
  draft: "Draft", approved: "Approved", scheduled: "Scheduled", publishing: "Publishing", processing: "Processing",
  published: "Published", failed: "Failed", manual_pending: "Post by hand", canceled: "Canceled",
};

// Pill (background, text, ring) and dot colors per status
export const STATUS_STYLE: Record<VariantStatus, string> = {
  draft: "bg-slate-100 text-slate-700 ring-slate-200",
  approved: "bg-amber-50 text-amber-800 ring-amber-200",
  scheduled: "bg-violet-50 text-violet-700 ring-violet-200",
  publishing: "bg-sky-50 text-sky-700 ring-sky-200",
  processing: "bg-sky-50 text-sky-700 ring-sky-200",
  published: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  failed: "bg-rose-50 text-rose-700 ring-rose-200",
  manual_pending: "bg-amber-50 text-amber-800 ring-amber-200",
  canceled: "bg-slate-50 text-slate-500 ring-slate-200",
};
export const STATUS_DOT: Record<VariantStatus, string> = {
  draft: "bg-slate-400", approved: "bg-amber-500", scheduled: "bg-violet-500", publishing: "bg-sky-500",
  processing: "bg-sky-500", published: "bg-emerald-500", failed: "bg-rose-500", manual_pending: "bg-amber-500",
  canceled: "bg-slate-300",
};

export const CONTENT_TYPES = ["tip", "story", "announcement", "promo", "question", "case_study", "opinion", "news"];
export const contentTypeLabel = (t: string | null | undefined) =>
  t ? t.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "Uncategorized";

const LINK_IN_TEXT: Platform[] = ["threads", "linkedin", "x", "reddit", "facebook_group"];

export function cleanTag(t: string) {
  return t.trim().replace(/^#/, "");
}

export function composeText(body: string, hashtags: string[]) {
  const tags = hashtags.map(cleanTag).filter(Boolean);
  return tags.length ? `${body}\n\n${tags.map((t) => "#" + t).join(" ")}` : body;
}

export function composeFull(platform: Platform, body: string, hashtags: string[], link: string | null) {
  let base = body;
  if (link && link.trim() && LINK_IN_TEXT.includes(platform) && !body.includes(link)) base = `${body}\n\n${link}`;
  return composeText(base, hashtags);
}

// Postgres char_length counts code points, so count code points here too.
export function charCount(platform: Platform, text: string) {
  const t = platform === "x" ? text.replace(/https?:\/\/\S+/g, "x".repeat(23)) : text;
  return Array.from(t).length;
}

// Same rule as the database (validate_variant): two active Facebook Pages need a choice
function accountError(v: Pick<Variant, "platform" | "account_id">, accounts: Account[]) {
  const who = v.platform === "facebook" ? "Facebook Page" : "account";
  const pool = accounts.filter((a) => a.platform === v.platform && a.is_active);
  if (v.account_id) return pool.some((a) => a.id === v.account_id) ? null : `its ${who} is switched off or deleted, choose another`;
  return pool.length > 1 ? `choose which ${who} to post to` : null;
}

// accounts: pass the active accounts to also check which account (Facebook Page) the version posts to
export function validate(v: Variant, rule: Rule | undefined, media: Media[], accounts?: Account[]): string[] {
  const errs: string[] = [];
  if (!rule) return ["no platform rule"];
  if (!v.body.trim()) errs.push("text is empty");
  const n = charCount(v.platform, composeFull(v.platform, v.body, v.hashtags, v.link_url));
  if (n > rule.max_chars) errs.push(`text is ${n} chars, max is ${rule.max_chars}`);
  if (v.hashtags.length > rule.max_hashtags) errs.push(`${v.hashtags.length} hashtags, max is ${rule.max_hashtags}`);
  if (rule.max_title_chars != null) {
    if (!v.title?.trim()) errs.push("title is required");
    else if (Array.from(v.title).length > rule.max_title_chars) errs.push(`title too long, max ${rule.max_title_chars}`);
  }
  const m = media.filter((x) => v.media_ids.includes(x.id));
  const videos = m.filter((x) => x.mime_type.startsWith("video/"));
  if (rule.media_required && m.length === 0) errs.push("image is required");
  if (rule.publish_mode === "api") {
    if (videos.length) errs.push("video is not supported in one click publish, post videos by hand");
    if (m.length > 1) errs.push("one click publish supports 1 image, untick the others");
    if (!videos.length && m.some((x) => !["image/jpeg", "image/png"].includes(x.mime_type))) errs.push("use a JPEG or PNG image");
    if (v.platform === "instagram" && m.some((x) => x.mime_type !== "image/jpeg")) errs.push("Instagram needs a JPEG image");
    const accErr = accounts ? accountError(v, accounts) : null;
    if (accErr) errs.push(accErr);
  }
  if ((v.platform === "reddit" || v.platform === "facebook_group") && !v.group_target_id)
    errs.push("choose a group or subreddit");
  return errs;
}

export function manualUrl(v: Variant, target: GroupTarget | undefined): string | null {
  const text = composeFull(v.platform, v.body, v.hashtags, v.link_url);
  if (v.platform === "x") return `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
  if (v.platform === "reddit") {
    const sub = target?.subreddit?.replace(/^r\//, "");
    if (!sub) return null;
    return `https://www.reddit.com/r/${encodeURIComponent(sub)}/submit?title=${encodeURIComponent(v.title ?? "")}&text=${encodeURIComponent(text)}`;
  }
  if (v.platform === "facebook_group") return target?.url ?? null;
  return null;
}

export function fmtDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Asia/Karachi", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}
