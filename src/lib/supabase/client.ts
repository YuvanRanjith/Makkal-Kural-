import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://configuration-required.supabase.co";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "configuration-required";
export const supabase = createClient(url, key);
// Staff login has separate storage so it never replaces the citizen guest session.
export const staffSupabase = createClient(url, key, { auth: { storageKey: "mk-staff-auth" } });
export function requireSupabaseConfig() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) throw new Error("Supabase is not configured. Follow README.md to set up the project.");
}
