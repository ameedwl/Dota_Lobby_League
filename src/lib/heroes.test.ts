import { test } from "vitest";
import assert from "node:assert/strict";
import { heroes, heroName, heroStatistics, playerHeroStatistics, validateHeroData } from "./heroes";
import { parseOpenDotaMatch } from "./opendota";
import { encodeMatch } from "./backend";
import { calculatePlayerStats, validateMatch } from "./stats";
import type { LobbyMatch } from "./types";
const match: LobbyMatch = { id: "m", playedAt: "2026-01-01T12:00:00Z", winner: "radiant", participants: Array.from({ length: 10 }, (_, i) => ({ playerId: "p" + i, team: i < 5 ? "radiant" : "dire", heroId: i + 1 })), bans: [{ team: "radiant", heroId: 11 }, { team: "dire", heroId: 12 }] };
test("catalog has unique stable IDs, current heroes and unknown fallback", () => {
  assert.equal(new Set(heroes.map(h => h.id)).size, heroes.length);
  assert.equal(heroName(97), "Magnus"); assert.equal(heroName(145), "Kez"); assert.equal(heroName(155), "Largo");
  assert.equal(heroName(9999), "Hero #9999");
});
test("manual heroes are all-or-none, known, distinct and never banned", () => {
  assert.equal(validateMatch(match), null);
  const old = { ...match, participants: match.participants.map(p => ({ ...p, heroId: undefined })), bans: [] };
  assert.equal(validateMatch(old), null);
  assert.match(validateHeroData({ ...old, participants: [match.participants[0], ...old.participants.slice(1)] })!, /all ten/);
  assert.match(validateHeroData({ ...match, participants: match.participants.map(p => ({ ...p, heroId: 1 })) })!, /more than once/);
  assert.match(validateHeroData({ ...match, bans: [{ team: "radiant", heroId: 1 }] })!, /also be played/);
  assert.match(validateHeroData({ ...match, bans: [{ team: "radiant", heroId: 11 }, { team: "dire", heroId: 11 }] })!, /only be banned once/);
  assert.match(validateHeroData({ ...match, bans: [{ team: "dire", heroId: 9999 }] })!, /known hero/);
});
test("Most Picked, Most Banned and player W/L derive only from complete history and recalculate after edits/deletes", () => {
  const second = { ...match, id: "m2", winner: "dire" as const, bans: [{ team: "dire" as const, heroId: 11 }] };
  const old = { ...match, id: "old", participants: match.participants.map(p => ({ ...p, heroId: null })), bans: [] };
  const partial = { ...old, id: "partial", participants: [match.participants[0], ...old.participants.slice(1)] };
  const data = [match, second, old, partial];
  const stats = heroStatistics(data);
  assert.equal(stats.heroMatches, 2); assert.equal(stats.banMatches, 2);
  assert.deepEqual(stats.picks[0], { heroId: 1, count: 2 }); assert.equal(stats.picks.reduce((n, h) => n + h.count, 0), 20);
  assert.deepEqual(stats.bans, [{ heroId: 11, count: 2 }, { heroId: 12, count: 1 }]);
  const player = playerHeroStatistics("p0", data);
  assert.equal(player.totalGames, 4); assert.equal(player.coveredGames, 2);
  assert.deepEqual(player.rows, [{ heroId: 1, games: 2, wins: 1, losses: 1, winRate: 50 }]);
  assert.deepEqual(heroStatistics([...data].reverse()), stats);
  assert.equal(playerHeroStatistics("p0", [match]).rows[0].winRate, 100);
  const edited = { ...match, participants: match.participants.map((p, i) => ({ ...p, heroId: i === 0 ? 13 : p.heroId })) };
  assert.equal(playerHeroStatistics("p0", [edited]).rows[0].heroId, 13);
  assert.deepEqual(playerHeroStatistics("missing", []), { rows: [], totalGames: 0, coveredGames: 0 });
});
test("hero tracking never changes existing league statistics or rankings", () => {
  const players = match.participants.map(p => ({ id: p.playerId, name: p.playerId, nickname: p.playerId, createdAt: match.playedAt }));
  assert.deepEqual(calculatePlayerStats(players, [match]), calculatePlayerStats(players, [{ ...match, bans: [], participants: match.participants.map(p => ({ ...p, heroId: undefined })) }]));
});
test("OpenDota heroes follow slots, picks are not double counted, missing draft is optional", () => {
  const raw = { match_id: 123, radiant_win: true, players: match.participants.map((p, i) => ({ player_slot: i < 5 ? i : i + 123, account_id: i + 100, hero_id: p.heroId })) };
  const result = parseOpenDotaMatch(raw, "123"); assert.deepEqual(result.participants.map(p => p.heroId), [1,2,3,4,5,6,7,8,9,10]);
  assert.equal(result.bans, undefined);
  const draft = parseOpenDotaMatch({ ...raw, picks_bans: [{ is_pick: true, hero_id: 1, team: 0, order: 0 }, { is_pick: false, hero_id: 11, team: 1, order: 1 }] }, "123");
  assert.deepEqual(draft.bans, [{ heroId: 11, team: "dire" }]);
  assert.throws(() => parseOpenDotaMatch({ ...raw, picks_bans: [{ is_pick: false, hero_id: 11, team: 2 }] }, "123"));
  assert.equal(parseOpenDotaMatch({ ...raw, players: raw.players.map(p => ({ ...p, hero_id: 0 })) }, "123").participants[0].heroId, undefined);
});
test("RPC encoding distinguishes omitted hero/ban fields from explicit removal", () => {
  assert.equal(encodeMatch(match).participants[0].hero_id, 1);
  assert.deepEqual(encodeMatch(match).bans, [{ team: "radiant", hero_id: 11 }, { team: "dire", hero_id: 12 }]);
  const old = { ...match, bans: undefined, participants: match.participants.map(p => ({ ...p, heroId: undefined })) };
  assert.equal("hero_id" in encodeMatch(old).participants[0], false); assert.equal("bans" in encodeMatch(old), false);
  assert.equal(encodeMatch({ ...old, participants: old.participants.map(p => ({ ...p, heroId: null })) }).participants[0].hero_id, null);
});
