import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient, serviceKeySet } from "@/lib/supabase/server";

// Shared helpers for /api/claude/*: the HTTP API a Claude agent (Agent SDK, Messages API tools, scripts) calls.
// Auth: "Authorization: Bearer <SOCIAL_HUB_API_KEY>" (or "x-api-key: <key>"). It can only create and edit drafts
// and read data. Publishing stays a human click in the dashboard.

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });
}

export function apiKeySet() {
  const k = process.env.SOCIAL_HUB_API_KEY;
  return !!k && !k.startsWith("PASTE_") && k.length >= 24;
}

/** Returns an error response, or null when the request may continue. */
export function guard(req: Request) {
  if (!apiKeySet()) {
    return json({ error: "The Claude API is off. Set SOCIAL_HUB_API_KEY (24+ characters) in the dashboard environment and restart." }, 503);
  }
  if (!serviceKeySet()) {
    return json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set on the dashboard server." }, 503);
  }
  const auth = req.headers.get("authorization") ?? "";
  const given = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : (req.headers.get("x-api-key") ?? "").trim();
  const a = Buffer.from(given);
  const b = Buffer.from(process.env.SOCIAL_HUB_API_KEY!);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return json({ error: "Missing or wrong API key. Send the header: Authorization: Bearer <SOCIAL_HUB_API_KEY>" }, 401);
  }
  return null;
}

export const db = () => createServiceClient();

/** Database (PostgREST) error as a 400 with the exact message, so the agent can fix its input. */
export function dbError(e: { message?: string; details?: string | null; hint?: string | null; code?: string }) {
  return json({ error: e.message ?? "Database error", details: e.details ?? undefined, hint: e.hint ?? undefined }, 400);
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const MEDIA_TYPES: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", mp4: "video/mp4", mov: "video/quicktime",
};
export const EXT_OF: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/quicktime": "mov",
};
export const mimeFromName = (name: string) => MEDIA_TYPES[name.split(/[?#]/)[0].split(".").pop()?.toLowerCase() ?? ""] ?? null;
