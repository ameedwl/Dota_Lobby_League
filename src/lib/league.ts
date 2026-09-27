import { validDotaAccountId } from "./opendota";
import { LobbyMatch, Player } from "./types";
import { sortMatches, validateMatch } from "./stats";

export interface LeagueData { players: Player[]; matches: LobbyMatch[] }
export type LeagueAction =
  | { type: "addMatch" | "updateMatch"; match: LobbyMatch }
  | { type: "deleteMatch" | "deletePlayer"; id: string }
  | { type: "addPlayer" | "updatePlayer"; player: Player };

export function validateLeague(data: LeagueData, options: { allowHistoricalMvp?: boolean } = {}): string | null {
  if (!data || !Array.isArray(data.players) || !Array.isArray(data.matches)) return "Invalid league data.";
  const ids = new Set<string>(), accounts = new Set<string>();
  for (const p of data.players) {
    if (!p || typeof p.id !== "string" || !p.id.trim() || ids.has(p.id) ||
        typeof p.name !== "string" || !p.name.trim() || typeof p.nickname !== "string" || !p.nickname.trim()) return "Players must have unique IDs, names and nicknames.";
    if (p.dotaAccountId !== undefined) {
      if (!validDotaAccountId(p.dotaAccountId)) return "Enter a valid Dota Account ID (Steam32).";
      if (accounts.has(p.dotaAccountId)) return "This Dota Account ID is already assigned to another player.";
      accounts.add(p.dotaAccountId);
    }
    ids.add(p.id);
  }
  const matchIds = new Set<string>(), dotaIds = new Set<string>();
  for (const m of data.matches) {
    const issue = validateMatch(m, data.players, options);
    if (issue) return issue;
    if (matchIds.has(m.id)) return "Duplicate match ID.";
    if (m.dotaMatchId && dotaIds.has(m.dotaMatchId)) return "This Dota Match ID is already recorded.";
    matchIds.add(m.id);
    if (m.dotaMatchId) dotaIds.add(m.dotaMatchId);
  }
  return null;
}
export function applyLeagueAction(data: LeagueData, action: LeagueAction): LeagueData {
  let next = data;
  switch (action.type) {
    case "addMatch":
      if (data.matches.some(m => m.id === action.match.id)) throw new Error("This match is already recorded.");
      next = { ...data, matches: [...data.matches, action.match] }; break;
    case "updateMatch":
      if (!data.matches.some(m => m.id === action.match.id)) throw new Error("Match no longer exists.");
      next = { ...data, matches: data.matches.map(m => m.id === action.match.id ? action.match : m) }; break;
    case "deleteMatch":
      if (!data.matches.some(m => m.id === action.id)) throw new Error("Match no longer exists.");
      next = { ...data, matches: data.matches.filter(m => m.id !== action.id) }; break;
    case "addPlayer":
      if (data.players.some(p => p.id === action.player.id)) throw new Error("Player ID already exists.");
      next = { ...data, players: [...data.players, action.player] }; break;
    case "updatePlayer":
      if (!data.players.some(p => p.id === action.player.id)) throw new Error("Player no longer exists.");
      next = { ...data, players: data.players.map(p => p.id === action.player.id ? action.player : p) }; break;
    case "deletePlayer":
      if (data.matches.some(m => m.participants.some(p => p.playerId === action.id) || m.mvpPlayerId === action.id || m.runnerUpMvpPlayerId === action.id)) throw new Error("Cannot delete a player referenced by match history.");
      if (!data.players.some(p => p.id === action.id)) throw new Error("Player no longer exists.");
      next = { ...data, players: data.players.filter(p => p.id !== action.id) }; break;
  }
  const issue = validateLeague(next);
  if (issue) throw new Error(issue);
  return { ...next, matches: sortMatches(next.matches) };
}
export function parseLeague(raw: string): LeagueData {
  const parsed = JSON.parse(raw);
  if (parsed.version !== 1) throw new Error("Unsupported saved league version.");
  const issue = validateLeague(parsed);
  if (issue) throw new Error(issue);
  return { players: parsed.players, matches: sortMatches(parsed.matches) };
}
export function serializeLeague(data: LeagueData): string {
  const issue = validateLeague(data);
  if (issue) throw new Error(issue);
  return JSON.stringify({ version: 1, players: data.players, matches: data.matches });
}

