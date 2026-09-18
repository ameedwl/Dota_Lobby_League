import { createClient, SupabaseClient } from "@supabase/supabase-js";
let client: SupabaseClient | null = null;
export function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!client) client = createClient(url, key, {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  return client;
}
export function backendError(error: {code?: string; message?: string}): string {
  if (error.code === "42501" || error.code === "PGRST301") return "Only the league administrator can make changes. Sign in with the admin account.";
  if ((error.code === "23503" || error.code === "23001")) return "This player is referenced by match history and cannot be deleted.";
  if (error.code === "23505") return "That record or Dota Match ID already exists.";
  if (error.code === "40001") return "This match changed in another session. Reload it before saving.";
  if (error.code === "23514") return "Invalid match data. Check the teams, MVP, scores and duration.";
  return error.message || "The league service is unavailable. Please try again.";
}


