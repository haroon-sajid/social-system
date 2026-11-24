// Login switch.
// AUTH_DISABLED=true in .env.local skips the login screen on your own PC. The server then reads and
// writes Supabase with SUPABASE_SERVICE_ROLE_KEY instead of your login.
// It is ignored on Vercel, so a deployed dashboard always asks for a login.
export const AUTH_DISABLED = process.env.AUTH_DISABLED === "true" && !process.env.VERCEL;
