import {decodeSnapshot,encodeMatch,encodePlayer} from "./backend";
import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { seedMatches, seedPlayers } from "./fixtures";
import { calculatePlayerStats, validateMatch, opponentRecords, sortMatches, leagueRecords } from "./stats";
import { applyLeagueAction, parseLeague, serializeLeague } from "./league";
import { LobbyMatch, Team } from "./types";

const players = [...seedPlayers, {id:"new",name:"New Player",nickname:"NEW",createdAt:"2026-09-01T00:00:00Z"}];
function game(id:string, day:number, winner:Team="radiant"):LobbyMatch {
  return {id,playedAt:new Date(Date.UTC(2026,0,day)).toISOString(),winner,participants:seedPlayers.map((p,i)=>({playerId:p.id,team:i<5?"radiant":"dire"}))};
}
const stat = (matches:LobbyMatch[],id="p1") => calculatePlayerStats(players,matches).find(s=>s.player.id===id)!;

describe("derived statistics",()=>{
  it("counts games, wins, losses and MVPs from participation only",()=>{
    const matches=[{...game("a",1),mvpPlayerId:"p1"},game("b",2,"dire"),game("c",3)];
    const s=stat(matches);
    assert.equal(s.games,3);assert.equal(s.wins,2);assert.equal(s.losses,1);assert.ok(Math.abs(s.winRate-200/3)<1e-10);assert.equal(s.mvps,1);
    assert.equal(stat(matches,"new").games,0);
    const all=calculatePlayerStats(players,matches);
    assert.equal(all.reduce((n,s)=>n+s.wins,0),15);assert.equal(all.reduce((n,s)=>n+s.losses,0),15);
  });
  it("handles zero matches and players added after history exists",()=>{
    const s=stat([game("a",1)],"new");
    assert.deepEqual([s.games,s.wins,s.losses,s.winRate,s.currentStreak,s.currentWinStreak,s.currentLossStreak,s.bestWinStreak,s.mvps],[0,0,0,0,0,0,0,0,0]);
    assert.equal(s.streakType,null);assert.deepEqual(s.recentForm,[]);
    assert.deepEqual(calculatePlayerStats([],[]),[]);
  });
  it("calculates both current streaks, longest wins and newest-first recent five",()=>{
    const matches=(["radiant","radiant","dire","radiant","radiant","radiant","dire","dire"] as Team[]).map((w,i)=>game(String(i),i+1,w));
    const s=stat(matches);
    assert.equal(s.currentWinStreak,0);assert.equal(s.currentLossStreak,2);assert.equal(s.currentStreak,2);assert.equal(s.bestWinStreak,3);
    assert.deepEqual(s.recentForm,["L","L","W","W","W"]);
    assert.equal(stat(matches.slice(0,6)).currentWinStreak,3);
    assert.equal(stat(matches.slice(0,2)).bestWinStreak,2);
  });
  it("ignores other players' matches when calculating streaks",()=>{
    const absent=game("b",2,"dire");absent.participants=absent.participants.map(p=>p.playerId==="p1"?{...p,playerId:"new"}:p);
    const s=stat([game("a",1),absent,game("c",3)]);
    assert.equal(s.games,2);assert.equal(s.currentWinStreak,2);
  });
  it("ranks wins then win rate then immutable player ID",()=>{
    const a=game("a",1),b=game("b",2,"dire");
    b.participants=b.participants.map(p=>p.playerId==="p2"?{...p,playerId:"new"}:p);
    const results=calculatePlayerStats(players,[a,b]);
    assert.ok(results.find(s=>s.player.id==="p2")!.rank < results.find(s=>s.player.id==="p1")!.rank);
    const tie=calculatePlayerStats(seedPlayers,[a]);
    assert.deepEqual(tie.slice(0,5).map(s=>s.player.id),["p1","p2","p3","p4","p5"]);
    assert.deepEqual(tie.map(s=>s.rank),[1,2,3,4,5,6,7,8,9,10]);
    const three=[game("a",1),game("b",2),game("c",3,"dire")];
    assert.equal(stat(three).rank,1);
  });
  it("is deterministic with shuffled inputs and equal timestamp timezone representations",()=>{
    const a=game("a",1),b={...game("b",1,"dire"),playedAt:"2025-12-31T19:00:00-05:00"};
    const forward=calculatePlayerStats(players,[a,b]);
    assert.deepEqual(forward,calculatePlayerStats([...players].reverse(),[b,a]));
    assert.deepEqual(stat([b,a]).recentForm,["W","L"]);
    assert.deepEqual(sortMatches([b,a]).map(m=>m.id),["a","b"]);
  });
  it("does not mutate its inputs",()=>{
    const data={players:structuredClone(players),matches:[game("a",1),game("b",2)]};
    const before=JSON.stringify(data);
    calculatePlayerStats(data.players,data.matches);opponentRecords("p1",data.players,data.matches);
    assert.equal(JSON.stringify(data),before);
  });
});
describe("head-to-head",()=>{
  it("excludes teammates and includes unplayed opponents",()=>{
    const matches=[game("a",1),game("b",2,"dire")];
    const records=opponentRecords("p1",players,matches);
    assert.equal(records.length,10);
    assert.equal(records.find(r=>r.player.id==="p2")!.games,0);
    const r=records.find(r=>r.player.id==="p6")!;
    assert.deepEqual([r.games,r.wins,r.losses,r.rate],[2,1,1,50]);
    assert.equal(records.find(r=>r.player.id==="new")!.games,0);
  });
  it("handles swapping between teammates and opponents",()=>{
    const a=game("a",1),b=game("b",2);
    b.participants=b.participants.map(p=>p.playerId==="p2"?{...p,team:"dire"}:p.playerId==="p6"?{...p,team:"radiant"}:p);
    const r=opponentRecords("p1",players,[a,b]).find(r=>r.player.id==="p2")!;
    assert.deepEqual([r.games,r.wins,r.losses],[1,1,0]);
    const reverse=opponentRecords("p2",players,[a,b]).find(r=>r.player.id==="p1")!;
    assert.equal(reverse.losses,r.wins);
  });
});
describe("validation and historical integrity",()=>{
  it("accepts fixtures and missing optional values including zero scores",()=>{
    for(const m of seedMatches) assert.equal(validateMatch(m,players),null);
    assert.equal(validateMatch(game("a",1),players),null);
    assert.equal(validateMatch({...game("a",1),radiantScore:0,direScore:0},players),null);
  });
  it("rejects incomplete, blank, duplicate, unknown and invalid-team participants",()=>{
    const a=game("a",1);
    assert.match(validateMatch({...a,participants:a.participants.slice(1)},players)!,/exactly five/);
    for(const id of ["","p2","ghost"]) {
      assert.ok(validateMatch({...a,participants:a.participants.map((p,i)=>i===0?{...p,playerId:id}:p)},players));
    }
    assert.ok(validateMatch({...a,participants:a.participants.map((p,i)=>i===9?{...p,playerId:"p1"}:p)},players));
    assert.ok(validateMatch({...a,participants:a.participants.map(p=>({...p,team:"other" as Team}))},players));
    assert.ok(validateMatch({...a,participants:[...a.participants,a.participants[0]]},players));
  });
  it("validates winner, MVP, scores, duration, date and Dota ID",()=>{
    const a=game("a",1);
    for(const override of [{winner:""}, {mvpPlayerId:"new"}, {radiantScore:-1}, {direScore:1.5}, {radiantScore:NaN}, {durationMinutes:0}, {durationMinutes:Infinity}, {playedAt:"bad"}, {dotaMatchId:"abc"}]) {
      assert.ok(validateMatch({...a,...override} as LobbyMatch,players),JSON.stringify(override));
    }
  });
  it("recalculates outcomes, streaks, MVPs and opponents after editing an old match",()=>{
    const before={players,matches:[game("a",1),game("b",2),game("c",3)]};
    const edited={...before.matches[1],winner:"dire" as Team,mvpPlayerId:"p6"};
    const after=applyLeagueAction(before,{type:"updateMatch",match:edited});
    assert.equal(stat(before.matches).bestWinStreak,3);
    assert.deepEqual([stat(after.matches).wins,stat(after.matches).losses,stat(after.matches).bestWinStreak,stat(after.matches).currentWinStreak],[2,1,1,1]);
    assert.equal(stat(after.matches,"p6").mvps,1);
    assert.equal(opponentRecords("p1",players,after.matches).find(r=>r.player.id==="p6")!.losses,1);
    const moved=applyLeagueAction(after,{type:"updateMatch",match:{...edited,playedAt:game("x",4).playedAt}});
    assert.equal(stat(moved.matches).currentLossStreak,1);
  });
  it("recalculates streaks and records after deleting an old match",()=>{
    const data={players,matches:[game("a",1),game("b",2,"dire"),game("c",3)]};
    const after=applyLeagueAction(data,{type:"deleteMatch",id:"b"});
    assert.deepEqual([stat(after.matches).games,stat(after.matches).wins,stat(after.matches).bestWinStreak],[2,2,2]);
    assert.equal(leagueRecords(calculatePlayerStats(players,after.matches))[0].value,2);
    assert.equal(data.matches.length,3);
  });
  it("protects referenced players and permits deleting unused players",()=>{
    const data={players,matches:[game("a",1)]};
    assert.throws(()=>applyLeagueAction(data,{type:"deletePlayer",id:"p1"}),/history/);
    assert.equal(applyLeagueAction(data,{type:"deletePlayer",id:"new"}).players.length,10);
    const renamed=applyLeagueAction(data,{type:"updatePlayer",player:{...players[0],nickname:"RENAMED"}});
    assert.equal(stat(renamed.matches).wins,1);
    assert.deepEqual(renamed.matches,data.matches);
  });
  it("rejects duplicate IDs, duplicate external matches and unknown updates",()=>{
    const a={...game("a",1),dotaMatchId:"123"},data={players,matches:[a]};
    assert.throws(()=>applyLeagueAction(data,{type:"addMatch",match:a}),/already/);
    assert.throws(()=>applyLeagueAction(data,{type:"addMatch",match:{...a,id:"b"}}),/already/);
    assert.throws(()=>applyLeagueAction(data,{type:"updateMatch",match:game("missing",1)}),/no longer/);
    assert.throws(()=>applyLeagueAction(data,{type:"deleteMatch",id:"missing"}),/no longer/);
  });
  it("round-trips persistence and rejects malformed or orphaned saves",()=>{
    const data={players,matches:[game("a",1)]};
    assert.deepEqual(parseLeague(serializeLeague(data)),data);
    assert.throws(()=>parseLeague("{"));
    assert.throws(()=>parseLeague(JSON.stringify({...data,version:2})));
    assert.throws(()=>parseLeague(JSON.stringify({...data,players:[],version:1})),/existing player/);
    assert.throws(()=>parseLeague(JSON.stringify({version:1,players:null,matches:[]})));
  });
});
describe("league records",()=>{
  it("lists all tied holders, applies qualification and handles empty history",()=>{
    const records=leagueRecords(calculatePlayerStats(players,[game("a",1)]));
    assert.equal(records[0].holders.length,5);
    assert.equal(records[1].value,null);
    assert.equal(records[3].value,0);
    assert.equal(records[4].holders.length,10);
    assert.ok(leagueRecords(calculatePlayerStats(players,[])).every(r=>r.value===null&&r.holders.length===0));
    const five=Array.from({length:5},(_,i)=>game(String(i),i+1));
    assert.equal(leagueRecords(calculatePlayerStats(players,five))[1].value,100);
  });
});



describe("additional mutation edges",()=>{
  it("adds a new zero-game player without changing existing results",()=>{
    const data={players:seedPlayers,matches:[game("a",1)]};
    const before=calculatePlayerStats(data.players,data.matches);
    const next=applyLeagueAction(data,{type:"addPlayer",player:players[10]});
    assert.equal(calculatePlayerStats(next.players,next.matches).find(s=>s.player.id==="new")!.games,0);
    assert.deepEqual(calculatePlayerStats(next.players,next.matches).filter(s=>s.player.id!=="new").map(s=>[s.player.id,s.games,s.wins]),before.map(s=>[s.player.id,s.games,s.wins]));
  });
  it("updates participation and removes a previously selected MVP",()=>{
    const original={...game("a",1),mvpPlayerId:"p1"};
    const updated={...original,mvpPlayerId:undefined,participants:original.participants.map(p=>p.playerId==="p1"?{...p,playerId:"new"}:p)};
    const next=applyLeagueAction({players,matches:[original]},{type:"updateMatch",match:updated});
    assert.equal(stat(next.matches).games,0);assert.equal(stat(next.matches).mvps,0);
    assert.equal(stat(next.matches,"new").wins,1);
    assert.equal(stat(next.matches,"new").mvps,0);
  });
  it("rejects invalid updates without altering the original history",()=>{
    const original={players,matches:[game("a",1)]},before=JSON.stringify(original);
    assert.throws(()=>applyLeagueAction(original,{type:"updateMatch",match:{...game("a",1),mvpPlayerId:"new"}}),/participating/);
    assert.equal(JSON.stringify(original),before);
  });
  it("returns zero stats and empty record holders after deleting the last match",()=>{
    const next=applyLeagueAction({players,matches:[game("a",1)]},{type:"deleteMatch",id:"a"});
    assert.equal(stat(next.matches).games,0);
    assert.ok(leagueRecords(calculatePlayerStats(players,next.matches)).every(r=>r.value===null));
  });
});



describe("database mapping",()=>{
  it("round-trips match history without storing derived counters",()=>{
    const original=game("a",1);
    const encoded=encodeMatch(original);
    assert.equal(encoded.radiant_score,null);assert.equal(encoded.mvp_player_id,null);
    const decoded=decodeSnapshot({players:seedPlayers.map(p=>({...encodePlayer(p),created_at:p.createdAt})),matches:[{...encoded,updated_at:"2026-01-01T00:00:00Z"}],settings:{name:"League",season:"I"}});
    assert.equal(decoded.matches[0].winner,"radiant");
    assert.equal(decoded.matches[0].updatedAt,"2026-01-01T00:00:00Z");
    assert.equal(decoded.matches[0].radiantScore,undefined);
    assert.equal(calculatePlayerStats(decoded.players,decoded.matches)[0].wins,1);
    assert.ok(!("wins" in encoded));
  });
  it("rejects incomplete backend snapshots",()=>{
    assert.throws(()=>decodeSnapshot({}));
    assert.throws(()=>decodeSnapshot({players:[],matches:[{...encodeMatch(game("a",1)),updated_at:"2026-01-01T00:00:00Z"}]}));
  });
});

