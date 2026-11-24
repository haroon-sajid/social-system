// Builds the message sent to the Claude app. It tells Claude exactly how to use the Social Hub connector
// tools (get_platform_rules, create_draft, update_variant) so the drafts land in the dashboard correctly.
import { platformLabel, type GroupTarget, type Platform } from "@/lib/platforms";

export type ClaudeRequest = {
  topic: string;
  details: string;
  platforms: Platform[];
  targets: GroupTarget[];
  contentType: string; // "auto" or one of CONTENT_TYPES
  tone: string;        // "rules" or a tone name
  language: string;
  link: string;
  image: string;
};

const IMAGE_TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
export const imageMime = (url: string) => IMAGE_TYPES[url.split(/[?#]/)[0].split(".").pop()?.toLowerCase() ?? ""] ?? null;

export function buildClaudePrompt(r: ClaudeRequest) {
  const names = r.platforms.map(platformLabel).join(", ");
  const hasReddit = r.platforms.includes("reddit");
  const mime = r.image ? imageMime(r.image) : null;
  const needsImage = r.platforms.includes("instagram") && !r.image;
  // Reddit or a Facebook Group picked without a saved target: Claude cannot set it, the user picks it later
  const needsTarget = (["reddit", "facebook_group"] as Platform[]).some((p) => r.platforms.includes(p) && !r.targets.some((g) => g.platform === p));
  const okErrors = [
    needsImage && "Instagram's \"image is required\"",
    needsTarget && "\"group or subreddit target is required\"",
  ].filter(Boolean) as string[];

  const steps = [
    "Call get_platform_rules first and follow every platform's rules: max_chars (counts the body plus the link and hashtags), max_hashtags, tone_guide, format_notes and link_policy.",
    `Write a separate version for each platform: ${names}. Adapt the hook, length and structure to each platform; do not paste the same text everywhere.` +
      (hasReddit ? " Reddit also needs a title within max_title_chars." : ""),
    "Save everything with ONE create_draft call: source \"claude\", a short internal title, the full original text as master_text, the topic, the content_type, and one variant per platform. " +
      "Put hashtags only in each variant's hashtags array, without # and not inside body." +
      (r.link ? " Use the link as link_url on the platforms where links are allowed." : "") +
      (r.targets.length ? " Use the group_target_ids listed below for the Facebook Group and Reddit variants." : "") +
      (r.image && mime ? ` Add media: [{"public_url": "${r.image}", "mime_type": "${mime}"}].` : ""),
    "If any variant comes back with errors, fix it with update_variant until no errors are left." +
      (okErrors.length ? ` Leave ${okErrors.join(" and ")} as they are: I will handle ${okErrors.length > 1 ? "those" : "that"} in the dashboard.` : ""),
    "Do not publish anything. Finish with a short summary: the post_id and each platform's character count.",
  ];

  const details = [
    `Topic: ${r.topic.trim()}`,
    r.details.trim() && `Details to include: ${r.details.trim()}`,
    `Platforms: ${names}`,
    ...r.targets.map((g) => g.platform === "reddit"
      ? `Reddit: r/${g.subreddit} (group_target_id ${g.id})${g.rules_notes ? `. Subreddit rules: ${g.rules_notes}` : ""}${g.flair ? `. Flair: ${g.flair}` : ""}`
      : `Facebook Group: ${g.name} (group_target_id ${g.id})${g.rules_notes ? `. Group rules: ${g.rules_notes}` : ""}`),
    `Content type: ${r.contentType === "auto" ? "choose the best fit (tip, story, announcement, promo, question, case_study, opinion, news)" : r.contentType}`,
    `Tone: ${r.tone === "rules" ? "follow each platform's tone_guide" : r.tone}`,
    `Language: ${r.language}`,
    r.link.trim() && `Link: ${r.link.trim()}`,
    r.image.trim() && `Image: ${r.image.trim()}`,
  ].filter(Boolean);

  return [
    "Use my Social Hub connector to create a draft post.",
    "",
    ...steps.map((s, i) => `${i + 1}. ${s}`),
    "",
    "Post details:",
    ...details.map((d) => `- ${d}`),
  ].join("\n");
}

// Plain-language version of the steps, shown in the dashboard
export function promptSummary(r: Pick<ClaudeRequest, "platforms" | "targets" | "image" | "link">) {
  return [
    "Reads your platform rules (limits, tone, format notes)",
    `Writes ${r.platforms.length} version${r.platforms.length === 1 ? "" : "s"}, one per platform, each fitted to its platform`,
    r.targets.length ? `Uses your saved ${r.targets.length === 1 ? "group or subreddit" : "groups and subreddits"} and their rules` : null,
    r.link ? "Adds your link where links work" : null,
    r.image ? "Attaches your image" : null,
    "Saves it as a draft and fixes any errors",
    "Never publishes anything: the drafts wait for your review",
  ].filter((x): x is string => !!x);
}
