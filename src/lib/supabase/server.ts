import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
export async function authenticatedClient(req: NextRequest) {
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) throw new Error("UNAUTHORIZED");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing.");
  const client = createClient(url, key, { global: { headers: { Authorization: 'Bearer ' + token } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new Error("UNAUTHORIZED");
  return { client, user: data.user };
}
