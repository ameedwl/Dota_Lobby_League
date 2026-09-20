import {PGlite} from "@electric-sql/pglite";
import {readFile} from "node:fs/promises";
import assert from "node:assert/strict";
const db=new PGlite();
let passed=0;
async function test(name,fn){await fn();passed++;console.log("PASS "+name);}
const admin="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",viewer="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
async function role(who,fn){
 return db.transaction(async tx=>{
  await tx.exec("set local role "+(who==="anon"?"anon":"authenticated"));
  await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[who==="anon"?"":who]);
  return fn(tx);
 });
}
const code=(value)=>error=>error.code===value;
try {
await db.exec(`
 create role anon nologin; create role authenticated nologin;
 create schema auth;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}');
 create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to anon,authenticated;
 grant execute on function auth.uid() to anon,authenticated;
`);
await db.exec(await readFile(new URL("../supabase/migrations/202609160001_shared_league.sql",import.meta.url),"utf8"));
await db.query("insert into auth.users(id,raw_user_meta_data) values($1,'{\"role\":\"admin\"}'),($2,'{\"role\":\"admin\"}')",[admin,viewer]);
await test("Auth metadata cannot grant admin",async()=>{
 const r=await db.query("select role from public.profiles");assert.ok(r.rows.every(x=>x.role==="viewer"));
});
await db.query("update public.profiles set role='admin' where id=$1",[admin]);
await test("database permits at most one admin",async()=>{await assert.rejects(db.query("update public.profiles set role='admin' where id=$1",[viewer]),code("23505"));});
await db.exec(await readFile(new URL("../supabase/seed.sql",import.meta.url),"utf8"));
// All setup and migrations below run only inside this ephemeral PGlite instance.
const before=(await db.query("select public.league_snapshot() as value")).rows[0].value;
const historical=before.matches[0];
const historicalLoser=historical.participants.find(p=>p.team!==historical.winner_team).player_id;
await db.query("update public.matches set mvp_player_id=$1 where id=$2",[historicalLoser,historical.id]);
const populated=(await db.query("select public.league_snapshot() as value")).rows[0].value;
await db.exec(await readFile(new URL("../supabase/migrations/202609200001_runner_up_mvp.sql",import.meta.url),"utf8"));
const initial=(await db.query("select public.league_snapshot() as value")).rows[0].value;
await test("forward migration preserves populated history, IDs, timestamps and legacy awards",async()=>{
 assert.deepEqual({...initial,matches:initial.matches.map(m=>{const copy={...m};assert.equal(copy.runner_up_mvp_player_id,null);delete copy.runner_up_mvp_player_id;return copy;})},populated);
});
await test("historical losing-team MVP remains readable but must be corrected on edit",async()=>{
 await assert.rejects(role(admin,tx=>tx.query("update public.matches set radiant_score=radiant_score where id=$1",[historical.id])),code("23514"));
});
const p=initial.players[0].id,m=initial.matches[0].id;
for(const who of ["anon",viewer]){
 await test(who+" reads complete public league snapshot",async()=>{
  const r=await role(who,tx=>tx.query("select public.league_snapshot() as value"));
  assert.equal(r.rows[0].value.players.length,10);assert.equal(r.rows[0].value.matches.length,10);
 });
 for(const [table,payload] of [
  ["players","(name,nickname) values('Intruder','BAD')"],
  ["matches","(winner_team) values('radiant')"],
  ["match_players","(match_id,player_id,team) values('"+m+"','"+p+"','radiant')"],
  ["league_settings","(id,name,season) values(true,'BAD','BAD')"]
 ]){
  await test(who+" cannot insert "+table,async()=>{await assert.rejects(role(who,tx=>tx.exec("insert into public."+table+payload)),code("42501"));});
 }
 for(const table of ["players","matches","match_players","league_settings"]){
  const assignment=table==="players"?"name='BAD'":table==="matches"?"winner_team='dire'":table==="match_players"?"team='dire'":"name='BAD'";
  for(const statement of ["update public."+table+" set "+assignment+" returning *","delete from public."+table+" returning *"]){
   await test(who+" blocked: "+statement.split(" returning")[0],async()=>{
    if(who==="anon")await assert.rejects(role(who,tx=>tx.query(statement)),code("42501"));
    else assert.equal((await role(who,tx=>tx.query(statement))).rows.length,0);
   });
  }
 }
 await test(who+" cannot call match-write RPC",async()=>{
  await assert.rejects(role(who,tx=>tx.query("select public.save_match('{}',true,null)")),code("42501"));
 });
}
await test("viewers cannot read other profiles or promote themselves",async()=>{
 const result=await role(viewer,tx=>tx.query("select * from public.profiles"));
 assert.equal(result.rows.length,1);assert.equal(result.rows[0].id,viewer);
 await assert.rejects(role(viewer,tx=>tx.exec("update public.profiles set role='admin'")),code("42501"));
 await assert.rejects(role(viewer,tx=>tx.query("insert into public.profiles(id,role) values(gen_random_uuid(),'admin')")),code("42501"));
});
await test("app admin cannot modify roles",async()=>{await assert.rejects(role(admin,tx=>tx.exec("update public.profiles set role='viewer'")),code("42501"));});
let extra;
await test("admin can create, edit and delete unused players",async()=>{
 extra=(await role(admin,tx=>tx.query("insert into public.players(name,nickname) values('New','NEW') returning id"))).rows[0].id;
 assert.equal((await role(admin,tx=>tx.query("update public.players set nickname='EDITED' where id=$1 returning *",[extra]))).rows[0].nickname,"EDITED");
 assert.equal((await role(admin,tx=>tx.query("delete from public.players where id=$1 returning id",[extra]))).rows.length,1);
});
await test("admin cannot delete a referenced player",async()=>{await assert.rejects(role(admin,tx=>tx.query("delete from public.players where id=$1",[p])),error=>["23503","23001"].includes(error.code));});
const matchId="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const payload={id:matchId,played_at:"2026-01-01T12:00:00Z",winner_team:"radiant",participants:initial.players.map((p,i)=>({player_id:p.id,team:i<5?"radiant":"dire"}))};
await test("admin atomically creates a valid 5v5 match with optional fields absent",async()=>{
 await role(admin,tx=>tx.query("select public.save_match($1,true,null)",[payload]));
 assert.equal((await db.query("select count(*)::int as n from public.match_players where match_id=$1",[matchId])).rows[0].n,10);
});
let version=(await db.query("select updated_at::text as value from public.matches where id=$1",[matchId])).rows[0].value;
await test("admin atomically edits winner, date, MVP, score and teams",async()=>{
 const changed={...payload,played_at:"2026-02-01T12:00:00Z",winner_team:"dire",mvp_player_id:initial.players[0].id,radiant_score:0,dire_score:42,
 participants:payload.participants.map(p=>({...p,team:p.team==="radiant"?"dire":"radiant"}))};
 await role(admin,tx=>tx.query("select public.save_match($1,false,$2)",[changed,version]));
 const row=(await db.query("select * from public.matches where id=$1",[matchId])).rows[0];
 assert.equal(row.winner_team,"dire");assert.equal(row.radiant_score,0);assert.equal(row.mvp_player_id,initial.players[0].id);
});
await test("stale edits rejected",async()=>{await assert.rejects(role(admin,tx=>tx.query("select public.save_match($1,false,$2)",[payload,version])),code("40001"));});
version=(await db.query("select updated_at::text as value from public.matches where id=$1",[matchId])).rows[0].value;
await test("invalid team update rolls back without losing existing match",async()=>{
 await assert.rejects(role(admin,tx=>tx.query("select public.save_match($1,false,$2)",[{...payload,participants:payload.participants.map(p=>({...p,team:"radiant"}))},version])),code("23514"));
 assert.equal((await db.query("select winner_team from public.matches where id=$1",[matchId])).rows[0].winner_team,"dire");
 assert.equal((await db.query("select count(*)::int as n from public.match_players where match_id=$1",[matchId])).rows[0].n,10);
});
await test("direct admin API cannot leave incomplete squads",async()=>{
 await assert.rejects(role(admin,tx=>tx.query("insert into public.matches(winner_team) values('radiant')")),code("23514"));
 await assert.rejects(role(admin,tx=>tx.query("delete from public.match_players where match_id=$1 and player_id=$2",[matchId,payload.participants[0].player_id])),code("23514"));
});
await test("MVP outside participants rejected at commit",async()=>{
 const outsider=(await role(admin,tx=>tx.query("insert into public.players(name,nickname) values('Other','OTHER') returning id"))).rows[0].id;
 await assert.rejects(role(admin,tx=>tx.query("update public.matches set mvp_player_id=$1 where id=$2",[outsider,matchId])),code("23514"));
});
await test("both awards save, update, load publicly, and clear atomically",async()=>{
 const base={...payload,mvp_player_id:payload.participants[0].player_id,runner_up_mvp_player_id:payload.participants[5].player_id};
 for(const awards of [
  {mvp_player_id:base.mvp_player_id,runner_up_mvp_player_id:base.runner_up_mvp_player_id},
  {mvp_player_id:null,runner_up_mvp_player_id:base.runner_up_mvp_player_id},
  {mvp_player_id:base.mvp_player_id,runner_up_mvp_player_id:null},
  {mvp_player_id:null,runner_up_mvp_player_id:null},
 ]){
  const v=(await db.query("select updated_at::text as v from public.matches where id=$1",[matchId])).rows[0].v;
  await role(admin,tx=>tx.query("select public.save_match($1,false,$2)",[{...base,...awards},v]));
  const data=(await role("anon",tx=>tx.query("select public.league_snapshot() as value"))).rows[0].value;
  const row=data.matches.find(m=>m.id===matchId);
  assert.equal(row.mvp_player_id,awards.mvp_player_id);assert.equal(row.runner_up_mvp_player_id,awards.runner_up_mvp_player_id);
 }
});
await test("create with both awards and delete work without orphaning history",async()=>{
 const id="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
 await role(admin,tx=>tx.query("select public.save_match($1,true,null)",[{...payload,id,mvp_player_id:payload.participants[0].player_id,runner_up_mvp_player_id:payload.participants[5].player_id}]));
 const row=(await db.query("select * from public.matches where id=$1",[id])).rows[0];
 assert.equal(row.runner_up_mvp_player_id,payload.participants[5].player_id);
 await role(admin,tx=>tx.query("delete from public.matches where id=$1",[id]));
 assert.equal((await db.query("select * from public.match_players where match_id=$1",[id])).rows.length,0);
});
await test("direct table API and RPC reject wrong-team and same-player awards",async()=>{
 for(const awards of [
  {mvp_player_id:payload.participants[5].player_id},
  {runner_up_mvp_player_id:payload.participants[0].player_id},
  {mvp_player_id:payload.participants[0].player_id,runner_up_mvp_player_id:payload.participants[0].player_id},
 ]){
  const v=(await db.query("select updated_at::text as v from public.matches where id=$1",[matchId])).rows[0].v;
  await assert.rejects(role(admin,tx=>tx.query("select public.save_match($1,false,$2)",[{...payload,...awards},v])),code("23514"));
  await assert.rejects(role(admin,tx=>tx.query("update public.matches set mvp_player_id=$1,runner_up_mvp_player_id=$2 where id=$3",[awards.mvp_player_id??null,awards.runner_up_mvp_player_id??null,matchId])),code("23514"));
 }
});
await test("Runner-up MVP must participate and foreign key protects player",async()=>{
 const outsider=(await db.query("insert into public.players(name,nickname) values('Outside','OUT') returning id")).rows[0].id;
 await assert.rejects(role(admin,tx=>tx.query("update public.matches set runner_up_mvp_player_id=$1 where id=$2",[outsider,matchId])),code("23514"));
 await assert.rejects(role(admin,tx=>tx.query("update public.matches set runner_up_mvp_player_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' where id=$1",[matchId])),code("23503"));
 await role(admin,tx=>tx.query("update public.matches set mvp_player_id=$1,runner_up_mvp_player_id=$2 where id=$3",[payload.participants[0].player_id,payload.participants[5].player_id,matchId]));
 await assert.rejects(role(admin,tx=>tx.query("delete from public.players where id=$1",[payload.participants[5].player_id])),error=>["23503","23001"].includes(error.code));
});
await test("older clients omit Runner-up without erasing it, while explicit null clears",async()=>{
 const v=(await db.query("select updated_at::text as v from public.matches where id=$1",[matchId])).rows[0].v;
 await role(admin,tx=>tx.query("select public.save_match($1,false,$2)",[{...payload,mvp_player_id:payload.participants[0].player_id},v]));
 assert.equal((await db.query("select runner_up_mvp_player_id from public.matches where id=$1",[matchId])).rows[0].runner_up_mvp_player_id,payload.participants[5].player_id);
});
await test("invalid award on create rolls back match and participants",async()=>{
 const id="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
 await assert.rejects(role(admin,tx=>tx.query("select public.save_match($1,true,null)",[{...payload,id,runner_up_mvp_player_id:payload.participants[0].player_id}])),code("23514"));
 assert.equal((await db.query("select * from public.matches where id=$1",[id])).rows.length,0);
 assert.equal((await db.query("select * from public.match_players where match_id=$1",[id])).rows.length,0);
});
await test("winner and participation changes revalidate both awards at commit",async()=>{
 await assert.rejects(role(admin,tx=>tx.query("update public.matches set winner_team='dire' where id=$1",[matchId])),code("23514"));
 await assert.rejects(role(admin,tx=>tx.query("update public.match_players set team=case team when 'radiant' then 'dire' else 'radiant' end where match_id=$1",[matchId])),code("23514"));
 // Deferred checks permit temporary invalidity when the final transaction is valid.
 await role(admin,async tx=>{
  await tx.query("update public.matches set winner_team='dire' where id=$1",[matchId]);
  await tx.query("update public.matches set mvp_player_id=$1,runner_up_mvp_player_id=$2 where id=$3",[payload.participants[5].player_id,payload.participants[0].player_id,matchId]);
 });
});
await test("admin deletes match and participation cascades",async()=>{
 assert.equal((await role(admin,tx=>tx.query("delete from public.matches where id=$1 returning id",[matchId]))).rows.length,1);
 assert.equal((await db.query("select count(*)::int as n from public.match_players where match_id=$1",[matchId])).rows[0].n,0);
});
await test("historical losing-team award does not block deleting its match",async()=>{
 await role(admin,tx=>tx.query("delete from public.matches where id=$1",[historical.id]));
 assert.equal((await db.query("select * from public.match_players where match_id=$1",[historical.id])).rows.length,0);
});
await test("admin edits league settings",async()=>{
 assert.equal((await role(admin,tx=>tx.query("update public.league_settings set season='Season II' where id=true returning season"))).rows[0].season,"Season II");
});
await test("role revocation immediately blocks database writes with same user identity",async()=>{
 await db.query("update public.profiles set role='viewer' where id=$1",[admin]);
 await assert.rejects(role(admin,tx=>tx.query("insert into public.players(name,nickname) values('No','NO')")),code("42501"));
});
console.log("\n"+passed+" database security/integrity checks passed (PostgreSQL via PGlite).");
}finally{await db.close();}


