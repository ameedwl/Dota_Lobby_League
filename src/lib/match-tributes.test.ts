import { test } from "vitest";
import assert from "node:assert/strict";
import { fortyMinutesTribute, isGlobalTributeActive, isSpecialTributeMatch, matchTributes, tributeCountdown, tributeForPath, tributeSeenKey } from "./match-tributes";

test("match tribute uses timezone-safe timestamps and an inclusive/exclusive 72-hour global window", () => {
  const start = Date.parse(fortyMinutesTribute.globalStart), end = Date.parse(fortyMinutesTribute.globalEnd);
  assert.match(fortyMinutesTribute.globalStart, /(?:Z|[+-]\d{2}:\d{2})$/);
  assert.match(fortyMinutesTribute.globalEnd, /(?:Z|[+-]\d{2}:\d{2})$/);
  assert.equal(end - start, 72 * 60 * 60 * 1000);
  assert.equal(isGlobalTributeActive(start - 1), false);
  assert.equal(isGlobalTributeActive(start), true);
  assert.equal(isGlobalTributeActive(end - 1), true);
  assert.equal(isGlobalTributeActive(end), false);
  assert.equal(isGlobalTributeActive(end + 365 * 86400000), false);
});

test("only the configured concrete match keeps its tribute before and after the global event", () => {
  const start = Date.parse(fortyMinutesTribute.globalStart), end = Date.parse(fortyMinutesTribute.globalEnd);
  const matchId = fortyMinutesTribute.matchId;
  assert.equal(matchId, "34fa3a02-c5c4-40d0-bf0d-43ce77513e7b", "the tribute remains bound to the verified historical record");
  assert.match(matchId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  assert.equal(matchTributes.filter(tribute => tribute.matchId === matchId).length, 1);
  assert.equal(isSpecialTributeMatch(matchId), true);
  assert.equal(isSpecialTributeMatch("newer-match"), false);
  assert.equal(isSpecialTributeMatch("latestMatch"), false);
  for (const now of [start - 1, end, end + 365 * 86400000]) {
    assert.equal(tributeForPath("/matches/" + matchId, now), fortyMinutesTribute);
    for (const route of ["/", "/leaderboard", "/players", "/stats", "/rewards", "/add-match", "/admin", "/matches", "/matches/newer-match", "/matches/" + matchId + "/edit"]) {
      assert.equal(tributeForPath(route, now), undefined, route);
    }
  }
  for (const route of ["/", "/leaderboard", "/players", "/stats", "/rewards", "/add-match", "/admin", "/matches/newer-match"]) {
    assert.equal(tributeForPath(route, start), fortyMinutesTribute, route);
  }
});

test("newer matches cannot transfer permanent tribute identity", () => {
  const original = { id: fortyMinutesTribute.matchId, playedAt: "2026-11-01T00:00:00Z" };
  const newer = { id: "11111111-1111-4111-8111-111111111111", playedAt: "2027-01-01T00:00:00Z" };
  for (const matches of [[original], [newer, original], [original, newer]]) {
    assert.deepEqual(matches.filter(match => isSpecialTributeMatch(match.id)).map(match => match.id), [original.id]);
  }
});

test("global and archive seen states have independent versioned keys", () => {
  const globalKey = tributeSeenKey(fortyMinutesTribute, "global"), archiveKey = tributeSeenKey(fortyMinutesTribute, "archive");
  assert.notEqual(globalKey, archiveKey);
  assert.match(globalKey, /lobby-legends/);
  assert.match(globalKey, /2026/);
  assert.match(archiveKey, /archive/);
  assert.equal(tributeSeenKey(fortyMinutesTribute, "global"), globalKey);
});

test("countdown reaches zero and cannot become negative after expiration", () => {
  const start = Date.parse(fortyMinutesTribute.globalStart), end = Date.parse(fortyMinutesTribute.globalEnd);
  const initial = tributeCountdown(start), zero = tributeCountdown(end);
  assert.notEqual(initial, zero);
  assert.equal(tributeCountdown(end + 86400000), zero);
  assert.doesNotMatch(zero, /-/);
});
