import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
export async function migrateHeroes(db,test) {
 const before=(await db.query("select public.league_snapshot() as value")).rows[0].value;
 await db.exec(await readFile(new URL("../supabase/migrations/202609270001_hero_stats.sql",import.meta.url),"utf8"));
 await test("hero migration preserves history and adds empty ban lists",async()=>{
  const after=(await db.query("select public.league_snapshot() as value")).rows[0].value;
  after.matches.forEach(m=>{assert.deepEqual(m.bans,[]);delete m.bans;});assert.deepEqual(after,before);
 });
}
export async function testHeroes({db,role,test,admin,viewer,players}) {
 const id="eeeeeeee-0000-4000-8000-000000000027";
 const payload={id,winner_team:"radiant",played_at:"2026-09-27T12:00:00Z",mvp_player_id:players[0].id,runner_up_mvp_player_id:players[5].id,participants:players.slice(0,10).map((p,i)=>({player_id:p.id,team:i<5?"radiant":"dire",hero_id:i+1})),bans:[{team:"radiant",hero_id:11},{team:"dire",hero_id:12}]};
 const version=async()=>(await db.query("select updated_at from public.matches where id=$1",[id])).rows[0].updated_at;
 const update=async(p)=>{const v=await version();return role(admin,tx=>tx.query("select public.save_match($1,false,$2)",[p,v]));};
 await test("admin saves all ten heroes plus bans atomically with awards",async()=>{
  await role(admin,tx=>tx.query("select public.save_match($1,true,null)",[payload]));
  assert.equal((await db.query("select * from public.match_bans where match_id=$1",[id])).rows.length,2);
  assert.equal((await db.query("select * from public.match_players where match_id=$1 and hero_id is not null",[id])).rows.length,10);
 });
 await test("hero catalog matches offline selectors and is not user-writable",async()=>{
  const catalog=JSON.parse(await readFile(new URL("../src/lib/hero-catalog.json",import.meta.url),"utf8"));
  assert.deepEqual((await db.query("select hero_id as id,name,slug from public.hero_catalog order by hero_id")).rows,catalog);
  await assert.rejects(role(admin,tx=>tx.query("insert into public.hero_catalog values(9999,'Fake','fake')")),e=>e.code==="42501");
 });
 for(const who of ["anon",viewer]) await test(who+" reads heroes/bans but cannot modify them",async()=>{
  assert.equal((await role(who,tx=>tx.query("select * from public.match_bans where match_id=$1",[id]))).rows.length,2);
  await assert.rejects(role(who,tx=>tx.query("insert into public.match_bans values($1,'dire',13)",[id])),e=>e.code==="42501");
  if(who==="anon") await assert.rejects(role(who,tx=>tx.query("update public.match_players set hero_id=13 where match_id=$1",[id])),e=>e.code==="42501");
  else assert.equal((await role(who,tx=>tx.query("update public.match_players set hero_id=13 where match_id=$1 returning *",[id]))).rows.length,0);
 });
 for(const [name,change,code] of [
  ["partial heroes",{participants:payload.participants.map((p,i)=>({...p,hero_id:i?null:1}))},"23514"],
  ["duplicate heroes",{participants:payload.participants.map(p=>({...p,hero_id:1}))},"23514"],
  ["unknown hero",{participants:payload.participants.map((p,i)=>({...p,hero_id:i?p.hero_id:9999}))},"23503"],
  ["duplicate bans",{bans:[{team:"radiant",hero_id:11},{team:"dire",hero_id:11}]},"23505"],
  ["played/ban conflict",{bans:[{team:"dire",hero_id:1}]},"23514"],
 ]) await test(name+" rejected with atomic rollback",async()=>{
  const before=(await db.query("select public.league_snapshot() as value")).rows[0].value;
  await assert.rejects(update({...payload,...change}),e=>e.code===code);
  assert.deepEqual((await db.query("select public.league_snapshot() as value")).rows[0].value,before);
 });
 await test("direct table writes also enforce complete heroes and conflicts",async()=>{
  await assert.rejects(role(admin,tx=>tx.query("update public.match_players set hero_id=null where match_id=$1 and player_id=$2",[id,players[0].id])),e=>e.code==="23514");
  await assert.rejects(role(admin,tx=>tx.query("insert into public.match_bans values($1,'dire',1)",[id])),e=>e.code==="23514");
 });
 await test("old RPC caller omission preserves existing heroes/bans and awards",async()=>{
  const legacy={...payload};delete legacy.bans;delete legacy.runner_up_mvp_player_id;
  legacy.participants=payload.participants.map(p=>{const copy={...p};delete copy.hero_id;return copy;});await update(legacy);
  assert.equal((await db.query("select count(*)::int as n from public.match_players where match_id=$1 and hero_id is not null",[id])).rows[0].n,10);
  assert.equal((await db.query("select * from public.match_bans where match_id=$1",[id])).rows.length,2);
  assert.equal((await db.query("select runner_up_mvp_player_id from public.matches where id=$1",[id])).rows[0].runner_up_mvp_player_id,players[5].id);
 });
 await test("edit heroes/bans and explicitly remove hero tracking",async()=>{
  await update({...payload,participants:payload.participants.map((p,i)=>({...p,hero_id:i?p.hero_id:13})),bans:[{team:"dire",hero_id:14}]});
  assert.equal((await db.query("select hero_id from public.match_players where match_id=$1 and player_id=$2",[id,players[0].id])).rows[0].hero_id,13);
  await update({...payload,participants:payload.participants.map(p=>({...p,hero_id:null})),bans:[]});
  assert.equal((await db.query("select * from public.match_bans where match_id=$1",[id])).rows.length,0);
 });
 await test("deleting match cascades participant heroes and bans",async()=>{
  await update(payload);await role(admin,tx=>tx.query("delete from public.matches where id=$1",[id]));
  assert.equal((await db.query("select * from public.match_bans where match_id=$1",[id])).rows.length,0);
  assert.equal((await db.query("select * from public.match_players where match_id=$1",[id])).rows.length,0);
 });
}
