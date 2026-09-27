import type { LobbyMatch, MatchBan, Player, Team } from "./types";

export class OpenDotaError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}
export interface ImportedMatch {
  dotaMatchId: string;
  winner: Team;
  radiantScore?: number;
  direScore?: number;
  durationMinutes?: number;
  playedAt?: string;
  bans?: MatchBan[];
  participants: { slot: number; team: Team; accountId: string | null; heroId?: number }[];
}
// Steam32 is an unsigned 32-bit ID. OpenDota uses 4294967295 for anonymous players.
export function validDotaAccountId(value: string): boolean {
  return /^[1-9]\d{0,9}$/.test(value) && Number(value) < 4294967295;
}
export function normalizeMatchId(value: string): string {
  const id = value.trim().replace(/^0+(?=\d)/, "");
  if (!/^[1-9]\d{0,15}$/.test(id) || !Number.isSafeInteger(Number(id)))
    throw new OpenDotaError("Enter a valid numeric Dota Match ID.", 400);
  return id;
}
export function existingDotaMatch(matches: LobbyMatch[], id: string, exceptId?: string) {
  const normalized = id.trim().replace(/^0+(?=\d)/, "");
  return normalized ? matches.find(m => m.id !== exceptId && m.dotaMatchId?.replace(/^0+(?=\d)/, "") === normalized) : undefined;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new OpenDotaError("OpenDota returned malformed match data.");
  return value as Record<string, unknown>;
}
function optionalInteger(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new OpenDotaError("OpenDota returned malformed match data.");
  return value;
}
export function parseOpenDotaMatch(raw: unknown, requestedId: string): ImportedMatch {
  const data = record(raw);
  if ((typeof data.match_id !== "number" && typeof data.match_id !== "string") ||
      normalizeMatchId(String(data.match_id)) !== normalizeMatchId(requestedId) || typeof data.radiant_win !== "boolean")
    throw new OpenDotaError("OpenDota returned an incomplete or mismatched match.");
  if (!Array.isArray(data.players) || data.players.length !== 10)
    throw new OpenDotaError("This match must contain exactly ten participants (five per team). Enter it manually if needed.");
  const slots = new Set<number>(), accounts = new Set<string>();
  const participants = data.players.map(value => {
    const p = record(value), slot = p.player_slot;
    if (typeof slot !== "number" || !Number.isInteger(slot) || !((slot >= 0 && slot <= 4) || (slot >= 128 && slot <= 132)) || slots.has(slot))
      throw new OpenDotaError("OpenDota did not return five distinct slots for each team.");
    slots.add(slot);
    const accountId = p.account_id == null || p.account_id === 0 || p.account_id === 4294967295 ? null : String(p.account_id);
    if (accountId && (!validDotaAccountId(accountId) || accounts.has(accountId)))
      throw new OpenDotaError("OpenDota returned invalid or duplicate player account IDs.");
    if (accountId) accounts.add(accountId);
    const hero = optionalInteger(p.hero_id);
    return { ...(hero ? {heroId:hero} : {}), slot, team: (slot < 128 ? "radiant" : "dire") as Team, accountId };
  }).sort((a, b) => a.slot - b.slot);
  const seconds = optionalInteger(data.duration), start = optionalInteger(data.start_time);
  let playedAt: string | undefined;
  if (start !== undefined) {
    const date = new Date(start * 1000);
    if (start === 0 || !Number.isFinite(date.getTime()) || date.getUTCFullYear() > 9999) throw new OpenDotaError("OpenDota returned an invalid played date.");
    playedAt = date.toISOString();
  }
  return { dotaMatchId: normalizeMatchId(requestedId), winner: data.radiant_win ? "radiant" : "dire",
    radiantScore: optionalInteger(data.radiant_score), direScore: optionalInteger(data.dire_score),
    durationMinutes: seconds ? seconds / 60 : undefined, playedAt, participants, ...parseOpenDotaBans(data.picks_bans) };
}
// Participant assignments, never draft picks, are the source of played heroes.
export function parseOpenDotaBans(raw: unknown): { bans?: MatchBan[] } {
  if (raw == null) return {};
  if (!Array.isArray(raw)) throw new OpenDotaError("OpenDota returned malformed draft data.");
  const bans: MatchBan[] = [];
  for (const value of raw) {
    const event = record(value);
    if (typeof event.is_pick !== "boolean") throw new OpenDotaError("OpenDota returned malformed draft data.");
    if (event.is_pick) continue;
    const id = optionalInteger(event.hero_id);
    if (!id || (event.team !== 0 && event.team !== 1)) throw new OpenDotaError("OpenDota returned invalid ban data.");
    if (bans.some(b=>b.heroId===id)) throw new OpenDotaError("OpenDota returned duplicate banned heroes.");
    bans.push({team:event.team===0?"radiant":"dire",heroId:id});
  }
  return {bans};
}
export function mapImportedPlayers(match: ImportedMatch, players: Player[]): string[] {
  return match.participants.map(slot => {
    const found = slot.accountId ? players.filter(p => p.dotaAccountId === slot.accountId) : [];
    return found.length === 1 ? found[0].id : "";
  });
}
export async function fetchOpenDotaMatch(id: string, fetcher: typeof fetch = fetch, timeoutMs = 12000): Promise<ImportedMatch> {
  const normalized = normalizeMatchId(id), controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher("https://api.opendota.com/api/matches/" + normalized, {
      signal: controller.signal, cache: "no-store", headers: { Accept: "application/json" },
    });
    if (response.status === 404) throw new OpenDotaError("This match was not found on OpenDota. You can still enter it manually below.", 404);
    if (response.status === 429) throw new OpenDotaError("OpenDota is rate limiting requests. Please wait before trying again.", 429);
    if (!response.ok) throw new OpenDotaError("OpenDota is unavailable. You can still enter the match manually below.");
    let data: unknown;
    try { data = await response.json(); } catch { throw new OpenDotaError("OpenDota returned malformed match data."); }
    return parseOpenDotaMatch(data, normalized);
  } catch (error) {
    if (controller.signal.aborted) throw new OpenDotaError("OpenDota timed out. Try again or enter the match manually below.", 504);
    if (error instanceof OpenDotaError) throw error;
    throw new OpenDotaError("Could not retrieve this match from OpenDota. You can still enter it manually below.");
  } finally { clearTimeout(timeout); }
}
