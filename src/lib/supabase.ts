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
  if (error.code === "23503" && /hero/i.test(error.message??"")) return "Select a known hero. Update the hero catalog for new heroes.";
  if (error.code === "23505" && /match_bans/i.test(error.message??"")) return "A hero can only be banned once per match.";
  if ((error.code === "23503" || error.code === "23001")) return "This player is referenced by match history and cannot be deleted.";
  if (error.code === "23505") return error.message?.includes("players_dota_account_id_key") ? "This Dota Account ID is already assigned to another player." : "This Dota match has already been imported, or the record already exists.";
  if (error.code === "40001") return "This match changed in another session. Reload it before saving.";
  if (error.code === "23514" && /hero|ban/i.test(error.message??"")) return error.message!;
  if (error.code === "23514") return "Invalid match data. Check the teams, MVP and Runner-up MVP awards, scores and duration.";
  return error.message || "The league service is unavailable. Please try again.";
}


