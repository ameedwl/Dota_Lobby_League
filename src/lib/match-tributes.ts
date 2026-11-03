/** Presentation metadata only. Never resolve a tribute from match ordering. */
export type MatchTribute = {
  id: string;
  matchId: string;
  slug: string;
  title: string;
  titleLines: readonly [string, string];
  subtitle: string;
  globalStart: string;
  globalEnd: string;
  anthem: string;
  anthemCreator: { playerId: string; displayName: string; hero: string; team: "Radiant" | "Dire" };
  theme: "forty-minutes-dark";
  inscription: { radiant: number; dire: number; duration: string; mode: string; winner: string };
};

export const fortyMinutesTribute: MatchTribute = {
  id: "40-minutes-dark-2026-v1",
  // Verified latest record on 2 Nov 2026: Dota 9072289730, Radiant 53–36,
  // Night Stalker / Shadow Fiend vs Medusa / Spirit Breaker. Never a latest-match lookup.
  matchId: "34fa3a02-c5c4-40d0-bf0d-43ce77513e7b",
  slug: "40-minutes-in-the-dark",
  title: "40 MINUTES IN THE DARK",
  titleLines: ["40 MINUTES", "IN THE DARK"],
  subtitle: "A Lobby Legends Match Tribute",
  // Fixed 72-hour window in Asia/Beirut (UTC+02:00).
  globalStart: "2026-11-03T21:49:00+02:00",
  globalEnd: "2026-11-06T21:49:00+02:00",
  anthem: "/events/40-minutes-in-the-dark/match-anthem.mp3",
  anthemCreator: {
    playerId: "f3e6f11d-2ae4-4669-881e-4d4ac535f45b",
    displayName: "TYSIOTE",
    hero: "Spirit Breaker",
    team: "Dire",
  },
  theme: "forty-minutes-dark",
  // Duration/mode are the owner's tribute inscription. The existing record stores
  // duration_minutes=51.5 and no mode field; its original metadata stays unchanged.
  inscription: { radiant: 53, dire: 36, duration: "51:50", mode: "CAPTAINS MODE", winner: "RADIANT VICTORY" },
};

export const matchTributes: readonly MatchTribute[] = [fortyMinutesTribute];
export const tributeForMatch = (matchId: string) => matchTributes.find(tribute => tribute.matchId === matchId);
export const isSpecialTributeMatch = (matchId: string) => !!tributeForMatch(matchId);
export const isTributeAnthemCreator = (playerId: string) =>
  matchTributes.some(tribute => tribute.anthemCreator.playerId === playerId);
export function isGlobalTributeActive(now: number, tribute: MatchTribute = fortyMinutesTribute) {
  return now >= Date.parse(tribute.globalStart) && now < Date.parse(tribute.globalEnd);
}
export function tributeForPath(pathname: string, now: number) {
  return matchTributes.find(tribute => pathname === `/matches/${tribute.matchId}`)
    ?? matchTributes.find(tribute => isGlobalTributeActive(now, tribute));
}
export function tributeCountdown(now: number, tribute: MatchTribute = fortyMinutesTribute) {
  const seconds = Math.max(0, Math.ceil((Date.parse(tribute.globalEnd) - now) / 1000));
  return `${Math.floor(seconds / 3600)}H ${String(Math.floor(seconds % 3600 / 60)).padStart(2, "0")}M ${String(seconds % 60).padStart(2, "0")}S`;
}
export const tributeSeenKey = (tribute: MatchTribute, scope: "global" | "archive") =>
  `lobby-legends-${tribute.id}-${scope}-seen`;
