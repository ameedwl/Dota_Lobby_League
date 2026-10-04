import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

export async function testRewards({db,role,test,admin,viewer}) {
 const players=[];
 for(let i=0;i<22;i++) players.push((await db.query("insert into public.players(name,nickname) values($1,$1) returning id",['Reward tester '+i])).rows[0].id);
 let sequence=0;
 const create=(group=0,winner='radiant',extra={})=>({id:`f0000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`,played_at:new Date(Date.UTC(2030,0,sequence)).toISOString(),winner_team:winner,participants:players.slice(group*10,group*10+10).map((id,i)=>({player_id:id,team:i<5?'radiant':'dire'})),...extra});
 const save=p=>role(admin,tx=>tx.query('select public.save_match($1,true,null)',[p]));
 const edit=async p=>{const v=(await db.query('select updated_at from public.matches where id=$1',[p.id])).rows[0].updated_at;return role(admin,tx=>tx.query('select public.save_match($1,false,$2)',[p,v]));};
 const rows=async()=> (await db.query('select * from public.reward_rolls order by earned_at,id')).rows;
 const get=async id=>(await db.query('select * from public.reward_rolls where id=$1',[id])).rows[0];
 const roll=(id,who=admin)=>role(who,tx=>tx.query('select public.roll_reward($1) as r',[id])).then(x=>x.rows[0].r);
 const configure=(id,selection,who=admin)=>role(who,tx=>tx.query('select public.configure_reward($1,$2) as r',[id,selection])).then(x=>x.rows[0].r);
 await save(create());await save(create());
 await save(create(1));await save(create(1));await save(create(1));
 const before=(await db.query('select public.league_snapshot() as value')).rows[0].value;
 await db.exec(await readFile(new URL('../supabase/migrations/202610040001_reward_system.sql',import.meta.url),'utf8'));
 await test('reward migration preserves existing history and never backfills',async()=>{
  const after=(await db.query('select public.league_snapshot() as value')).rows[0].value;
  assert.deepEqual(after.rewards,[]);assert.equal(after.reward_catalog.length,11);
  delete after.rewards;delete after.reward_catalog;assert.deepEqual(after,before);
 });
 let third=create();
 await test('existing two-win streak plus new win qualifies all five winners',async()=>{
  await save(third);const r=await rows();assert.equal(r.length,5);assert.ok(r.every(x=>x.status==='available'&&x.qualifying_match_id===third.id));
 });
 await test('old three-win streak does not qualify at win four; win four five six give no extra rolls',async()=>{
  await save(create(1));await save(create());await save(create());await save(create());assert.equal((await rows()).length,5);
 });
 await test('refresh, duplicate save, old edits and backdated inserts do not grant again',async()=>{
  const original=await rows();await role('anon',tx=>tx.query('select public.league_snapshot()'));
  await assert.rejects(save(third),e=>e.code==='23505');await edit({...third,radiant_score:32});
  await save(create(0,'radiant',{played_at:'2020-01-01T00:00:00Z'}));assert.deepEqual(await rows(),original);
 });
 await test('loss resets, first and second wins do not qualify, later third grants again',async()=>{
  await save(create(0,'dire'));await save(create());await save(create());assert.equal((await rows()).length,5);
  await save(create());assert.equal((await rows()).length,10);
 });
 await test('catalog is a synchronized key/config contract with no weights',async()=>{
  const source=await readFile(new URL('../src/lib/rewards.ts',import.meta.url),'utf8');
  const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  const exports={};new Function('exports','require',output)(exports,()=>({}));
  const catalog=(await db.query('select * from public.reward_catalog order by key')).rows;
  assert.deepEqual(catalog,exports.rewardCatalog.map(r=>({key:r.key,configuration:r.configuration,enabled:true})).sort((a,b)=>a.key.localeCompare(b.key)));
  const fn=(await db.query("select prosrc from pg_proc where oid='public.roll_reward(uuid)'::regprocedure")).rows[0].prosrc;
  assert.match(fn,/offset floor\(random\(\)\*pool_size\)/);assert.doesNotMatch(fn.replace(/--[^\n]*/g,""),/weight/i);
 });
 let available=(await rows())[0];
 for(const who of ['anon',viewer]) await test(who+' can read but cannot roll, configure, cancel or directly mutate rewards',async()=>{
  assert.equal((await role(who,tx=>tx.query('select * from public.reward_rolls'))).rows.length,10);
  for(const query of [()=>roll(available.id,who),()=>configure(available.id,{},who),()=>role(who,tx=>tx.query("select public.cancel_reward($1,'Mistake')",[available.id])),()=>role(who,tx=>tx.query("update public.reward_rolls set status='available'")),()=>role(who,tx=>tx.query("insert into public.reward_rolls(player_id,qualifying_match_snapshot) values($1,$2)",[players[0],third.id]))]) await assert.rejects(query,e=>e.code==='42501');
 });
 await test('even admin cannot bypass immutable transitions through direct table writes',async()=>{
  await assert.rejects(role(admin,tx=>tx.query("update public.reward_rolls set status='available'")),e=>e.code==='42501');
  await assert.rejects(role(admin,tx=>tx.query('delete from public.reward_rolls')),e=>e.code==='42501');
  await assert.rejects(role(admin,tx=>tx.query('update public.reward_catalog set enabled=false')),e=>e.code==='42501');
 });
 await test('empty enabled pool fails without spending an entitlement',async()=>{
  await db.exec('update public.reward_catalog set enabled=false');await assert.rejects(roll(available.id),/No rewards are enabled/);assert.equal((await get(available.id)).status,'available');
  await db.exec('update public.reward_catalog set enabled=true');
 });
 // Superuser fixture setup isolates each reward deterministically, without trying
 // to infer uniformity from a small stochastic sample. Production clients cannot do this.
 const earned=async()=>{
  await save(create(0,'dire'));await save(create());await save(create());await save(create());
  return (await rows()).filter(r=>r.player_id===players[0]&&r.status==='available').at(-1);
 };
 const resultFor=async key=>{
  const e=await earned();await db.query('update public.reward_catalog set enabled=(key=$1)',[key]);
  const r=await roll(e.id);await db.exec('update public.reward_catalog set enabled=true');return r;
 };
 let heroResult,roleResult;
 const cases=[
  ['pick_teams',null],['self_silence',null],['hero_protection',{target_hero_id:97}],['role_priority',{target_role:3}],
  ['role_commander',{target_player_id:players[1],target_role:5}],['silence_someone',{target_player_id:players[1]}],
  ['my_teammate',{target_player_id:players[1]}],['not_with_me',{target_player_id:players[1]}],
  ['random_hero_curse',{target_player_id:players[1]}],['team_swap',{target_player_id:players[0],secondary_target_player_id:players[1]}],
  ['role_roulette',{target_player_id:players[1]}],
 ];
 for(const [key,selection] of cases) await test(key+' rolls once, validates configuration, activates and preserves assignments',async()=>{
  let r=await resultFor(key);assert.equal(r.reward_key,key);assert.equal(r.status,selection?'pending_configuration':'active');
  assert.deepEqual(await roll(r.id),r);
  if(selection){
   await assert.rejects(configure(r.id,{}));
   if(selection.target_player_id&&key!=='team_swap')await assert.rejects(configure(r.id,{...selection,target_player_id:players[0]}),/another player/);
   if(selection.target_player_id)await assert.rejects(configure(r.id,{...selection,target_player_id:'eeeeeeee-0000-4000-8000-000000009999'}),/existing target/);
   if(selection.target_role)for(const bad of [0,6])await assert.rejects(configure(r.id,{...selection,target_role:bad}),/Position 1 through 5/);
   if(key==='hero_protection')await assert.rejects(configure(r.id,{target_hero_id:99999}),/valid hero/);
   if(key==='team_swap')await assert.rejects(configure(r.id,{target_player_id:players[1],secondary_target_player_id:players[1]}),/distinct/);
   if(key==='random_hero_curse')await assert.rejects(configure(r.id,{...selection,target_hero_id:97}),/selected by the server/);
   if(key==='role_roulette')await assert.rejects(configure(r.id,{...selection,target_role:1}),/selected by the server/);
   r=await configure(r.id,selection);assert.equal(r.status,'active');
   assert.deepEqual(await configure(r.id,selection),r);
   assert.deepEqual(await configure(r.id,{target_player_id:players[2],target_role:4,target_hero_id:1}),r);
  }
  if(key==='random_hero_curse'){assert.ok((await db.query('select * from public.hero_catalog where hero_id=$1',[r.target_hero_id])).rows.length);heroResult=r;}
  if(key==='role_roulette'){assert.ok(r.target_role>=1&&r.target_role<=5);roleResult=r;}
  assert.deepEqual(await roll(r.id),r);
 });
 await test('random results survive public snapshot refresh and retry',async()=>{
  const data=(await role('anon',tx=>tx.query('select public.league_snapshot() as v'))).rows[0].v;
  assert.equal(data.rewards.find(r=>r.id===heroResult.id).target_hero_id,heroResult.target_hero_id);
  assert.equal(data.rewards.find(r=>r.id===roleResult.id).target_role,roleResult.target_role);
 });
 await test('owner-scoped reward waits for owner then is consumed by next successful new match',async()=>{
  const r=await resultFor('self_silence');await save(create(1));assert.equal((await get(r.id)).status,'active');
  const match=create();await save(match);assert.equal((await get(r.id)).used_match_id,match.id);
  await save(create());assert.equal((await get(r.id)).used_match_id,match.id);
 });
 await test('targeted reward waits for both participants, failed saves/previews/edits do not consume',async()=>{
  let r=await resultFor('silence_someone');r=await configure(r.id,{target_player_id:players[20]});
  await save(create());assert.equal((await get(r.id)).status,'active');
  const onlyTarget=create(1);onlyTarget.participants[0].player_id=players[20];await save(onlyTarget);assert.equal((await get(r.id)).status,'active');
  const applicable=create();applicable.participants[1].player_id=players[20];
  const duplicate={...applicable,participants:applicable.participants.map(p=>({...p,team:'radiant'}))};
  await assert.rejects(save(duplicate));assert.equal((await get(r.id)).status,'active');
  const heroInvalid={...applicable,participants:applicable.participants.map((p,i)=>({...p,hero_id:i?null:1}))};
  await assert.rejects(save(heroInvalid));assert.equal((await get(r.id)).status,'active');
  await role('anon',tx=>tx.query('select public.league_snapshot()'));assert.equal((await get(r.id)).status,'active');
  // Same payload structure used by confirmed OpenDota save; preview itself never calls save_match.
  await save({...applicable,dota_match_id:'9990000000001'});
  const beforeRetry=await rows();await assert.rejects(save({...create(),dota_match_id:'9990000000001'}),e=>e.code==='23505');assert.deepEqual(await rows(),beforeRetry);
  assert.equal((await get(r.id)).used_match_id,applicable.id);
  const another=await resultFor('self_silence');await edit({...applicable,dota_match_id:'9990000000001',radiant_score:31});assert.equal((await get(another.id)).status,'active');
 });
 await test('swap waits for owner and both configured players without imposing a team-builder',async()=>{
  let r=await resultFor('team_swap');r=await configure(r.id,{target_player_id:players[20],secondary_target_player_id:players[21]});
  const first=create();first.participants[1].player_id=players[20];await save(first);assert.equal((await get(r.id)).status,'active');
  const both=create();both.participants[1].player_id=players[20];both.participants[2].player_id=players[21];await save(both);assert.equal((await get(r.id)).used_match_id,both.id);
 });
 await test('pending configuration remains pending on applicable match creation',async()=>{
  const r=await resultFor('hero_protection');await save(create());assert.equal((await get(r.id)).status,'pending_configuration');
 });
 await test('history survives match deletion and replay does not duplicate eligibility',async()=>{
  const r=await resultFor('self_silence'),match=create();await save(match);
  const previous=await get(r.id);await role(admin,tx=>tx.query('delete from public.matches where id in ($1,$2)',[r.qualifying_match_id,match.id]));
  const after=await get(r.id);assert.equal(after.qualifying_match_id,null);assert.equal(after.used_match_id,null);
  assert.equal(after.qualifying_match_snapshot,previous.qualifying_match_snapshot);assert.equal(after.used_match_snapshot,match.id);assert.equal(after.status,'used');
  await assert.rejects(db.query('insert into public.reward_rolls(player_id,qualifying_match_snapshot) values($1,$2)',[r.player_id,r.qualifying_match_snapshot]),e=>e.code==='23505');
  await assert.rejects(role(admin,tx=>tx.query('delete from public.players where id=$1',[players[0]])),e=>['23503','23001'].includes(e.code));
 });
 await test('admin correction keeps original outcome and cannot create a reroll',async()=>{
  const r=await resultFor('role_roulette');await assert.rejects(role(admin,tx=>tx.query("select public.cancel_reward($1,'')",[r.id])),/correction reason/);
  await role(admin,tx=>tx.query("select public.cancel_reward($1,'Wrong recorded result')",[r.id]));const cancelled=await get(r.id);
  assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.reward_key,r.reward_key);assert.equal(cancelled.cancel_reason,'Wrong recorded result');
  await assert.rejects(roll(r.id),/cancelled/);await assert.rejects(configure(r.id,{target_player_id:players[1]}),/cancelled/);
 });
}
