import type { ReactNode, SVGProps } from "react";
import type { Platform } from "@/lib/platforms";

// Stroke icons (24x24, Feather-style). Used for navigation, buttons and the preview action bars.
const PATHS = {
  posts: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  compose: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  analytics: <><path d="M3 3v18h18" /><path d="M18 17V9M13 17V5M8 17v-3" /></>,
  insights: <><path d="M9 18h6M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.74V17h8v-2.26A7 7 0 0 0 12 2z" /></>,
  settings: <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5M12 3v12" /></>,
  trash: <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />,
  external: <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />,
  check: <path d="M20 6 9 17l-5-5" />,
  alert: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
  info: <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
  video: <><rect x="2" y="5" width="14" height="14" rx="2" /><path d="m22 8-6 4 6 4z" /></>,
  clock: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
  copy: <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  send: <><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></>,
  heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" />,
  comment: <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z" />,
  repeat: <><path d="m17 1 4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></>,
  bookmark: <path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />,
  share: <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" />,
  forward: <path d="M15 5l6 6-6 6M21 11H9a6 6 0 0 0-6 6v2" />,
  thumbsUp: <path d="M7 10v12M15 5.9 14 10h5.8a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 18.4 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.8a2 2 0 0 0 1.8-1.1L12 2a3.1 3.1 0 0 1 3 3.9z" />,
  globe: <><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></>,
  arrowUp: <path d="M12 4 4 13h5v7h6v-7h5z" />,
  arrowDown: <path d="m12 20 8-9h-5V4H9v7H4z" />,
  views: <path d="M5 20v-6M12 20V8M19 20V4" />,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>,
  user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>,
  hash: <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />,
  sparkles: <><path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 3v4M17 5h4M5 17v4M3 19h4" /></>,
  logout: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8" /></>,
  inbox: <><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
  selector: <path d="m7 15 5 5 5-5M7 9l5-5 5 5" />,
  code: <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />,
  maximize: <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />,
  trendUp: <path d="m3 17 6-6 4 4 8-8M15 7h6v6" />,
  trendDown: <path d="m3 7 6 6 4-4 8 8M15 17h6v-6" />,
  logo: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></>,
  more: <><circle cx="5" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="19" cy="12" r="1.2" fill="currentColor" /></>,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, strokeWidth = 1.8, ...rest }: { name: IconName; size?: number; strokeWidth?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      {PATHS[name]}
    </svg>
  );
}

// ---------- platforms ----------

export const PLATFORM_HEX: Record<Platform, string> = {
  facebook: "#1877F2", instagram: "#E1306C", threads: "#101010", linkedin: "#0A66C2",
  x: "#0F1419", reddit: "#FF4500", facebook_group: "#1877F2",
};

const BADGE_BG: Record<Platform, string> = {
  facebook: "bg-facebook",
  instagram: "bg-[linear-gradient(45deg,#FEDA75_0%,#FA7E1E_25%,#D62976_50%,#962FBF_75%,#4F5BD5_100%)]",
  threads: "bg-threads",
  linkedin: "bg-linkedin",
  x: "bg-x",
  reddit: "bg-reddit",
  facebook_group: "bg-facebook",
};

// White glyphs drawn on the platform color (24x24)
const GLYPHS: Record<Platform, ReactNode> = {
  facebook: <path fill="#fff" d="M13.4 21v-7.6H16l.4-3h-3V8.5c0-.9.3-1.5 1.5-1.5h1.6V4.3a21 21 0 0 0-2.3-.1c-2.3 0-3.9 1.4-3.9 4v2.2H7.7v3h2.6V21z" />,
  instagram: (
    <g fill="none" stroke="#fff" strokeWidth="1.9">
      <rect x="4.5" y="4.5" width="15" height="15" rx="4.5" />
      <circle cx="12" cy="12" r="3.6" />
      <circle cx="16.6" cy="7.4" r=".6" fill="#fff" stroke="none" />
    </g>
  ),
  threads: (
    <g fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="3.3" />
      <path d="M15.3 8.8v3.9a2.4 2.4 0 0 0 4.8 0V12a8.1 8.1 0 1 0-3.2 6.5" />
    </g>
  ),
  linkedin: (
    <g fill="#fff">
      <rect x="5.4" y="9.6" width="2.8" height="9" rx=".3" />
      <circle cx="6.8" cy="6.4" r="1.65" />
      <path d="M10.4 9.6h2.7v1.3c.4-.8 1.4-1.5 2.9-1.5 2.9 0 3.5 1.9 3.5 4.4v4.8h-2.8v-4.2c0-1.1 0-2.3-1.5-2.3s-1.7 1.1-1.7 2.2v4.3h-3.1z" />
    </g>
  ),
  x: (
    <g>
      <path fill="#fff" d="M5 4.5h4.2l9.8 15h-4.2z" />
      <path stroke="#fff" strokeWidth="1.7" strokeLinecap="round" d="M18.6 4.6 5.4 19.4" />
    </g>
  ),
  reddit: (
    <g>
      <circle cx="17.4" cy="5.9" r="1.35" fill="#fff" />
      <path d="M12 9.2l1-4.1 3.2.8" stroke="#fff" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <circle cx="6.4" cy="11.4" r="1.5" fill="#fff" />
      <circle cx="17.6" cy="11.4" r="1.5" fill="#fff" />
      <ellipse cx="12" cy="13.9" rx="6.4" ry="4.5" fill="#fff" />
      <circle cx="9.6" cy="13.3" r="1.05" fill="#FF4500" />
      <circle cx="14.4" cy="13.3" r="1.05" fill="#FF4500" />
      <path d="M9.8 15.9c1.3.8 3.1.8 4.4 0" stroke="#FF4500" strokeWidth="1" fill="none" strokeLinecap="round" />
    </g>
  ),
  facebook_group: (
    <g fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" transform="translate(3 3) scale(.75)">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
    </g>
  ),
};

export function PlatformIcon({ platform, size = 24, rounded = "rounded-lg", className = "" }: {
  platform: Platform; size?: number; rounded?: string; className?: string;
}) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center ${rounded} ${BADGE_BG[platform]} ${className}`}
      style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size * 0.78} height={size * 0.78} viewBox="0 0 24 24">{GLYPHS[platform]}</svg>
    </span>
  );
}
