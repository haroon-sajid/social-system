import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { AUTH_DISABLED } from "@/lib/auth-mode";

// No generated database types, so rows are untyped (same as before)
type ServerClient = SupabaseClient;

export async function createClient(): Promise<ServerClient> {
  if (AUTH_DISABLED) {
    await connection(); // always render at request time, never query the database during `next build`
    return createAdminClient();
  }

  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(toSet) {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component: the proxy refreshes the session instead.
          }
        },
      },
    },
  );
}

export const serviceKeySet = () => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return !!key && !key.startsWith("PASTE_");
};

// Service role client (server only, never sent to the browser). Used when login is off,
// and by the Claude API routes, which check their own API key instead of a login.
export function createServiceClient(): ServerClient {
  if (!serviceKeySet()) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set in .env.local (or in your host's environment variables). " +
      "Copy the service_role key from Supabase (Project Settings, API Keys), paste it there, then restart.",
    );
  }
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
const createAdminClient = createServiceClient;
