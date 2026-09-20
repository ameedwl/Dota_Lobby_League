import { LobbyMatch, Player, PlayerStats } from "./types";

export const MIN_GAMES_FOR_RATE = 5;
const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

// Newest first; IDs resolve equal timestamps independently of input order.
export function sortMatches(matches: LobbyMatch[]): LobbyMatch[] {
  return [...matches].sort((a, b) => Date.parse(b.playedAt) - Date.parse(a.playedAt) || compareText(a.id, b.id));
}
export function calculatePlayerStats(players: Player[], matches: LobbyMatch[]): PlayerStats[] {
  const chronological = sortMatches(matches);
  return players.map(player => {
    const played = chronological.filter(m => m.participants.some(p => p.playerId === player.id));
    const form: ("W" | "L")[] = played.map(m => m.participants.find(p => p.playerId === player.id)!.team === m.winner ? "W" : "L");
    const wins = form.filter(x => x === "W").length;
    let best = 0, run = 0;
    for (const outcome of [...form].reverse()) {
      run = outcome === "W" ? run + 1 : 0;
      best = Math.max(best, run);
    }
    const type = form[0] ?? null;
    let current = 0;
    while (current < form.length && form[current] === type) current++;
    return {
      player, rank: 0, games: played.length, wins, losses: played.length - wins,
      winRate: played.length ? wins / played.length * 100 : 0,
      currentStreak: current, streakType: type,
      currentWinStreak: type === "W" ? current : 0,
      currentLossStreak: type === "L" ? current : 0,
      bestWinStreak: best, mvps: played.filter(m => m.mvpPlayerId === player.id).length,
      runnerUpMvpCount: played.filter(m => m.runnerUpMvpPlayerId === player.id).length,
      recentForm: form.slice(0, 5),
    };
  }).sort((a, b) => b.wins - a.wins || b.winRate - a.winRate || compareText(a.player.id, b.player.id))
    .map((s, i) => ({ ...s, rank: i + 1 }));
}
export function validateMatch(match: LobbyMatch, players?: Player[], options: { allowHistoricalMvp?: boolean } = {}): string | null {
  if (!match || typeof match.id !== "string" || !match.id.trim()) return "Match ID is required.";
  if (!Array.isArray(match.participants) || match.participants.length !== 10 ||
      match.participants.some(p => !p || (p.team !== "radiant" && p.team !== "dire")) ||
      match.participants.filter(p => p.team === "radiant").length !== 5 ||
      match.participants.filter(p => p.team === "dire").length !== 5) return "Each team must have exactly five players.";
  const ids = match.participants.map(p => p.playerId);
  if (ids.some(id => typeof id !== "string" || !id.trim())) return "Choose a player for every team slot.";
  if (new Set(ids).size !== 10) return "A player cannot appear more than once or belong to both teams.";
  if (players && ids.some(id => !players.some(p => p.id === id))) return "Every participant must be an existing player.";
  if (match.winner !== "radiant" && match.winner !== "dire") return "Choose Radiant or Dire as the winner.";
  if (match.mvpPlayerId != null && !ids.includes(match.mvpPlayerId)) return "MVP must be a participating player.";
  if (match.runnerUpMvpPlayerId != null && !ids.includes(match.runnerUpMvpPlayerId)) return "Runner-up MVP must be a participating player.";
  if (match.mvpPlayerId != null && match.mvpPlayerId === match.runnerUpMvpPlayerId) return "MVP and Runner-up MVP must be different players.";
  // Only reads may preserve MVPs awarded under the old any-participant rule.
  if (!options.allowHistoricalMvp && match.mvpPlayerId != null &&
      !match.participants.some(p => p.playerId === match.mvpPlayerId && p.team === match.winner)) return "MVP must be on the winning team.";
  if (match.runnerUpMvpPlayerId != null &&
      !match.participants.some(p => p.playerId === match.runnerUpMvpPlayerId && p.team !== match.winner)) return "Runner-up MVP must be on the losing team.";
  if (typeof match.playedAt !== "string" || !Number.isFinite(Date.parse(match.playedAt)) || !/(Z|[+-]\d{2}:\d{2})$/.test(match.playedAt)) return "Enter a valid played date and time.";
  for (const [label, score] of [["Radiant", match.radiantScore], ["Dire", match.direScore]] as const) {
    if (score !== undefined && (!Number.isSafeInteger(score) || score < 0)) return label + " score must be a non-negative whole number.";
  }
  if (match.durationMinutes !== undefined && (typeof match.durationMinutes !== "number" || !Number.isFinite(match.durationMinutes) || match.durationMinutes <= 0)) return "Duration must be a positive number of minutes.";
  if (match.dotaMatchId !== undefined && (typeof match.dotaMatchId !== "string" || !/^\d+$/.test(match.dotaMatchId))) return "Dota Match ID must contain digits only.";
  return null;
}
export function opponentRecords(id: string, players: Player[], matches: LobbyMatch[]) {
  return players.filter(p => p.id !== id).map(player => {
    const games = matches.filter(m => {
      const mine = m.participants.find(x => x.playerId === id);
      const theirs = m.participants.find(x => x.playerId === player.id);
      return mine && theirs && mine.team !== theirs.team;
    });
    const wins = games.filter(m => m.participants.find(x => x.playerId === id)!.team === m.winner).length;
    return { player, games: games.length, wins, losses: games.length - wins, rate: games.length ? wins / games.length * 100 : 0 };
  }).sort((a, b) => b.games - a.games || compareText(a.player.id, b.player.id));
}
export function leagueRecords(stats: PlayerStats[]) {
  return ([
    ["Most Wins", "wins"], ["Highest Win Rate", "winRate"], ["Longest Win Streak", "bestWinStreak"],
    ["Most MVP Awards", "mvps"], ["Most Games Played", "games"],
    ["Most Runner-up MVP Awards", "runnerUpMvpCount"],
  ] as const).map(([label, key]) => {
    const eligible = stats.filter(s => s.games >= (key === "winRate" ? MIN_GAMES_FOR_RATE : 1));
    const value = eligible.length ? Math.max(...eligible.map(s => s[key])) : null;
    return { label, key, value, holders: eligible.filter(s => s[key] === value).sort((a, b) => a.rank - b.rank) };
  });
}

