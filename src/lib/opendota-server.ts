import { createClient } from "@supabase/supabase-js";
import { fetchOpenDotaMatch, normalizeMatchId, OpenDotaError } from "./opendota";

export async function verifyImportAdmin(request: Request): Promise<void> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw new OpenDotaError("Sign in as the league administrator to import a match.", 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new OpenDotaError("The shared league is not configured.", 503);
  // Use the caller's JWT and the public key. No privileged database client.
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: authorization }, fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(8000) }) },
  });
  const { data, error } = await client.auth.getUser(authorization.slice(7));
  if (error || !data.user) throw new OpenDotaError("Your session expired. Sign in again to import.", 401);
  const profile = await client.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  if (profile.error || profile.data?.role !== "admin") throw new OpenDotaError("Only the league administrator can import matches.", 403);
}
export async function handleOpenDotaRequest(request: Request, matchId: string, verify = verifyImportAdmin, load = fetchOpenDotaMatch) {
  const headers = { "Cache-Control": "no-store" };
  try {
    await verify(request);
    const id = normalizeMatchId(matchId);
    return Response.json(await load(id), { headers });
  } catch (error) {
    return Response.json({ error: error instanceof OpenDotaError ? error.message : "Could not retrieve this match. You can still enter it manually below." },
      { status: error instanceof OpenDotaError ? error.status : 502, headers });
  }
}
