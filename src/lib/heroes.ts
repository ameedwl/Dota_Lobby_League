import catalog from "./hero-catalog.json";
import type { LobbyMatch } from "./types";

// Checked-in OpenDota dotaconstants snapshot, 2026-09-27. No runtime API dependency.
export const heroes = [...catalog].sort((a, b) => a.name.localeCompare(b.name, "en"));
const byId = new Map(catalog.map(hero => [hero.id, hero]));
export const isKnownHero = (id: number) => byId.has(id);
export const heroName = (id: number) => byId.get(id)?.name ?? "Hero #" + id;
export function validateHeroData(match: Pick<LobbyMatch, "participants" | "bans">): string | null {
  const picked = match.participants.flatMap(p => p.heroId == null ? [] : [p.heroId]);
  if (picked.some(id => !Number.isInteger(id) || !isKnownHero(id))) return "Select a known hero for each participant. Update the hero catalog for new heroes.";
  if (picked.length && picked.length !== 10) return "Record all ten participant heroes, or turn off Record Heroes.";
  if (new Set(picked).size !== picked.length) return "A played hero cannot be selected more than once.";
  if (match.bans !== undefined && !Array.isArray(match.bans)) return "Invalid ban list.";
  const banned = new Set<number>();
  for (const ban of match.bans ?? []) {
    if (!ban || !["radiant", "dire"].includes(ban.team) || !Number.isInteger(ban.heroId) || !isKnownHero(ban.heroId)) return "Select a known hero and team for every ban, or remove the empty ban.";
    if (banned.has(ban.heroId)) return "A hero can only be banned once per match.";
    if (picked.includes(ban.heroId)) return "A banned hero cannot also be played in the same match.";
    banned.add(ban.heroId);
  }
  return null;
}
export function hasCompleteHeroes(match: LobbyMatch): boolean {
  const ids = match.participants.map(p => p.heroId);
  return ids.length === 10 && ids.every(id => Number.isInteger(id) && id! > 0) && new Set(ids).size === 10;
}
export function heroStatistics(matches: LobbyMatch[]) {
  const picks = new Map<number, number>(), bans = new Map<number, number>();
  let heroMatches = 0, banMatches = 0;
  for (const match of matches) {
    if (hasCompleteHeroes(match)) {
      heroMatches++;
      for (const p of match.participants) picks.set(p.heroId!, (picks.get(p.heroId!) ?? 0) + 1);
    }
    if (match.bans?.length) {
      banMatches++;
      for (const id of new Set(match.bans.map(b => b.heroId))) bans.set(id, (bans.get(id) ?? 0) + 1);
    }
  }
  const ranked = (counts: Map<number, number>) => [...counts].map(([heroId, count]) => ({ heroId, count })).sort((a, b) => b.count - a.count || a.heroId - b.heroId);
  return { picks: ranked(picks), bans: ranked(bans), heroMatches, banMatches };
}
export function playerHeroStatistics(playerId: string, matches: LobbyMatch[]) {
  const rows = new Map<number, { heroId: number; games: number; wins: number; losses: number; winRate: number }>();
  let totalGames = 0, coveredGames = 0;
  for (const match of matches) {
    const participant = match.participants.find(p => p.playerId === playerId);
    if (!participant) continue;
    totalGames++;
    if (!hasCompleteHeroes(match)) continue;
    coveredGames++;
    const heroId = participant.heroId!;
    const row = rows.get(heroId) ?? { heroId, games: 0, wins: 0, losses: 0, winRate: 0 };
    row.games++; if (participant.team === match.winner) row.wins++; else row.losses++;
    row.winRate = row.wins / row.games * 100; rows.set(heroId, row);
  }
  return { rows: [...rows.values()].sort((a, b) => b.games - a.games || a.heroId - b.heroId), totalGames, coveredGames };
}
