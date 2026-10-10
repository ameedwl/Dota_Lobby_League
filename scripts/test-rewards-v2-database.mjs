import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
export async function testRewardsV2({db,role,test,admin,viewer}) {
 const sql=await readFile(new URL('../supabase/migrations/202610100001_reward_milestones_rerolls.sql',import.meta.url),'utf8');
 const resetSql=await readFile(new URL('../supabase/reset-rewards-to-latest-match.sql',import.meta.url),'utf8');
 const snapshot=async()=>(await db.query('select public.league_snapshot() as v')).rows[0].v;
 const existing=await snapshot();await db.exec(sql);
 const get=async id=>(await db.query('select * from public.reward_rolls where id=$1',[id])).rows[0];
 const rows=async()=>(await db.query('select * from public.reward_rolls order by earned_at,id')).rows;
 const streaks=async()=>(await db.query('select * from public.reward_streaks() order by player_id')).rows;
 const rpc=async(name,args,who=admin)=>(await role(who,tx=>tx.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') as r',args))).rows[0].r;
 const players=[];for(let i=0;i<12;i++)players.push((await db.query('insert into public.players(name,nickname) values($1,$1) returning id',['V2 Player '+i])).rows[0].id);
 let sequence=0;
 const make=(winner='radiant',extra={})=>({id:randomUUID(),played_at:new Date(Date.UTC(2040,0,++sequence)).toISOString(),winner_team:winner,participants:players.slice(0,10).map((id,i)=>({player_id:id,team:i<5?'radiant':'dire'})),...extra});
 const save=p=>role(admin,tx=>tx.query('select public.save_match($1,true,null)',[p]));
 const reset=async()=>{try{await db.exec(resetSql);}catch(e){await db.exec('rollback');throw e;}};
 await test('V2 migration preserves all league/reward history and waits for explicit baseline setup',async()=>{
  const after=await snapshot();assert.deepEqual(after.matches,existing.matches);assert.deepEqual(after.settings,existing.settings);assert.equal(after.rewards.length,existing.rewards.length);
  for(const r of after.rewards){assert.equal(r.streak_milestone,3);assert.equal(r.reroll_count,0);}
  assert.equal(after.reward_system_settings.baseline_match_snapshot,null);
  const before=(await rows()).length;await save(make());assert.equal((await rows()).length,before);
 });
 await save(make('dire',{id:'a1000000-0000-4000-8000-000000000002',played_at:'2040-02-01T00:00:00Z'}));
 const baseline=make('radiant',{id:'a1000000-0000-4000-8000-000000000001',played_at:'2040-02-01T00:00:00Z'});await save(baseline);
 const beforeReset=await snapshot();
 await test('manual reset in isolated test DB changes only rewards and includes newest played_at DESC/id ASC baseline',async()=>{
  await reset();const after=await snapshot();assert.deepEqual(after.matches,beforeReset.matches);assert.deepEqual(after.players,beforeReset.players);assert.deepEqual(after.settings,beforeReset.settings);
  assert.equal(after.rewards.length,0);assert.equal(after.reward_system_settings.baseline_match_id,baseline.id);
  for(const r of after.reward_streaks)assert.equal(r.current_streak,players.slice(0,5).includes(r.player_id)?1:0);
  await assert.rejects(reset(),/baseline already exists/);assert.deepEqual((await snapshot()).matches,beforeReset.matches);
 });
 const matches=[baseline];sequence=40;
 await test('streaks 1 through 9 grant only at 3/6/9, with five independent winners and stored milestones',async()=>{
  for(let n=2;n<=9;n++){
   const m=make();matches.push(m);await save(m);
   const mine=(await rows()).filter(r=>r.player_id===players[0]);assert.equal(mine.length,Math.floor(n/3));
   assert.deepEqual(mine.map(r=>r.streak_milestone),Array.from({length:Math.floor(n/3)},(_,i)=>(i+1)*3));
   assert.equal((await rows()).length,Math.floor(n/3)*5);assert.equal((await streaks()).find(s=>s.player_id===players[0]).current_streak,n);
  }
 });
 await test('refresh duplicate imports and historical edits never grant milestones',async()=>{
  const before=await rows();await rpc('league_snapshot',[],'anon');await assert.rejects(save(matches[2]),e=>e.code==='23505');
  const m=matches[2],v=(await db.query('select updated_at from public.matches where id=$1',[m.id])).rows[0].updated_at;
  await role(admin,tx=>tx.query('select public.save_match($1,false,$2)',[{...m,radiant_score:20},v]));
  await save(make('radiant',{played_at:'2039-01-01T00:00:00Z'}));assert.deepEqual(await rows(),before);
 });
 const original=(await rows()).find(r=>r.player_id===players[0]);
 await test('rolling one of three accumulated entitlements leaves the other two available',async()=>{
  await rpc('roll_reward',[original.id]);assert.equal((await rows()).filter(r=>r.player_id===players[0]&&r.status==='available').length,2);
 });
 const grant=(who=admin,request=randomUUID())=>rpc('grant_reward_roll',[players[0],'V2 test',request],who);
 const config=async(r,selection)=>rpc('configure_reward',[r.id,{...selection,expected_revision:r.revision}]);
 const forceRoll=async(key)=>{
  const r=await grant();await db.query('update public.reward_catalog set enabled=(key=$1)',[key]);
  const result=await rpc('roll_reward',[r.id]);await db.exec('update public.reward_catalog set enabled=true');return result;
 };
 let r;
 await test('manual grants are separately labeled, idempotent on retry, and never alter streaks',async()=>{
  const before=await streaks(),id=randomUUID(),beforeCount=(await rows()).length;
  r=await grant(admin,id);assert.equal(r.source_type,'ADMIN_GRANT');assert.equal(r.streak_milestone,null);assert.equal(r.qualifying_match_snapshot,null);assert.equal(r.status,'available');
  assert.deepEqual(await grant(admin,id),r);assert.equal((await rows()).length,beforeCount+1);assert.deepEqual(await streaks(),before);
 });
 for(const who of ['anon',viewer])await test(who+' cannot reroll reset configure cancel grant or change baseline/audit',async()=>{
  for(const [name,args] of [['reroll_reward',[original.id,0,randomUUID()]],['reset_reward_configuration',[original.id,0,randomUUID()]],['grant_reward_roll',[players[0],'',randomUUID()]],['configure_reward',[original.id,{}]],['cancel_reward',[original.id,'Mistake']]])await assert.rejects(rpc(name,args,who),e=>e.code==='42501');
  await assert.rejects(role(who,tx=>tx.query('update public.reward_system_settings set baseline_match_id=null')),e=>e.code==='42501');
  await assert.rejects(role(who,tx=>tx.query('delete from public.reward_admin_audit')),e=>e.code==='42501');
  if(who==='anon')await assert.rejects(role(who,tx=>tx.query('select * from public.reward_admin_audit')),e=>e.code==='42501');
  else assert.equal((await role(who,tx=>tx.query('select * from public.reward_admin_audit'))).rows.length,0);
 });
 let rerolled;
 await test('reroll excludes current result, clears config, preserves entitlement/milestone and records full audit',async()=>{
  // Use a streak-earned entitlement to prove its milestone is preserved.
  const earned=(await rows()).find(x=>x.player_id===players[0]&&x.status==='available'&&x.source_type==='STREAK_MILESTONE');
  await db.query("update public.reward_catalog set enabled=(key='role_commander')");
  let current=await rpc('roll_reward',[earned.id]);current=await config(current,{target_player_id:players[1],target_role:5});
  await db.query("update public.reward_catalog set enabled=key in ('role_commander','hero_protection')");
  const request=randomUUID(),count=(await rows()).length;
  rerolled=await rpc('reroll_reward',[current.id,current.revision,request]);assert.equal(rerolled.reward_key,'hero_protection');assert.equal(rerolled.status,'pending_configuration');
  assert.equal(rerolled.target_player_id,null);assert.equal(rerolled.target_role,null);assert.equal(rerolled.target_hero_id,null);assert.equal(rerolled.secondary_target_player_id,null);
  assert.equal(rerolled.streak_milestone,earned.streak_milestone);assert.equal(rerolled.qualifying_match_snapshot,earned.qualifying_match_snapshot);assert.equal(rerolled.reroll_count,1);assert.equal((await rows()).length,count);
  assert.deepEqual(await rpc('reroll_reward',[current.id,current.revision,request]),rerolled);
  await assert.rejects(rpc('reroll_reward',[current.id,current.revision,randomUUID()]),/changed/);
  await assert.rejects(config(current,{target_hero_id:97}),/changed/);
  const audit=(await role(admin,tx=>tx.query('select * from public.reward_admin_audit where reward_id=$1',[current.id]))).rows;
  assert.equal(audit.length,1);assert.equal(audit[0].previous_result.target_role,5);assert.equal(audit[0].new_result.reward_key,'hero_protection');
  // Current reward excluded, but an earlier reward may return on a later reroll.
  rerolled=await rpc('reroll_reward',[rerolled.id,rerolled.revision,randomUUID()]);assert.equal(rerolled.reward_key,'role_commander');assert.equal(rerolled.reroll_count,2);
  await db.exec('update public.reward_catalog set enabled=true');
 });
 await test('reroll equal odds use the full enabled pool minus current; no alternative leaves state untouched',async()=>{
  const fn=(await db.query("select prosrc from pg_proc where oid='private.choose_reward(text)'::regprocedure")).rows[0].prosrc;
  assert.match(fn,/where enabled and \(p_exclude is null or key<>p_exclude\)/);assert.match(fn,/floor\(random\(\)\*cardinality\(candidates\)\)/);assert.doesNotMatch(fn,/weight/i);
  await db.query('update public.reward_catalog set enabled=(key=$1)',[rerolled.reward_key]);const before=await get(rerolled.id);
  await assert.rejects(rpc('reroll_reward',[rerolled.id,rerolled.revision,randomUUID()]),/No alternative/);assert.deepEqual(await get(rerolled.id),before);await db.exec('update public.reward_catalog set enabled=true');
 });
 await test('configuration reset is confirmed server action, versioned, audited and retry safe',async()=>{
  let a=await config(rerolled,{target_player_id:players[1],target_role:5});const request=randomUUID();
  let pending=await rpc('reset_reward_configuration',[a.id,a.revision,request]);assert.equal(pending.status,'pending_configuration');assert.equal(pending.target_player_id,null);assert.equal(pending.target_role,null);assert.equal(pending.reward_key,a.reward_key);assert.equal(pending.reroll_count,2);
  assert.deepEqual(await rpc('reset_reward_configuration',[a.id,a.revision,request]),pending);
  pending=await config(pending,{target_player_id:players[2],target_role:3});assert.equal(pending.target_player_id,players[2]);assert.equal(pending.target_role,3);
  assert.equal((await db.query("select * from public.reward_admin_audit where reward_id=$1 and action='reset_configuration'",[a.id])).rows.length,1);
 });
 await test('random configuration resets clear stored assignment and allow a new authoritative configuration',async()=>{
  for(const key of ['random_hero_curse','role_roulette']){
   let a=await forceRoll(key);a=await config(a,{target_player_id:players[1]});
   const pending=await rpc('reset_reward_configuration',[a.id,a.revision,randomUUID()]);assert.equal(pending.target_hero_id,null);assert.equal(pending.target_role,null);
   const b=await config(pending,{target_player_id:players[2]});assert.equal(b.status,'active');assert.deepEqual(await config(b,{target_player_id:players[3]}),b);
  }
 });
 await test('cancel unused rewards keeps source/milestone/result in history',async()=>{
  const a=await forceRoll('self_silence'),before=await get(a.id);const b=await rpc('cancel_reward',[a.id,'Wrong test configuration']);assert.equal(b.status,'cancelled');assert.equal(b.reward_key,before.reward_key);assert.equal(b.source_type,before.source_type);
  await assert.rejects(rpc('reroll_reward',[a.id,b.revision,randomUUID()]),/unused rolled/);
 });
 await test('used rewards reject all new corrections and consumption remains atomic',async()=>{
  const a=await forceRoll('role_priority'),active=await config(a,{target_role:3});
  const bad=make();bad.participants=bad.participants.map(p=>({...p,team:'radiant'}));await assert.rejects(save(bad));assert.equal((await get(a.id)).status,'active');
  const match=make();await save(match);const used=await get(a.id);assert.equal(used.status,'used');assert.equal(used.used_match_id,match.id);
  await assert.rejects(rpc('reroll_reward',[a.id,used.revision,randomUUID()]),/unused rolled/);
  await assert.rejects(rpc('reset_reward_configuration',[a.id,used.revision,randomUUID()]),/active unused/);
  await assert.rejects(config(used,{target_role:2}),/immutable/);await assert.rejects(rpc('cancel_reward',[a.id,'Mistake']),/immutable/);assert.deepEqual(await get(a.id),used);
  assert.ok(used.revision>active.revision);
 });
 await test('loss resets reward streak; a new three-win streak grants another milestone',async()=>{
  await save(make('dire'));assert.equal((await streaks()).find(s=>s.player_id===players[0]).current_streak,0);
  const before=(await rows()).filter(r=>r.player_id===players[0]&&r.source_type==='STREAK_MILESTONE').length;
  await save(make());await save(make());assert.equal((await rows()).filter(r=>r.player_id===players[0]&&r.source_type==='STREAK_MILESTONE').length,before);
  await save(make());assert.equal((await rows()).filter(r=>r.player_id===players[0]&&r.source_type==='STREAK_MILESTONE').length,before+1);
 });
 await test('deleting baseline preserves cutoff snapshot and never reintroduces older games',async()=>{
  await role(admin,tx=>tx.query('delete from public.matches where id=$1',[baseline.id]));
  const s=(await snapshot()).reward_system_settings;assert.equal(s.baseline_match_id,null);assert.equal(s.baseline_match_snapshot,baseline.id);assert.equal((await streaks()).find(x=>x.player_id===players[0]).current_streak,3);
 });
}
