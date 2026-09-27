import { test } from "vitest";
import assert from "node:assert/strict";
import { existingDotaMatch, fetchOpenDotaMatch, mapImportedPlayers, normalizeMatchId, OpenDotaError, parseOpenDotaMatch, validDotaAccountId } from "./opendota";
import { handleOpenDotaRequest, verifyImportAdmin } from "./opendota-server";
import { applyLeagueAction } from "./league";
import { decodeSnapshot, encodePlayer } from "./backend";
import { calculatePlayerStats, opponentRecords, leagueRecords } from "./stats";
import type { LobbyMatch, Player } from "./types";

const players: Player[] = Array.from({ length: 10 }, (_, i) => ({ id: "p" + i, name: "Player " + i, nickname: "P" + i, createdAt: "2026-01-01", dotaAccountId: String(100 + i) }));
function fixture() {
  return { match_id: 1234567890, radiant_win: true, radiant_score: 42, dire_score: 31, duration: 2322, start_time: 1789900019,
    players: players.map((p, i) => ({ account_id: Number(p.dotaAccountId), player_slot: i < 5 ? i : i + 123, hero_id: 99, kills: 20 })), chat: ["not forwarded"] };
}
const parse = () => parseOpenDotaMatch(fixture(), "1234567890");
test("OpenDota maps all ten slots, basic fields and winner without forwarding gameplay data or awards", () => {
  const result = parse();
  assert.equal(result.winner, "radiant"); assert.equal(result.radiantScore, 42); assert.equal(result.direScore, 31);
  assert.equal(result.durationMinutes, 38.7); assert.equal(result.playedAt, new Date(1789900019000).toISOString());
  assert.equal(result.dotaMatchId, "1234567890"); assert.deepEqual(mapImportedPlayers(result, players), players.map(p => p.id));
  assert.deepEqual(result.participants.map(p => p.team), [...Array(5).fill("radiant"), ...Array(5).fill("dire")]);
  assert.equal("chat" in result, false); assert.equal("hero_id" in result.participants[0], false);
  assert.equal("mvpPlayerId" in result, false); assert.equal("runnerUpMvpPlayerId" in result, false);
  assert.equal(parseOpenDotaMatch({ ...fixture(), radiant_win: false, players: fixture().players.reverse() }, "1234567890").winner, "dire");
});
test("unmapped and anonymous accounts never guess; ambiguous local mappings never match", () => {
  const raw = fixture(); raw.players[0].account_id = 999;
  for (const value of [null, 0, 4294967295, undefined]) {
    const result = parseOpenDotaMatch({ ...raw, players: raw.players.map((p, i) => i === 1 ? { ...p, account_id: value } : p) }, "1234567890");
    assert.deepEqual(mapImportedPlayers(result, players).slice(0, 2), ["", ""]);
    assert.equal(result.participants[1].accountId, null);
  }
  assert.equal(mapImportedPlayers(parse(), [...players, { ...players[0], id: "another" }])[0], "");
});
test("optional missing scores, duration and date remain absent", () => {
  const result = parseOpenDotaMatch({ ...fixture(), radiant_score: null, dire_score: undefined, duration: null, start_time: undefined }, "1234567890");
  assert.equal(result.radiantScore, undefined); assert.equal(result.direScore, undefined); assert.equal(result.durationMinutes, undefined); assert.equal(result.playedAt, undefined);
});
test("invalid IDs and malformed OpenDota data are rejected", () => {
  for (const id of ["", "0", "-1", "1.2", "abc", "9007199254740992", "1/2"]) assert.throws(() => normalizeMatchId(id));
  assert.equal(normalizeMatchId(" 001234 "), "1234");
  for (const raw of [null, {}, { ...fixture(), match_id: 1 }, { ...fixture(), radiant_win: null },
    { ...fixture(), players: fixture().players.slice(1) }, { ...fixture(), players: [...fixture().players, fixture().players[0]] },
    { ...fixture(), players: fixture().players.map((p, i) => i === 1 ? fixture().players[0] : p) },
    { ...fixture(), players: fixture().players.map(p => ({ ...p, player_slot: 20 })) },
    { ...fixture(), players: fixture().players.map(p => ({ ...p, account_id: 100 })) },
    { ...fixture(), radiant_score: -1 }, { ...fixture(), duration: "100" }, { ...fixture(), start_time: Number.MAX_SAFE_INTEGER }])
    assert.throws(() => parseOpenDotaMatch(raw, "1234567890"));
});
test("OpenDota request uses fixed endpoint, returns friendly 404/server/rate-limit/network/JSON/timeout errors", async () => {
  const result = await fetchOpenDotaMatch("1234567890", async (url, init) => {
    assert.equal(url, "https://api.opendota.com/api/matches/1234567890"); assert.equal(init?.cache, "no-store"); return Response.json(fixture());
  }); assert.equal(result.dotaMatchId, "1234567890");
  for (const [status, message] of [[404, /not found/], [503, /unavailable/], [429, /rate limiting/]] as const)
    await assert.rejects(fetchOpenDotaMatch("123", async () => new Response("", { status })), message);
  await assert.rejects(fetchOpenDotaMatch("123", async () => { throw new Error("network"); }), /Could not retrieve/);
  await assert.rejects(fetchOpenDotaMatch("123", async () => new Response("not json")), /malformed/);
  await assert.rejects(fetchOpenDotaMatch("123", (_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
  }), 5), /timed out/);
});
test("API route requires authorization before fetching and returns only normalized fields", async () => {
  let fetched = 0;
  const load = async () => { fetched++; return parse(); };
  const request = new Request("http://localhost/api/opendota/match/1234567890");
  assert.equal((await handleOpenDotaRequest(request, "1234567890", verifyImportAdmin, load)).status, 401);
  assert.equal((await handleOpenDotaRequest(request, "1234567890", async () => { throw new OpenDotaError("Only admin", 403); }, load)).status, 403);
  assert.equal(fetched, 0);
  const response = await handleOpenDotaRequest(request, "1234567890", async () => {}, load);
  assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "no-store"); assert.deepEqual(await response.json(), parse());
  assert.equal((await handleOpenDotaRequest(request, "bad", async () => {}, load)).status, 400); assert.equal(fetched, 1);
});
test("account validation, duplicate mappings and snapshot encode/decode", () => {
  for (const id of ["0", "-1", "4294967295", "76561198000000000", "1.2", "abc", "00100"]) assert.equal(validDotaAccountId(id), false);
  assert.equal(validDotaAccountId("4294967294"), true);
  assert.throws(() => applyLeagueAction({ players, matches: [] }, { type: "updatePlayer", player: { ...players[1], dotaAccountId: "100" } }), /already assigned/);
  const encoded = encodePlayer(players[0]); assert.equal(encoded.dota_account_id, "100");
  assert.equal(decodeSnapshot({ players: [{ ...encoded, created_at: players[0].createdAt }], matches: [] }).players[0].dotaAccountId, "100");
  assert.equal(encodePlayer({ ...players[0], dotaAccountId: undefined }).dota_account_id, null);
});
test("server verifies the user and stored admin role using the caller JWT, never token claims", async () => {
  const originalFetch = globalThis.fetch, previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL, previousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test-project.invalid";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-public-key";
  const request = new Request("http://localhost", { headers: { Authorization: "Bearer test-user-session" } });
  let role = "viewer", verified = true;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-user-session");
    if (url.includes("/auth/v1/user")) return verified ? Response.json({ id: "user-id", app_metadata: {}, user_metadata: { role: "admin" } }) : Response.json({ message: "invalid" }, { status: 401 });
    assert.ok(url.includes("/rest/v1/profiles") && url.includes("id=eq.user-id"));
    return Response.json({ role });
  };
  try {
    await assert.rejects(verifyImportAdmin(request), e => e instanceof OpenDotaError && e.status === 403);
    role = "admin"; await verifyImportAdmin(request);
    verified = false; await assert.rejects(verifyImportAdmin(request), e => e instanceof OpenDotaError && e.status === 401);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousKey;
  }
});
test("duplicate Dota match detection and imported vs manual statistics are identical", () => {
  const data = parse(), ids = mapImportedPlayers(data, players);
  const imported: LobbyMatch = { id: "m", playedAt: data.playedAt!, winner: data.winner, radiantScore: data.radiantScore, direScore: data.direScore, durationMinutes: data.durationMinutes, dotaMatchId: data.dotaMatchId,
    participants: data.participants.map((p, i) => ({ team: p.team, playerId: ids[i] })), mvpPlayerId: "p0", runnerUpMvpPlayerId: "p5" };
  const manual: LobbyMatch = { id: "m", playedAt: new Date(1789900019000).toISOString(), winner: "radiant", radiantScore: 42, direScore: 31, durationMinutes: 38.7, dotaMatchId: "1234567890", mvpPlayerId: "p0", runnerUpMvpPlayerId: "p5",
    participants: players.map((p, i) => ({ playerId: p.id, team: i < 5 ? "radiant" : "dire" })) };
  assert.deepEqual(imported, manual);
  const stats = calculatePlayerStats(players, [imported]);
  assert.deepEqual(stats, calculatePlayerStats(players, [manual]));
  assert.deepEqual(leagueRecords(stats), leagueRecords(calculatePlayerStats(players, [manual])));
  assert.deepEqual(opponentRecords("p0", players, [imported]), opponentRecords("p0", players, [manual]));
  assert.equal(existingDotaMatch([manual], "001234567890")?.id, "m"); assert.equal(existingDotaMatch([manual], "1234567890", "m"), undefined);
  assert.throws(() => applyLeagueAction({ players, matches: [manual] }, { type: "addMatch", match: { ...imported, id: "m2" } }), /already recorded/);
});
